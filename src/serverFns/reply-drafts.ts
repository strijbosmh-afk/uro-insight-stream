// Server fn that returns 3 cached reply drafts for a given parent tweet.
// Drafts are cached in tweet_reply_suggestions for 30 days. Admins can force
// a refresh; everyone else hits the cache (or triggers a one-time generation
// on a cache miss).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertAdmin } from "@/server/admin-middleware.server";
import { computeReplyDrafts, type ReplyDraft } from "@/server/reply-drafts.server";

export type ReplyDraftsResult = {
  drafts: ReplyDraft[];
  computed_at: string;
  model: string;
  cache_hit: boolean;
};

const Schema = z.object({
  tweetId: z.string().min(1).max(64),
  refresh: z.boolean().optional().default(false),
});

export const suggestReplyDrafts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Schema.parse(data))
  .handler(async ({ data, context }): Promise<ReplyDraftsResult> => {
    if (data.refresh) {
      await assertAdmin(context.supabase, context.userId);
    }

    const now = Date.now();

    const { data: cached } = await supabaseAdmin
      .from("tweet_reply_suggestions")
      .select("drafts, computed_at, expires_at, model")
      .eq("tweet_id", data.tweetId)
      .maybeSingle();

    const isFresh =
      cached && new Date(cached.expires_at).getTime() > now;

    if (cached && isFresh && !data.refresh) {
      return {
        drafts: cached.drafts as unknown as ReplyDraft[],
        computed_at: cached.computed_at,
        model: cached.model,
        cache_hit: true,
      };
    }

    // Need to generate. Fetch parent tweet + author bio.
    const { data: tweet, error: tErr } = await supabaseAdmin
      .from("tweets")
      .select("id, text, author_handle, source_id")
      .eq("id", data.tweetId)
      .maybeSingle();
    if (tErr || !tweet) throw new Error("tweet_not_found");

    let bio: string | null = null;
    if (tweet.source_id) {
      const { data: src } = await supabaseAdmin
        .from("sources")
        .select("bio")
        .eq("id", tweet.source_id)
        .maybeSingle();
      bio = src?.bio ?? null;
    }

    const result = await computeReplyDrafts({
      parentText: tweet.text,
      parentAuthor: tweet.author_handle,
      parentAuthorBio: bio,
    });
    if (!result) {
      // If we have stale cache, serve it rather than failing.
      if (cached) {
        return {
          drafts: cached.drafts as unknown as ReplyDraft[],
          computed_at: cached.computed_at,
          model: cached.model,
          cache_hit: true,
        };
      }
      throw new Error("drafts_unavailable");
    }

    const computedAt = new Date(now).toISOString();
    const expiresAt = new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();
    await supabaseAdmin.from("tweet_reply_suggestions").upsert({
      tweet_id: data.tweetId,
      drafts: result.drafts as unknown as never,
      computed_at: computedAt,
      expires_at: expiresAt,
      model: result.model,
    });

    if (data.refresh) {
      await supabaseAdmin.from("admin_audit_log").insert({
        actor_user_id: context.userId,
        action: "reply_drafts.regenerate",
        metadata: { tweet_id: data.tweetId, model: result.model },
      });
    }

    return {
      drafts: result.drafts,
      computed_at: computedAt,
      model: result.model,
      cache_hit: false,
    };
  });