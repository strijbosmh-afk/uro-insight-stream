import * as React from "react";

export interface AiSettings {
  useLive: boolean;
  model: string;
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  useLive: false,
  model: "google/gemini-3-flash-preview",
};

export const AI_MODELS: { value: string; label: string; note?: string }[] = [
  { value: "google/gemini-3-flash-preview", label: "Gemini 3 Flash (preview)", note: "default · fast" },
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", note: "deep reasoning" },
  { value: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", note: "cheapest" },
  { value: "openai/gpt-5", label: "GPT-5" },
  { value: "openai/gpt-5-mini", label: "GPT-5 Mini" },
  { value: "openai/gpt-5-nano", label: "GPT-5 Nano" },
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