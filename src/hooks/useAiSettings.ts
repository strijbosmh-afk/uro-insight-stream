import * as React from "react";

export type AiTone = "neutral" | "clinical" | "conversational";

export interface AiSettings {
  useLive: boolean;
  model: string;
  tone: AiTone;
  language: string;
  maxBullets: number;
  promptTemplate: string;
}

export const DEFAULT_PROMPT_TEMPLATE = [
  "Target: {{sessionTitle}}",
  "Specialty focus: {{specialty}}",
  "",
  "Summarise the following X/Twitter posts in {{language}} with a {{tone}} tone.",
  "Return at most {{maxBullets}} key takeaways, then notable quotes (verbatim, with tweet ids), sentiment, controversies, and open questions.",
  "",
  "Tweets:",
  "{{tweets}}",
].join("\n");

export const DEFAULT_AI_SETTINGS: AiSettings = {
  useLive: true,
  model: "google/gemini-3-flash-preview",
  tone: "clinical",
  language: "English",
  maxBullets: 5,
  promptTemplate: DEFAULT_PROMPT_TEMPLATE,
};

// Models supported by the Lovable AI Gateway.
export const AI_MODELS: { value: string; label: string; note?: string }[] = [
  { value: "google/gemini-3-flash-preview", label: "Gemini 3 Flash (preview)", note: "default · fast" },
  { value: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (preview)", note: "next-gen reasoning" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", note: "deep reasoning" },
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", note: "cheapest" },
  { value: "openai/gpt-5", label: "GPT-5", note: "all-rounder" },
  { value: "openai/gpt-5-mini", label: "GPT-5 Mini" },
  { value: "openai/gpt-5-nano", label: "GPT-5 Nano", note: "fast/cheap" },
  { value: "openai/gpt-5.2", label: "GPT-5.2", note: "latest" },
];

export const AI_TONES: { value: AiTone; label: string }[] = [
  { value: "neutral", label: "Neutral" },
  { value: "clinical", label: "Clinical" },
  { value: "conversational", label: "Conversational" },
];

export const AI_LANGUAGES = [
  "English",
  "French",
  "German",
  "Spanish",
  "Italian",
  "Portuguese",
  "Dutch",
];

const KEY = "urofeed.aiSettings.v1";

export function getAiSettings(): AiSettings {
  if (typeof window === "undefined") return DEFAULT_AI_SETTINGS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_AI_SETTINGS;
    return { ...DEFAULT_AI_SETTINGS, ...(JSON.parse(raw) as Partial<AiSettings>) };
  } catch {
    return DEFAULT_AI_SETTINGS;
  }
}

export function useAiSettings() {
  const [settings, setSettings] = React.useState<AiSettings>(() =>
    getAiSettings(),
  );

  const save = React.useCallback((next: AiSettings) => {
    setSettings(next);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }, []);

  const reset = React.useCallback(
    () => save(DEFAULT_AI_SETTINGS),
    [save],
  );

  return { settings, save, reset };
}

export default useAiSettings;