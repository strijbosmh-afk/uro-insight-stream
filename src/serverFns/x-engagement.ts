import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { engage, EngagementError } from "@/server/x-engagement.server";

const Schema = z.object({
  tweetId: z.string().trim().min(1).max(64),
  action: z.enum(["like", "unlike", "retweet", "unretweet"]),
});

export const engageWithTweet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Schema.parse(data))
  .handler(async ({ data, context }) => {
    try {
      await engage(context.userId, data.action, data.tweetId);
      return { ok: true as const };
    } catch (e) {
      if (e instanceof EngagementError) {
        return { ok: false as const, code: e.code, message: e.message };
      }
      return {
        ok: false as const,
        code: "internal" as const,
        message: (e as Error).message,
      };
    }
  });