// Server-only helper that asks the Lovable AI Gateway to cluster a source's
// recent posting activity into 3-6 themes, mapping each cluster onto the
// project's cancer_areas taxonomy where possible. Returns null on any
// failure so callers can surface a graceful error tile.

export type SourceTheme = {
  label: string;
  weight: number;
  cancer_area_slug: string | null;
  top_hashtags: string[];
  example_tweet_ids: string[];
};

export type ThemeInputTweet = {
  id: string;
  text: string;
  hashtags: string[];
  created_at: string;
};

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

const TOOL = {
  type: "function" as const,
  function: {
    name: "return_source_themes",
    description: "Return 3-6 thematic clusters describing this source's recent posting activity.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["themes"],
      properties: {
        themes: {
          type: "array",
          minItems: 3,
          maxItems: 6,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["label", "weight", "cancer_area_slug", "top_hashtags", "example_tweet_ids"],
            properties: {
              label: { type: "string", description: "Short human-readable theme name (max 6 words)." },
              weight: { type: "number", minimum: 0, maximum: 1 },
              cancer_area_slug: {
                type: ["string", "null"],
                description: "One of the provided cancer-area slugs, or null if no clear mapping.",
              },
              top_hashtags: { type: "array", items: { type: "string" }, maxItems: 5 },
              example_tweet_ids: { type: "array", items: { type: "string" }, maxItems: 3 },
            },
          },
        },
      },
    },
  },
};

export async function computeSourceThemes(args: {
  bio: string | null;
  tweets: ThemeInputTweet[];
  cancerAreaSlugs: string[];
}): Promise<{ themes: SourceTheme[]; model: string } | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    console.error("[source-themes] LOVABLE_API_KEY missing");
    return null;
  }
  if (args.tweets.length < 5) return null;

  const tweetsBlock = args.tweets
    .slice(0, 100)
    .map(
      (t) =>
        `[${t.id}] (${t.created_at.slice(0, 10)}) ${t.text.replace(/\s+/g, " ").slice(0, 280)}${
          t.hashtags.length ? ` #${t.hashtags.join(" #")}` : ""
        }`,
    )
    .join("\n");

  const userPrompt = `Analyze the following X/Twitter source's recent posting activity and cluster the content into 3-6 thematic groups, ordered by weight (most prominent first).

BIO:
${args.bio?.slice(0, 500) || "(no bio)"}

RECENT POSTS (id, date, text, hashtags):
${tweetsBlock}

VALID CANCER AREA SLUGS (use exactly one of these, or null if no clear fit):
${args.cancerAreaSlugs.join(", ") || "(none)"}

Rules:
- weight is 0-1 representing the share of activity for the theme; weights across themes should roughly sum to 1.
- Use the post id (in brackets) for example_tweet_ids — pick 1-3 of the most representative posts.
- top_hashtags: lowercase, no leading #, max 5.
- cancer_area_slug must be from the provided list or null.
- Theme labels should be specific and clinical (e.g. "Prostate cancer trial updates", not "Cancer research").`;

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
              "You are an oncology-focused content analyst. Cluster posting activity into precise, clinical themes. Always call the provided tool.",
          },
          { role: "user", content: userPrompt },
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "return_source_themes" } },
      }),
    });
    if (!res.ok) {
      console.error("[source-themes] gateway error", res.status, await res.text().catch(() => ""));
      return null;
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }> } }>;
    };
    const argsStr = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!argsStr) return null;
    const parsed = JSON.parse(argsStr) as { themes?: unknown };
    const validSlugs = new Set(args.cancerAreaSlugs);
    const validIds = new Set(args.tweets.map((t) => t.id));
    if (!Array.isArray(parsed.themes)) return null;
    const themes: SourceTheme[] = parsed.themes
      .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
      .map((t) => ({
        label: String(t.label ?? "").slice(0, 80),
        weight: Math.max(0, Math.min(1, Number(t.weight) || 0)),
        cancer_area_slug:
          typeof t.cancer_area_slug === "string" && validSlugs.has(t.cancer_area_slug)
            ? t.cancer_area_slug
            : null,
        top_hashtags: Array.isArray(t.top_hashtags)
          ? (t.top_hashtags as unknown[])
              .map((h) => String(h).replace(/^#+/, "").toLowerCase())
              .filter(Boolean)
              .slice(0, 5)
          : [],
        example_tweet_ids: Array.isArray(t.example_tweet_ids)
          ? (t.example_tweet_ids as unknown[])
              .map((x) => String(x))
              .filter((id) => validIds.has(id))
              .slice(0, 3)
          : [],
      }))
      .filter((t) => t.label.length > 0)
      .slice(0, 6);
    if (themes.length === 0) return null;
    return { themes, model: MODEL };
  } catch (e) {
    console.error("[source-themes] failed", e);
    return null;
  }
}

// Rough mapping from inferred UTC offset (in hours) to a representative IANA
// zone. We label this "inferred" in the UI so users don't over-trust it.
const OFFSET_TO_IANA: Record<number, string> = {
  [-12]: "Pacific/Wake",
  [-11]: "Pacific/Pago_Pago",
  [-10]: "Pacific/Honolulu",
  [-9]: "America/Anchorage",
  [-8]: "America/Los_Angeles",
  [-7]: "America/Denver",
  [-6]: "America/Chicago",
  [-5]: "America/New_York",
  [-4]: "America/Halifax",
  [-3]: "America/Sao_Paulo",
  [-2]: "Atlantic/South_Georgia",
  [-1]: "Atlantic/Azores",
  [0]: "Europe/London",
  [1]: "Europe/Madrid",
  [2]: "Europe/Athens",
  [3]: "Europe/Moscow",
  [4]: "Asia/Dubai",
  [5]: "Asia/Karachi",
  [6]: "Asia/Dhaka",
  [7]: "Asia/Bangkok",
  [8]: "Asia/Singapore",
  [9]: "Asia/Tokyo",
  [10]: "Australia/Sydney",
  [11]: "Pacific/Noumea",
  [12]: "Pacific/Auckland",
};

export function inferTimezoneFromHourly(hourly: number[]): {
  inferred_timezone: string | null;
  offset_hours: number | null;
} {
  if (hourly.length !== 24) return { inferred_timezone: null, offset_hours: null };
  const total = hourly.reduce((a, b) => a + b, 0);
  if (total < 20) return { inferred_timezone: null, offset_hours: null };
  // Find contiguous 6-hour window with lowest activity (proxy for sleep).
  let bestStart = 0;
  let bestSum = Infinity;
  for (let s = 0; s < 24; s++) {
    let sum = 0;
    for (let i = 0; i < 6; i++) sum += hourly[(s + i) % 24];
    if (sum < bestSum) {
      bestSum = sum;
      bestStart = s;
    }
  }
  // Assume sleep midpoint corresponds to ~03:00 local time.
  const sleepMidUtc = (bestStart + 3) % 24;
  // local 03:00 = UTC sleepMidUtc → offset = (3 - sleepMidUtc), normalized to [-12,12].
  let offset = 3 - sleepMidUtc;
  if (offset > 12) offset -= 24;
  if (offset < -12) offset += 24;
  return {
    inferred_timezone: OFFSET_TO_IANA[offset] ?? null,
    offset_hours: offset,
  };
}