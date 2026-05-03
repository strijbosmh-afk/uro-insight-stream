// Server helper: extract drug / trial / intervention entities from a
// session title + abstract titles using the Lovable AI Gateway.
//
// Called on session creation/edit to populate `sessions.entities`. The
// matcher then uses this vocabulary as a free, deterministic match step
// (Audit recommendation #5).

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash-lite";

const ENTITY_TOOL = {
  type: "function",
  function: {
    name: "emit_entities",
    description:
      "Return a deduplicated list of drugs, clinical trials, procedures, " +
      "and named medical outcomes mentioned in the input. Skip generic " +
      "words like 'survival', 'response', 'phase 3'.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        entities: {
          type: "array",
          items: { type: "string" },
          description:
            "Each entity is a short noun phrase or trial code. " +
            "Examples: 'enzalutamide', 'TALAPRO-2', 'CAPITELLO-281', " +
            "'Retzius-sparing RARP', 'lutetium-177'.",
        },
      },
      required: ["entities"],
    },
  },
};

export async function extractSessionEntities(input: {
  title: string;
  abstractTitles?: string[];
  chairs?: string[];
}): Promise<string[]> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return [];
  const userText = [
    `Session title: ${input.title}`,
    input.chairs?.length ? `Chairs: ${input.chairs.join(", ")}` : "",
    input.abstractTitles?.length
      ? `Abstract titles:\n${input.abstractTitles.map((t) => `- ${t}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

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
              "Extract concrete medical entities (drugs, trials, procedures, " +
              "outcomes) from the input. Always emit via the emit_entities function.",
          },
          { role: "user", content: userText },
        ],
        tools: [ENTITY_TOOL],
        tool_choice: { type: "function", function: { name: "emit_entities" } },
        temperature: 0,
      }),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      choices?: Array<{
        message?: {
          tool_calls?: Array<{ function?: { arguments?: string } }>;
        };
      }>;
    };
    const argsJson = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!argsJson) return [];
    const parsed = JSON.parse(argsJson) as { entities?: string[] };
    return (parsed.entities ?? [])
      .map((e) => e.trim())
      .filter((e) => e.length >= 3 && e.length <= 80);
  } catch {
    return [];
  }
}

/** Re-extract and persist entities for a single session by id. */
export async function refreshSessionEntities(sessionId: string): Promise<string[]> {
  const { data: sess } = await supabaseAdmin
    .from("sessions")
    .select("id, title, chairs, abstract_ids")
    .eq("id", sessionId)
    .maybeSingle();
  if (!sess) return [];
  const session = sess as {
    id: string;
    title: string;
    chairs: string[];
    abstract_ids: string[];
  };
  const { data: abs } = await supabaseAdmin
    .from("abstracts")
    .select("title")
    .in("id", session.abstract_ids);
  const abstractTitles = ((abs ?? []) as Array<{ title: string }>).map((a) => a.title);
  const entities = await extractSessionEntities({
    title: session.title,
    chairs: session.chairs,
    abstractTitles,
  });
  if (entities.length > 0) {
    await supabaseAdmin
      .from("sessions")
      .update({ entities } as never)
      .eq("id", session.id);
  }
  return entities;
}
