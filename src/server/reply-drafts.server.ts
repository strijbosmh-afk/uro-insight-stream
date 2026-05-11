// Server-only helper that asks the Lovable AI Gateway for 3 reply drafts in
// fixed registers ("academic question", "supporting context", "methodological
// probe"). The same drafts are cached per parent tweet so cost is bounded
// regardless of how many users open the reply dialog for it.

export type ReplyDraft = {
  register: "academic_question" | "supporting_context" | "methodological_probe";
  label: string;
  text: string;
};

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

const TOOL = {
  type: "function" as const,
  function: {
    name: "return_reply_drafts",
    description: "Return exactly 3 short reply drafts in the requested registers.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["drafts"],
      properties: {
        drafts: {
          type: "array",
          minItems: 3,
          maxItems: 3,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["register", "text"],
            properties: {
              register: {
                type: "string",
                enum: ["academic_question", "supporting_context", "methodological_probe"],
              },
              text: {
                type: "string",
                description: "Reply text, under 240 chars, no leading @handle, no hashtags unless essential.",
              },
            },
          },
        },
      },
    },
  },
};

const REGISTER_LABELS: Record<ReplyDraft["register"], string> = {
  academic_question: "Academic question",
  supporting_context: "Supporting context",
  methodological_probe: "Methodological probe",
};

export async function computeReplyDrafts(args: {
  parentText: string;
  parentAuthor: string;
  parentAuthorBio: string | null;
}): Promise<{ drafts: ReplyDraft[]; model: string } | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    console.error("[reply-drafts] LOVABLE_API_KEY missing");
    return null;
  }
  if (!args.parentText.trim()) return null;

  const userPrompt = `You are drafting reply starters for an oncology professional on X/Twitter. Produce exactly 3 reply drafts to the post below, one in each of these registers:

1. academic_question — a thoughtful, peer-level question that probes a specific claim, dataset, or implication.
2. supporting_context — a brief observation that adds adjacent evidence, prior work, or a useful framing without simply agreeing.
3. methodological_probe — a focused question about study design, cohort, endpoint definition, statistical handling, or generalizability.

PARENT POST author: @${args.parentAuthor}${args.parentAuthorBio ? ` (bio: ${args.parentAuthorBio.slice(0, 200)})` : ""}
PARENT POST text:
${args.parentText.slice(0, 800)}

Rules:
- Each draft under 240 characters.
- No leading @${args.parentAuthor} mention — that's added automatically.
- No emoji. Hashtags only if essential to the substance.
- Specific and substantive — never "Great point!" or "Thanks for sharing".
- Use the post's own terminology. If the post is non-clinical (e.g. a personal note), produce respectful, natural drafts in the same registers.`;

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
              "You draft concise, professional reply starters for clinicians on X. Always call the provided tool with exactly 3 drafts.",
          },
          { role: "user", content: userPrompt },
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "return_reply_drafts" } },
      }),
    });
    if (res.status === 429) throw new Error("rate_limited");
    if (res.status === 402) throw new Error("payment_required");
    if (!res.ok) {
      console.error("[reply-drafts] gateway error", res.status, await res.text().catch(() => ""));
      return null;
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }> } }>;
    };
    const argsStr = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!argsStr) return null;
    const parsed = JSON.parse(argsStr) as { drafts?: unknown };
    if (!Array.isArray(parsed.drafts)) return null;

    const seen = new Set<ReplyDraft["register"]>();
    const drafts: ReplyDraft[] = [];
    for (const raw of parsed.drafts) {
      if (!raw || typeof raw !== "object") continue;
      const r = (raw as Record<string, unknown>).register;
      const text = String((raw as Record<string, unknown>).text ?? "").trim();
      if (
        (r !== "academic_question" && r !== "supporting_context" && r !== "methodological_probe") ||
        !text ||
        seen.has(r)
      ) {
        continue;
      }
      seen.add(r);
      drafts.push({
        register: r,
        label: REGISTER_LABELS[r],
        text: text.replace(/^@\S+\s*/, "").slice(0, 280),
      });
    }
    if (drafts.length !== 3) return null;
    return { drafts, model: MODEL };
  } catch (e) {
    if (e instanceof Error && (e.message === "rate_limited" || e.message === "payment_required")) {
      throw e;
    }
    console.error("[reply-drafts] failed", e);
    return null;
  }
}