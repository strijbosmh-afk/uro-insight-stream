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
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("user_x_connection_status")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data || data.revoked_at) return null;
    return data;
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
  .handler(async ({ context }) => {
    await revoke(context.userId);
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
    return rows ?? [];
  });

// Touch supabaseAdmin to keep import-protection happy if needed elsewhere.
void supabaseAdmin;