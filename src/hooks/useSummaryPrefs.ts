import * as React from "react";

export type SummaryTone = "neutral" | "clinical" | "conversational";

export interface SummaryPrefs {
  systemPrompt: string;
  userTemplate: string;
  maxBullets: number;
  tone: SummaryTone;
  language: string;
}

export const DEFAULT_PREFS: SummaryPrefs = {
  systemPrompt:
    "You are a clinical urology summariser. Stay precise, neutral, and avoid hype. Cite tweets verbatim only when quoting.",
  userTemplate: [
    "Session: {{sessionTitle}}",
    "Specialty focus: {{specialty}}",
    "",
    "Summarise the following X/Twitter posts in {{language}} with a {{tone}} tone.",
    "Return at most {{maxBullets}} key takeaways, then notable quotes, sentiment, controversies, and open questions.",
    "",
    "Tweets:",
    "{{tweets}}",
  ].join("\n"),
  maxBullets: 5,
  tone: "clinical",
  language: "English",
};

const KEY = "urofeed.summaryPrefs.v1";

function read(): SummaryPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<SummaryPrefs>) };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function useSummaryPrefs() {
  const [prefs, setPrefs] = React.useState<SummaryPrefs>(() => read());

  const save = React.useCallback((next: SummaryPrefs) => {
    setPrefs(next);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // ignore quota errors
    }
  }, []);

  const reset = React.useCallback(() => save(DEFAULT_PREFS), [save]);

  return { prefs, save, reset };
}

export default useSummaryPrefs;