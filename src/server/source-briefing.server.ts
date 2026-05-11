// Server-only helper that asks the Lovable AI Gateway to produce a structured
// one-pager briefing on a source's last 30 days of activity. Mirrors the shape
// of computeSourceThemes (same gateway, same tool-call pattern). Returns null
// on any failure so callers can surface a graceful error tile.

export type BriefingTheme = {
  label: string;
  weight: number;
  cancer_area_slug: string | null;
  summary: string;
  example_tweet_ids: string[];
};

export type BriefingStance = {
  position: string;
  evidence_tweet_ids: string[];
  context: string;
};

export type BriefingDisagreement = {
  description: string;
  counterparties: string[];
  evidence_tweet_ids: string[];
};

export type BriefingUpcoming = {
  kind: "congress" | "paper_referenced";
  label: string;
  detail: string;
  starts_at: string | null;
};

export type BriefingPartner = {
  handle: string;
  interaction_kind: "frequent_reply" | "frequent_quote" | "frequent_mention";
  count: number;
};

export type BriefingAngle = {
  angle: string;
  reasoning: string;
  related_tweet_id: string | null;
};

export type SourceBriefing = {
  executive_summary: string;
  main_themes: BriefingTheme[];
  notable_stances: BriefingStance[];
  points_of_disagreement: BriefingDisagreement[];
  upcoming_relevance: BriefingUpcoming[];
  conversation_partners: BriefingPartner[];
  recommended_angles: BriefingAngle[];
  caveats: string | null;
};

export type BriefingInputTweet = {
  id: string;
  text: string;
  hashtags: string[];
  created_at: string;
  like_count: number;
  retweet_count: number;
  reply_count: number;
  tweet_type: string | null;
  parent_handle: string | null;
};

export type BriefingInputCongress = {
  name: string;
  start_date: string | null;
  city: string | null;
  country: string | null;
  role: string | null;
};

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

const TOOL = {
  type: "function" as const,
  function: {
    name: "return_source_briefing",
    description:
      "Return a structured one-page briefing on this source's last 30 days of activity.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: [
        "executive_summary",
        "main_themes",
        "notable_stances",
        "points_of_disagreement",
        "upcoming_relevance",
        "conversation_partners",
        "recommended_angles",
        "caveats",
      ],
      properties: {
        executive_summary: { type: "string" },
        main_themes: {
          type: "array",
          maxItems: 6,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["label", "weight", "cancer_area_slug", "summary", "example_tweet_ids"],
            properties: {
              label: { type: "string" },
              weight: { type: "number", minimum: 0, maximum: 1 },
              cancer_area_slug: { type: ["string", "null"] },
              summary: { type: "string" },
              example_tweet_ids: { type: "array", items: { type: "string" }, maxItems: 3 },
            },
          },
        },
        notable_stances: {
          type: "array",
          maxItems: 6,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["position", "evidence_tweet_ids", "context"],
            properties: {
              position: { type: "string" },
              evidence_tweet_ids: { type: "array", items: { type: "string" }, maxItems: 3 },
              context: { type: "string" },
            },
          },
        },
        points_of_disagreement: {
          type: "array",
          maxItems: 5,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["description", "counterparties", "evidence_tweet_ids"],
            properties: {
              description: { type: "string" },
              counterparties: { type: "array", items: { type: "string" }, maxItems: 5 },
              evidence_tweet_ids: { type: "array", items: { type: "string" }, maxItems: 3 },
            },
          },
        },
        upcoming_relevance: {
          type: "array",
          maxItems: 6,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["kind", "label", "detail", "starts_at"],
            properties: {
              kind: { type: "string", enum: ["congress", "paper_referenced"] },
              label: { type: "string" },
              detail: { type: "string" },
              starts_at: { type: ["string", "null"] },
            },
          },
        },
        conversation_partners: {
          type: "array",
          maxItems: 8,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["handle", "interaction_kind", "count"],
            properties: {
              handle: { type: "string" },
              interaction_kind: {
                type: "string",
                enum: ["frequent_reply", "frequent_quote", "frequent_mention"],
              },
              count: { type: "number", minimum: 1 },
            },
          },
        },
        recommended_angles: {
          type: "array",
          maxItems: 5,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["angle", "reasoning", "related_tweet_id"],
            properties: {
              angle: { type: "string" },
              reasoning: { type: "string" },
              related_tweet_id: { type: ["string", "null"] },
            },
          },
        },
        caveats: { type: ["string", "null"] },
      },
    },
  },
};

export async function computeSourceBriefing(args: {
  handle: string;
  bio: string | null;
  tweets: BriefingInputTweet[];
  cancerAreaSlugs: string[];
  upcomingCongresses: BriefingInputCongress[];
  groupNames: string[];
}): Promise<{ briefing: SourceBriefing; model: string } | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    console.error("[source-briefing] LOVABLE_API_KEY missing");
    return null;
  }
  if (args.tweets.length < 5) return null;

  const tweetsBlock = args.tweets
    .slice(0, 120)
    .map((t) => {
      const eng = `❤${t.like_count}/RT${t.retweet_count}/💬${t.reply_count}`;
      const kind = t.tweet_type && t.tweet_type !== "original" ? ` (${t.tweet_type}${t.parent_handle ? ` to @${t.parent_handle}` : ""})` : "";
      return `[${t.id}] (${t.created_at.slice(0, 10)}) ${eng}${kind} ${t.text.replace(/\s+/g, " ").slice(0, 320)}${
        t.hashtags.length ? ` #${t.hashtags.join(" #")}` : ""
      }`;
    })
    .join("\n");

  const congressBlock = args.upcomingCongresses.length
    ? args.upcomingCongresses
        .map(
          (c) =>
            `- ${c.name}${c.start_date ? ` (${c.start_date})` : ""}${
              c.city || c.country ? ` — ${[c.city, c.country].filter(Boolean).join(", ")}` : ""
            }${c.role ? ` [role: ${c.role}]` : ""}`,
        )
        .join("\n")
    : "(none)";

  const userPrompt = `Prepare a structured briefing on @${args.handle} based on the last 30 days of public X activity.

BIO:
${args.bio?.slice(0, 500) || "(no bio)"}

GROUP MEMBERSHIPS: ${args.groupNames.join(", ") || "(none)"}

VALID CANCER AREA SLUGS (use exactly one of these, or null if no clear fit):
${args.cancerAreaSlugs.join(", ") || "(none)"}

UPCOMING CONGRESSES WHERE THIS SOURCE IS FEATURED:
${congressBlock}

RECENT POSTS (id, date, engagement, kind, text, hashtags):
${tweetsBlock}

Rules:
- Ground every claim in actual tweets — cite tweet IDs (in brackets) as evidence.
- For example_tweet_ids / evidence_tweet_ids / related_tweet_id, only use IDs from the list above.
- main_themes weights are 0-1 and should roughly sum to 1.
- recommended_angles: draw 2-5 specific conversation angles from posts where the source asked a question, expressed uncertainty, or made a strong claim. Avoid generic suggestions like "ask about their research."
- conversation_partners: derive from posts marked as reply/quote with a parent_handle, plus prominent @-mentions in text.
- upcoming_relevance: emit a 'congress' entry for each upcoming congress; tie the detail to themes you observed in recent tweets when possible.
- If a section has no clear evidence, return an empty array (or null for caveats) rather than fabricating.
- caveats: include if data is sparse, mostly retweets, or otherwise limited.`;

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
              "You are a clinical research analyst preparing a colleague to engage thoughtfully with a key opinion leader on X. Produce a structured briefing summarizing this source's activity over the last 30 days. Ground every claim in actual tweets — cite tweet IDs as evidence. Don't speculate beyond what the tweets support. If a section has no clear evidence, return an empty array or null rather than fabricating. Always call the provided tool.",
          },
          { role: "user", content: userPrompt },
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "return_source_briefing" } },
      }),
    });
    if (!res.ok) {
      console.error(
        "[source-briefing] gateway error",
        res.status,
        await res.text().catch(() => ""),
      );
      return null;
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }> } }>;
    };
    const argsStr = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!argsStr) return null;
    const parsed = JSON.parse(argsStr) as Record<string, unknown>;

    const validSlugs = new Set(args.cancerAreaSlugs);
    const validIds = new Set(args.tweets.map((t) => t.id));
    const filterIds = (ids: unknown): string[] =>
      Array.isArray(ids)
        ? (ids as unknown[]).map((x) => String(x)).filter((id) => validIds.has(id)).slice(0, 3)
        : [];

    const main_themes: BriefingTheme[] = Array.isArray(parsed.main_themes)
      ? (parsed.main_themes as unknown[])
          .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
          .map((t) => ({
            label: String(t.label ?? "").slice(0, 100),
            weight: Math.max(0, Math.min(1, Number(t.weight) || 0)),
            cancer_area_slug:
              typeof t.cancer_area_slug === "string" && validSlugs.has(t.cancer_area_slug)
                ? t.cancer_area_slug
                : null,
            summary: String(t.summary ?? "").slice(0, 400),
            example_tweet_ids: filterIds(t.example_tweet_ids),
          }))
          .filter((t) => t.label.length > 0)
          .slice(0, 6)
      : [];

    const notable_stances: BriefingStance[] = Array.isArray(parsed.notable_stances)
      ? (parsed.notable_stances as unknown[])
          .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
          .map((t) => ({
            position: String(t.position ?? "").slice(0, 300),
            evidence_tweet_ids: filterIds(t.evidence_tweet_ids),
            context: String(t.context ?? "").slice(0, 300),
          }))
          .filter((s) => s.position.length > 0)
          .slice(0, 6)
      : [];

    const points_of_disagreement: BriefingDisagreement[] = Array.isArray(
      parsed.points_of_disagreement,
    )
      ? (parsed.points_of_disagreement as unknown[])
          .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
          .map((t) => ({
            description: String(t.description ?? "").slice(0, 300),
            counterparties: Array.isArray(t.counterparties)
              ? (t.counterparties as unknown[])
                  .map((h) => String(h).replace(/^@/, "").toLowerCase())
                  .filter(Boolean)
                  .slice(0, 5)
              : [],
            evidence_tweet_ids: filterIds(t.evidence_tweet_ids),
          }))
          .filter((d) => d.description.length > 0)
          .slice(0, 5)
      : [];

    const upcoming_relevance: BriefingUpcoming[] = Array.isArray(parsed.upcoming_relevance)
      ? (parsed.upcoming_relevance as unknown[])
          .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
          .map((t): BriefingUpcoming => ({
            kind: t.kind === "paper_referenced" ? "paper_referenced" : "congress",
            label: String(t.label ?? "").slice(0, 200),
            detail: String(t.detail ?? "").slice(0, 300),
            starts_at: typeof t.starts_at === "string" ? t.starts_at : null,
          }))
          .filter((u) => u.label.length > 0)
          .slice(0, 6)
      : [];

    const conversation_partners: BriefingPartner[] = Array.isArray(parsed.conversation_partners)
      ? (parsed.conversation_partners as unknown[])
          .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
          .map((t) => ({
            handle: String(t.handle ?? "").replace(/^@/, "").toLowerCase().slice(0, 50),
            interaction_kind:
              t.interaction_kind === "frequent_quote" || t.interaction_kind === "frequent_mention"
                ? (t.interaction_kind as "frequent_quote" | "frequent_mention")
                : ("frequent_reply" as const),
            count: Math.max(1, Math.floor(Number(t.count) || 1)),
          }))
          .filter((p) => p.handle.length > 0)
          .slice(0, 8)
      : [];

    const recommended_angles: BriefingAngle[] = Array.isArray(parsed.recommended_angles)
      ? (parsed.recommended_angles as unknown[])
          .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
          .map((t) => ({
            angle: String(t.angle ?? "").slice(0, 400),
            reasoning: String(t.reasoning ?? "").slice(0, 300),
            related_tweet_id:
              typeof t.related_tweet_id === "string" && validIds.has(t.related_tweet_id)
                ? t.related_tweet_id
                : null,
          }))
          .filter((a) => a.angle.length > 0)
          .slice(0, 5)
      : [];

    const briefing: SourceBriefing = {
      executive_summary: String(parsed.executive_summary ?? "").slice(0, 1200),
      main_themes,
      notable_stances,
      points_of_disagreement,
      upcoming_relevance,
      conversation_partners,
      recommended_angles,
      caveats: typeof parsed.caveats === "string" && parsed.caveats.length > 0 ? parsed.caveats.slice(0, 400) : null,
    };

    if (!briefing.executive_summary) return null;
    return { briefing, model: MODEL };
  } catch (e) {
    console.error("[source-briefing] failed", e);
    return null;
  }
}

// Returns the Monday of the current UTC week as a YYYY-MM-DD string.
export function currentWeekStartUTC(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // getUTCDay: 0=Sun..6=Sat. Shift so 0=Mon.
  const js = d.getUTCDay();
  const offset = js === 0 ? 6 : js - 1;
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}