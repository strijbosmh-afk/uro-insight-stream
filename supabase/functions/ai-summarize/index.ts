// Edge function: AI summarisation proxy.
// Forwards a structured request to the Lovable AI Gateway (OpenAI-compatible).
// The gateway's API key (LOVABLE_API_KEY) is auto-provisioned; no client-side key.

// CORS allowlist. ALLOWED_ORIGINS is a comma-separated list of exact origins
// or wildcard patterns (e.g. "https://*.lovable.app"). When the request
// Origin matches an entry, we echo it back; otherwise the
// Access-Control-Allow-Origin header is omitted entirely.
function originAllowed(origin: string | null): string | null {
  if (!origin) return null;
  const raw = Deno.env.get("ALLOWED_ORIGINS") ?? "";
  const entries = raw.split(",").map((s) => s.trim()).filter(Boolean);
  for (const entry of entries) {
    if (entry === origin) return origin;
    if (entry.includes("*")) {
      const re = new RegExp(
        "^" + entry.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$",
      );
      if (re.test(origin)) return origin;
    }
  }
  return null;
}
function buildCorsHeaders(req: Request): Record<string, string> {
  const allowed = originAllowed(req.headers.get("origin"));
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
  if (allowed) headers["Access-Control-Allow-Origin"] = allowed;
  return headers;
}

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-3-flash-preview";

interface SummarizeBody {
  mode?: "summarize" | "ping" | "suggest_replies";
  model?: string;
  systemPrompt?: string;
  userPrompt?: string;
  // For ping
  message?: string;
  // For suggest_replies
  parentAuthor?: string;
  parentText?: string;
  draft?: string;
  tone?: string;
}

const SUMMARY_TOOL = {
  type: "function",
  function: {
    name: "emit_summary",
    description:
      "Return a structured clinical summary of the provided social posts.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        bulletPoints: {
          type: "array",
          items: { type: "string" },
          description: "3-7 concise bullet points capturing the key takeaways.",
        },
        keyQuotes: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              quote: { type: "string" },
              tweetId: { type: "string" },
            },
            required: ["quote", "tweetId"],
          },
        },
        sentiment: {
          type: "string",
          enum: ["positive", "mixed", "critical", "neutral"],
        },
        controversies: { type: "array", items: { type: "string" } },
        takeaways: { type: "array", items: { type: "string" } },
      },
      required: [
        "bulletPoints",
        "keyQuotes",
        "sentiment",
        "controversies",
        "takeaways",
      ],
    },
  },
};

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const jsonResponse = (body: unknown, status = 200, _req?: Request) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, req);
  }

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    return jsonResponse(
      { error: "LOVABLE_API_KEY missing on server" },
      500,
    );
  }

  let body: SummarizeBody;
  try {
    body = (await req.json()) as SummarizeBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400, req);
  }

  const model = body.model || DEFAULT_MODEL;
  const mode = body.mode ?? "summarize";

  try {
    if (mode === "ping") {
      const resp = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: "Reply with a single short greeting.",
            },
            { role: "user", content: body.message || "Say hello." },
          ],
        }),
      });
    if (!resp.ok) return passThroughError(resp, jsonResponse);
      const data = await resp.json();
      const text =
        data?.choices?.[0]?.message?.content ?? "(no content)";
      return jsonResponse({ ok: true, model, text }, 200, req);
    }

    if (mode === "suggest_replies") {
      const parentAuthor = body.parentAuthor || "the author";
      const parentText = body.parentText || "";
      const draft = body.draft || "";
      const tone = body.tone || "professional, collegial";
      const sys =
        "You are a clinician on X drafting reply tweets. Write concise, substantive replies (<=270 chars). No hashtags spam, no emojis unless natural, no @mentions (the platform adds them).";
      const user = [
        `Parent tweet by @${parentAuthor}:`,
        parentText,
        "",
        draft ? `User's current draft (improve/vary, do not just echo):\n${draft}` : "",
        "",
        `Tone: ${tone}.`,
        "Generate exactly 3 distinct reply options with different angles (e.g. agree+add, ask a question, offer counterpoint).",
      ]
        .filter(Boolean)
        .join("\n");
      const tool = {
        type: "function",
        function: {
          name: "emit_replies",
          description: "Return 3 reply tweet drafts.",
          parameters: {
            type: "object",
            additionalProperties: false,
            properties: {
              replies: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    text: { type: "string" },
                    angle: { type: "string" },
                  },
                  required: ["text", "angle"],
                },
              },
            },
            required: ["replies"],
          },
        },
      };
      const resp = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: sys },
            { role: "user", content: user },
          ],
          tools: [tool],
          tool_choice: { type: "function", function: { name: "emit_replies" } },
        }),
      });
      if (!resp.ok) return passThroughError(resp, jsonResponse);
      const data = await resp.json();
      const call =
        data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (!call) {
        return jsonResponse({ error: "No tool call in response" }, 502, req);
      }
      let parsed: { replies?: { text: string; angle: string }[] };
      try {
        parsed = JSON.parse(call);
      } catch {
        return jsonResponse({ error: "Failed to parse tool call JSON" }, 502, req);
      }
      return jsonResponse({
        ok: true,
        model,
        replies: (parsed.replies ?? []).slice(0, 3),
      });
    }

    // summarize mode
    const systemPrompt =
      body.systemPrompt ||
      "You are a clinical summariser. Be precise and neutral.";
    const userPrompt = body.userPrompt || "Summarise the provided tweets.";

    const resp = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [SUMMARY_TOOL],
        tool_choice: {
          type: "function",
          function: { name: "emit_summary" },
        },
      }),
    });

    if (!resp.ok) return passThroughError(resp, jsonResponse);

    const data = await resp.json();
    const call =
      data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!call) {
      return jsonResponse(
        { error: "No structured tool call in response", raw: data },
        502,
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(call);
    } catch {
      return jsonResponse(
        { error: "Failed to parse tool call JSON", raw: call },
        502,
      );
    }
    return jsonResponse({ ok: true, model, summary: parsed });
  } catch (err) {
    console.error("ai-summarize error", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Unknown error" },
      500,
    );
  }
});

async function passThroughError(
  resp: Response,
  jsonResponse: (body: unknown, status?: number) => Response,
) {
  const text = await resp.text();
  if (resp.status === 429) {
    return jsonResponse(
      { error: "Rate limit exceeded. Please try again shortly." },
      429,
    );
  }
  if (resp.status === 402) {
    return jsonResponse(
      {
        error:
          "AI credits exhausted. Add credits in Lovable workspace settings.",
      },
      402,
    );
  }
  console.error("Gateway error", resp.status, text);
  return jsonResponse(
    { error: `AI gateway error (${resp.status})`, detail: text },
    502,
  );
}