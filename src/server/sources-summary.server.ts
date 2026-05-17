// Server-only helper that asks the Lovable AI Gateway to produce a short
// markdown briefing across a set of selected sources for a recent time window.
// Returns null on any failure so callers can degrade gracefully.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";
const MAX_TWEETS = 120;
const MAX_TWEET_LEN = 280;

export type SourcesSummaryInput = {
  sourceIds: string[];
  windowStartISO: string;
  windowEndISO: string;
  digestName?: string;
};

export type SourcesSummaryResult = {
  summary: string;
  model: string;
  tweetCount: number;
  sourceCount: number;
};

export async function summarizeSelectedSources(
  input: SourcesSummaryInput,
): Promise<SourcesSummaryResult | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    console.error("[sources-summary] LOVABLE_API_KEY missing");
    return null;
  }
  const sourceIds = Array.from(new Set(input.sourceIds)).slice(0, 200);
  if (sourceIds.length === 0) return null;

  const { data: sources } = await supabaseAdmin
    .from("sources")
    .select("id, handle, display_name")
    .in("id", sourceIds);
  const sourceById = new Map<string, { handle: string; display_name: string | null }>(
    ((sources ?? []) as Array<{ id: string; handle: string; display_name: string | null }>).map(
      (s) => [s.id, { handle: s.handle, display_name: s.display_name }],
    ),
  );

  const { data: tweets } = await supabaseAdmin
    .from("tweets")
    .select("id, source_id, author_handle, text, created_at, like_count, retweet_count, reply_count")
    .in("source_id", sourceIds)
    .gte("created_at", input.windowStartISO)
    .lte("created_at", input.windowEndISO)
    .order("created_at", { ascending: false })
    .limit(600);

  const rows = (tweets ?? []) as Array<{
    id: string;
    source_id: string | null;
    author_handle: string;
    text: string;
    created_at: string;
    like_count: number | null;
    retweet_count: number | null;
    reply_count: number | null;
  }>;
  if (rows.length === 0) return null;

  const engagement = (t: (typeof rows)[number]) =>
    (t.like_count ?? 0) + (t.retweet_count ?? 0) + (t.reply_count ?? 0);
  const top = rows.slice().sort((a, b) => engagement(b) - engagement(a)).slice(0, MAX_TWEETS);

  const lines = top.map((t) => {
    const src = t.source_id ? sourceById.get(t.source_id) : undefined;
    const handle = src?.handle ?? t.author_handle;
    const text = (t.text ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TWEET_LEN);
    return `@${handle}: ${text}`;
  });

  const userPrompt = `You are summarising recent X/Twitter activity from a curated list of urology sources for a clinical digest${
    input.digestName ? ` titled "${input.digestName}"` : ""
  }.

Window: ${input.windowStartISO} → ${input.windowEndISO}
Sources: ${sourceById.size}
Posts considered: ${top.length}

Posts (most-engaged first):
${lines.join("\n")}

Write a concise briefing in markdown with this structure:
- A 2–3 sentence overview opening paragraph.
- "Key themes" — 3 to 5 bullet points, each one sentence, naming the topic in bold.
- "Notable signals" — 2 to 4 bullet points highlighting specific data points, controversies, or upcoming events mentioned.
- "Watch next" — 1 to 2 bullet points on what to follow up on.

Rules:
- Stay precise, neutral, clinically literate. No hype.
- Do not invent facts. If something is unclear, omit it.
- Do not quote tweets verbatim beyond short fragments.
- Keep the whole briefing under 280 words.`;

  try {
    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are a clinical urology summariser. Stay precise, neutral, and avoid hype.",
          },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (res.status === 429) throw new Error("rate_limited");
    if (res.status === 402) throw new Error("payment_required");
    if (!res.ok) {
      console.error("[sources-summary] gateway error", res.status, await res.text().catch(() => ""));
      return null;
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text) return null;
    return {
      summary: text,
      model: MODEL,
      tweetCount: top.length,
      sourceCount: sourceById.size,
    };
  } catch (e) {
    if (e instanceof Error && (e.message === "rate_limited" || e.message === "payment_required")) {
      throw e;
    }
    console.error("[sources-summary] failed", e);
    return null;
  }
}