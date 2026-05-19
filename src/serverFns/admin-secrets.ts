// Server fns for the super-admin-managed app secrets (today: just
// ANTHROPIC_API_KEY). The raw value never leaves the server — the UI only
// sees `prefix + last_four` so the admin can verify the right key is set.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertSuperAdmin } from "@/server/super-admin.server";
import { invalidateAnthropicCache } from "@/server/anthropic-client.server";

// ---------------------------------------------------------------------------
// Types + shared helpers
// ---------------------------------------------------------------------------

/** Public key name → must match what `getAnthropic()` reads. */
const ANTHROPIC_KEY_NAME = "anthropic_api_key";

export type AnthropicKeyStatus = {
  configured: boolean;
  prefix: string | null;
  last_four: string | null;
  updated_at: string | null;
  updated_by_email: string | null;
};

function maskKey(value: string): { prefix: string; last_four: string } {
  // Anthropic keys start with `sk-ant-`; first 7 is a recognisable prefix.
  // For shorter keys we just take a sensible slice.
  const prefix = value.length > 12 ? value.slice(0, 7) : value.slice(0, Math.min(4, value.length));
  const last_four = value.slice(-4);
  return { prefix, last_four };
}

// Bypass the generated Supabase types — `app_secrets` was added in a
// fresh migration and types.ts hasn't been regenerated. Casting through
// `never` keeps the rest of the codebase type-safe.
type AppSecretRow = {
  key_name: string;
  value: string;
  prefix: string;
  last_four: string;
  updated_by: string | null;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// READ — status only, never the value
// ---------------------------------------------------------------------------

export const getAnthropicKeyStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AnthropicKeyStatus> => {
    await assertSuperAdmin(context.userId);

    const { data } = await supabaseAdmin
      .from("app_secrets" as never)
      .select("prefix, last_four, updated_by, updated_at")
      .eq("key_name", ANTHROPIC_KEY_NAME)
      .maybeSingle();
    const row = data as Pick<
      AppSecretRow,
      "prefix" | "last_four" | "updated_by" | "updated_at"
    > | null;

    if (!row) {
      return {
        configured: false,
        prefix: null,
        last_four: null,
        updated_at: null,
        updated_by_email: null,
      };
    }

    let updated_by_email: string | null = null;
    if (row.updated_by) {
      const { data: user } = await supabaseAdmin.auth.admin.getUserById(row.updated_by);
      updated_by_email = user?.user?.email ?? null;
    }

    return {
      configured: true,
      prefix: row.prefix,
      last_four: row.last_four,
      updated_at: row.updated_at,
      updated_by_email,
    };
  });

// ---------------------------------------------------------------------------
// SET — validates against the live Anthropic API before storing
// ---------------------------------------------------------------------------

const SetSchema = z.object({
  key: z
    .string()
    .min(8, "Key looks too short")
    .max(8192, "Key looks too long")
    .refine((s) => s.trim() === s, "Key has surrounding whitespace"),
});

export const setAnthropicKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SetSchema.parse(d))
  .handler(async ({ data, context }): Promise<AnthropicKeyStatus> => {
    await assertSuperAdmin(context.userId);

    // Validate against the live API before persisting — a typo here would
    // otherwise silently break every LLM-backed feature.
    const client = new Anthropic({ apiKey: data.key });
    try {
      await client.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 16,
        messages: [{ role: "user", content: "ping" }],
      });
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) {
        throw new Error("Invalid key — Anthropic rejected it (401).");
      }
      if (e instanceof Anthropic.PermissionDeniedError) {
        throw new Error("Key is missing required permissions (403).");
      }
      if (e instanceof Anthropic.RateLimitError) {
        // The key works but we hit a 429 on the validation ping — store it
        // anyway so the admin isn't blocked by rate limits while testing.
        console.warn("[admin-secrets] validation rate-limited; storing key anyway");
      } else if (e instanceof Anthropic.APIError) {
        throw new Error(`Anthropic rejected the validation call (${e.status ?? "?"}).`);
      } else {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`Validation call failed: ${msg}`);
      }
    }

    const { prefix, last_four } = maskKey(data.key);
    const nowISO = new Date().toISOString();

    const { error } = await supabaseAdmin
      .from("app_secrets" as never)
      .upsert(
        {
          key_name: ANTHROPIC_KEY_NAME,
          value: data.key,
          prefix,
          last_four,
          updated_by: context.userId,
          updated_at: nowISO,
        } as never,
        { onConflict: "key_name" },
      );
    if (error) {
      console.error("[admin-secrets] upsert failed", error);
      throw new Error("Could not save key. Check server logs.");
    }

    // Bust the server's in-memory client cache so the next LLM call picks
    // up the new key immediately instead of waiting up to a minute.
    invalidateAnthropicCache();

    return {
      configured: true,
      prefix,
      last_four,
      updated_at: nowISO,
      updated_by_email: null, // resolved on next status fetch
    };
  });

// ---------------------------------------------------------------------------
// CLEAR — wipes the row + busts the cache. Server falls back to env var.
// ---------------------------------------------------------------------------

export const clearAnthropicKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    await assertSuperAdmin(context.userId);

    const { error } = await supabaseAdmin
      .from("app_secrets" as never)
      .delete()
      .eq("key_name", ANTHROPIC_KEY_NAME);
    if (error) {
      console.error("[admin-secrets] delete failed", error);
      throw new Error("Could not clear key.");
    }
    invalidateAnthropicCache();
    return { ok: true };
  });
