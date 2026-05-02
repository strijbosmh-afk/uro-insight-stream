import type { Tweet, Summary } from "@/types";
import { supabase } from "@/integrations/supabase/client";

export type SummarizeContext = {
  type: "session" | "abstract" | "congress";
  targetId: string;
  title: string;
  specialty?: string;
};

export type SummarizeOptions = {
  maxBullets: number;
  tone: string;
  language: string;
  promptTemplate?: string;
  systemPrompt?: string;
  model?: string;
};

export interface AiService {
  summarize(input: {
    tweets: Tweet[];
    context: SummarizeContext;
    options: SummarizeOptions;
  }): Promise<Summary>;
  ping(model?: string): Promise<{ ok: boolean; text: string; model: string }>;
}

// ------------------------------ Mock service ------------------------------

function genericSummary(
  context: SummarizeContext,
  tweets: Tweet[],
  options: SummarizeOptions,
): Summary {
  const top = tweets.slice(0, options.maxBullets || 5);
  return {
    id: `sum_mock_${context.targetId}_${Date.now().toString(36)}`,
    targetType: context.type,
    targetId: context.targetId,
    bulletPoints: top.map(
      (t, i) => `[mock ${i + 1}] ${t.text.slice(0, 140)}`,
    ),
    keyQuotes: top.slice(0, 3).map((t) => ({
      quote: t.text.slice(0, 200),
      sourceId: t.sourceId,
      tweetId: t.id,
    })),
    sentiment: "neutral",
    controversies: [],
    takeaways: top.slice(0, 3).map((t) => t.text.slice(0, 100)),
    tweetCount: tweets.length,
    generatedAt: new Date().toISOString(),
    modelUsed: `mock:${options.tone}:${options.language}`,
  };
}

export const mockAiService: AiService = {
  async summarize({ tweets, context, options }) {
    await new Promise((r) => setTimeout(r, 400));
    return genericSummary(context, tweets, options);
  },
  async ping(model) {
    await new Promise((r) => setTimeout(r, 200));
    return {
      ok: true,
      text: "Hello from the mock AI service.",
      model: model || "mock",
    };
  },
};

// ----------------------- Live service (edge proxy) -----------------------

function buildUserPrompt(
  tweets: Tweet[],
  context: SummarizeContext,
  options: SummarizeOptions,
): string {
  const tweetBlock = tweets
    .slice(0, 80)
    .map(
      (t) =>
        `- (id:${t.id}) ${t.text.replace(/\s+/g, " ").slice(0, 280)}`,
    )
    .join("\n");

  if (options.promptTemplate) {
    return options.promptTemplate
      .replaceAll("{{sessionTitle}}", context.title)
      .replaceAll("{{specialty}}", context.specialty ?? "urology")
      .replaceAll("{{tweets}}", tweetBlock)
      .replaceAll("{{tone}}", options.tone)
      .replaceAll("{{language}}", options.language)
      .replaceAll("{{maxBullets}}", String(options.maxBullets));
  }

  return [
    `Target (${context.type}): ${context.title}`,
    context.specialty ? `Specialty focus: ${context.specialty}` : "",
    `Language: ${options.language}. Tone: ${options.tone}.`,
    `Return at most ${options.maxBullets} bullet takeaways. Quote tweets verbatim only inside keyQuotes, and reference each quote's tweet id.`,
    "",
    "Tweets:",
    tweetBlock,
  ]
    .filter(Boolean)
    .join("\n");
}

export const lovableGatewayService: AiService = {
  async summarize({ tweets, context, options }) {
    const { data, error } = await supabase.functions.invoke("ai-summarize", {
      body: {
        mode: "summarize",
        model: options.model,
        systemPrompt: options.systemPrompt,
        userPrompt: buildUserPrompt(tweets, context, options),
      },
    });
    if (error) throw new Error(error.message || "AI proxy failed");
    if (!data?.ok || !data?.summary) {
      throw new Error(data?.error || "Malformed AI response");
    }
    const s = data.summary as {
      bulletPoints: string[];
      keyQuotes: { quote: string; tweetId: string }[];
      sentiment: Summary["sentiment"];
      controversies: string[];
      takeaways: string[];
    };
    // Re-attach sourceId by looking up tweetId.
    const byId = new Map(tweets.map((t) => [t.id, t]));
    return {
      id: `sum_live_${context.targetId}_${Date.now().toString(36)}`,
      targetType: context.type,
      targetId: context.targetId,
      bulletPoints: s.bulletPoints ?? [],
      keyQuotes: (s.keyQuotes ?? []).map((q) => ({
        quote: q.quote,
        tweetId: q.tweetId,
        sourceId: byId.get(q.tweetId)?.sourceId ?? "",
      })),
      sentiment: s.sentiment ?? "neutral",
      controversies: s.controversies ?? [],
      takeaways: s.takeaways ?? [],
      tweetCount: tweets.length,
      generatedAt: new Date().toISOString(),
      modelUsed: data.model || "lovable-ai",
    };
  },
  async ping(model) {
    const { data, error } = await supabase.functions.invoke("ai-summarize", {
      body: { mode: "ping", model, message: "Say hello in one short sentence." },
    });
    if (error) throw new Error(error.message || "Ping failed");
    if (!data?.ok) throw new Error(data?.error || "Ping failed");
    return { ok: true, text: data.text as string, model: data.model as string };
  },
};

// ----------------------- Resolver -----------------------

import { getAiSettings } from "@/hooks/useAiSettings";

export function getAiService(): AiService {
  const s = getAiSettings();
  return s.useLive ? lovableGatewayService : mockAiService;
}