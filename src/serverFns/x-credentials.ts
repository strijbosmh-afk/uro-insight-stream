import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  verifyAndStore,
  revoke,
} from "@/server/x-credentials.server";
import { postTweet as serverPostTweet, PostTweetError } from "@/server/x-posting.server";

function graphemeLength(s: string): number {
  try {
    const seg = new Intl.Segmenter("en", { granularity: "grapheme" });
    let n = 0;
    for (const _ of seg.segment(s)) n++;
    return n;
  } catch {
    return [...s].length;
  }
}

export const getXConnectionStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data, error } = await supabaseAdmin
      .from("user_x_credentials")
      .select(
        "id, user_id, x_user_id, x_username, last_verified_at, last_post_at, scope_write, post_count_today, post_count_window_start, revoked_at, is_active"
      )
      .eq("user_id", userId)
      .eq("is_active", true)
      .is("revoked_at", null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data || data.revoked_at) return null;
    return data;
  });

export const listXAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data, error } = await supabaseAdmin
      .from("user_x_credentials")
      .select(
        "id, x_user_id, x_username, last_verified_at, last_post_at, scope_write, is_active, revoked_at, created_at"
      )
      .eq("user_id", userId)
      .is("revoked_at", null)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const SwitchSchema = z.object({ accountId: z.string().uuid() });

export const switchActiveXAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SwitchSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    // Verify the account belongs to this user.
    const { data: row, error: selErr } = await supabaseAdmin
      .from("user_x_credentials")
      .select("id")
      .eq("user_id", userId)
      .eq("id", data.accountId)
      .is("revoked_at", null)
      .maybeSingle();
    if (selErr) throw new Error(selErr.message);
    if (!row) throw new Error("Account not found");

    // Deactivate all other accounts first to avoid the unique-active conflict.
    const { error: deactErr } = await supabaseAdmin
      .from("user_x_credentials")
      .update({ is_active: false })
      .eq("user_id", userId)
      .neq("id", data.accountId);
    if (deactErr) throw new Error(deactErr.message);

    const { error: actErr } = await supabaseAdmin
      .from("user_x_credentials")
      .update({ is_active: true })
      .eq("user_id", userId)
      .eq("id", data.accountId);
    if (actErr) throw new Error(actErr.message);

    return { ok: true as const };
  });

const ConnectSchema = z.object({
  consumerKey: z.string().trim().min(10).max(200),
  consumerSecret: z.string().trim().min(20).max(200),
  accessToken: z.string().trim().min(20).max(200),
  accessTokenSecret: z.string().trim().min(20).max(200),
});

export const connectX = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ConnectSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const result = await verifyAndStore({
      userId,
      consumerKey: data.consumerKey,
      consumerSecret: data.consumerSecret,
      accessToken: data.accessToken,
      accessTokenSecret: data.accessTokenSecret,
    });
    if (!result.ok) {
      return { ok: false as const, code: result.code, message: result.message };
    }
    return {
      ok: true as const,
      xUserId: result.xUserId,
      xUsername: result.xUsername,
    };
  });

export const disconnectX = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ accountId: z.string().uuid().optional() }).parse(data ?? {})
  )
  .handler(async ({ data, context }) => {
    await revoke(context.userId, data.accountId);
    return { ok: true };
  });

const PostSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  inReplyToTweetId: z.string().trim().min(1).max(64).optional(),
});

export const postTweet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => PostSchema.parse(data))
  .handler(async ({ data, context }) => {
    const text = data.text;
    const len = graphemeLength(text);
    if (len === 0) {
      return { ok: false as const, code: "empty", message: "Tweet is empty." };
    }
    if (len > 280) {
      return {
        ok: false as const,
        code: "too_long",
        message: `Tweet is ${len} characters; max is 280.`,
      };
    }
    try {
      const out = await serverPostTweet({
        userId: context.userId,
        text,
        inReplyToTweetId: data.inReplyToTweetId,
      });
      return { ok: true as const, id: out.id, url: out.url };
    } catch (e) {
      if (e instanceof PostTweetError) {
        return { ok: false as const, code: e.code, message: e.message };
      }
      return {
        ok: false as const,
        code: "internal",
        message: (e as Error).message,
      };
    }
  });

const ListSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
});

export const listMyPosts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ListSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("user_x_post_log")
      .select("*")
      .eq("user_id", userId)
      .order("posted_at", { ascending: false })
      .limit(data.limit ?? 20);
    if (error) throw new Error(error.message);
    const log = rows ?? [];

    // For demo accounts, also surface the seeded demo_posts that have
    // no matching user_x_post_log entry (the seed inserts only into
    // demo_posts to make the canonical history easy to reset).
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("is_demo")
      .eq("id", userId)
      .maybeSingle();
    if (!prof?.is_demo) return log;

    const seen = new Set(
      log
        .map((r) => (r as { posted_tweet_id: string | null }).posted_tweet_id)
        .filter(Boolean) as string[]
    );
    const { data: demoRows } = await supabaseAdmin
      .from("demo_posts")
      .select("id, text, simulated_tweet_id, posted_at, in_reply_to_tweet_id")
      .eq("user_id", userId)
      .order("posted_at", { ascending: false })
      .limit(data.limit ?? 20);
    const extras = (demoRows ?? [])
      .filter((d) => !seen.has(d.simulated_tweet_id))
      .map((d) => ({
        id: d.id,
        user_id: userId,
        text: d.text,
        in_reply_to_tweet_id: d.in_reply_to_tweet_id,
        status: "sent",
        posted_tweet_id: d.simulated_tweet_id,
        error_code: null,
        error_message: null,
        posted_at: d.posted_at,
      }));
    return [...log, ...extras]
      .sort(
        (a, b) =>
          new Date(b.posted_at as string).getTime() -
          new Date(a.posted_at as string).getTime()
      )
      .slice(0, data.limit ?? 20);
  });

// Touch supabaseAdmin to keep import-protection happy if needed elsewhere.
void supabaseAdmin;