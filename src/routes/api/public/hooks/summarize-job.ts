import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Summarization sweep: groups recently ingested tweets by session_id and
// asks the AI gateway for a short bullet summary. Runs every 10 minutes.
export const Route = createFileRoute("/api/public/hooks/summarize-job")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const apiKey = process.env.LOVABLE_API_KEY;
          if (!apiKey) {
            return Response.json({ ok: false, error: "LOVABLE_API_KEY missing" }, { status: 500 });
          }

          const since = new Date(Date.now() - 60 * 60_000).toISOString();
          const { data: tweets, error } = await supabaseAdmin
            .from("tweets")
            .select("id, text, session_id, created_at")
            .gte("ingested_at", since)
            .not("session_id", "is", null)
            .limit(2000);
          if (error) throw new Error(error.message);

          const groups = new Map<string, { id: string; text: string }[]>();
          (tweets ?? []).forEach((t) => {
            if (!t.session_id) return;
            const arr = groups.get(t.session_id) ?? [];
            arr.push({ id: t.id, text: t.text });
            groups.set(t.session_id, arr);
          });

          const summaries: Array<{ sessionId: string; bullets: string[] }> = [];
          for (const [sessionId, items] of groups) {
            if (items.length < 3) continue;
            const prompt = `Summarize these ${items.length} tweets from a medical congress session as 5 short clinical bullets:\n\n${items.slice(0, 50).map((t) => `- ${t.text}`).join("\n")}`;
            const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash",
                messages: [{ role: "user", content: prompt }],
              }),
            });
            if (!res.ok) {
              console.warn(`[summarize-job] AI failed for ${sessionId}: ${res.status}`);
              continue;
            }
            const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
            const text = json.choices?.[0]?.message?.content ?? "";
            const bullets = text
              .split("\n")
              .map((l) => l.replace(/^[-*\d.\s]+/, "").trim())
              .filter(Boolean)
              .slice(0, 5);
            summaries.push({ sessionId, bullets });
          }

          return Response.json({ ok: true, sessions: summaries.length, summaries });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[summarize-job] failed:", message);
          return new Response(JSON.stringify({ ok: false, error: message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
