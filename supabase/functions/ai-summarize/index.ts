// Edge function: AI summarisation proxy.
// Forwards a structured request to the Lovable AI Gateway (OpenAI-compatible).
// The gateway's API key (LOVABLE_API_KEY) is auto-provisioned; no client-side key.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-3-flash-preview";

interface SummarizeBody {
  mode?: "summarize" | "ping";
  model?: string;
  systemPrompt?: string;
  userPrompt?: string;
  // For ping
  message?: string;
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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
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
    return jsonResponse({ error: "Invalid JSON body" }, 400);
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
      if (!resp.ok) return passThroughError(resp);
      const data = await resp.json();
      const text =
        data?.choices?.[0]?.message?.content ?? "(no content)";
      return jsonResponse({ ok: true, model, text });
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

    if (!resp.ok) return passThroughError(resp);

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

async function passThroughError(resp: Response) {
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