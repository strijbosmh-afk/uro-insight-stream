import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireCronAuth } from "@/server/cron-auth.server";
import { sendDigestById } from "@/server/digest-sender.server";

const MAX_PER_TICK = 25;

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

export const Route = createFileRoute("/api/public/hooks/send-digests")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = await requireCronAuth(request);
          if (auth) return auth;

          const nowISO = new Date().toISOString();
          const { data: due, error } = await supabaseAdmin
            .from("digest_subscriptions")
            .select("id")
            .eq("is_active", true)
            .lte("next_send_at", nowISO)
            .order("next_send_at", { ascending: true })
            .limit(MAX_PER_TICK);
          if (error) throw new Error(error.message);

          const ids = (due ?? []).map((d: { id: string }) => d.id);
          if (ids.length === 0) {
            return jsonResponse({ ok: true, processed: 0 });
          }

          let enqueuedTotal = 0;
          let skippedTotal = 0;
          let failed = 0;

          for (const id of ids) {
            try {
              const r = await sendDigestById(id);
              enqueuedTotal += r.enqueued;
              skippedTotal += r.skipped;
              if (!r.ok) failed += 1;
            } catch (err) {
              console.error(`[send-digests] ${id} failed:`, err);
              failed += 1;
            }
          }

          return jsonResponse({
            ok: true,
            processed: ids.length,
            enqueued: enqueuedTotal,
            skipped: skippedTotal,
            failed,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[send-digests] failed:", message);
          return jsonResponse({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
