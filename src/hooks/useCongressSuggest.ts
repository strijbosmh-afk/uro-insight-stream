import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CongressSuggestion = {
  name: string;
  short_code: string;
  city: string;
  country: string;
  start_date: string;
  end_date: string;
  primary_hashtags: string[];
  status: "upcoming" | "live" | "archived";
  confidence: "high" | "medium" | "low";
  field_confidence: { dates: string; city: string; hashtags: string };
  notes: string;
  already_exists?: boolean;
  existing_id?: string;
};

export type SuggestResponse = {
  matches: CongressSuggestion[];
  no_match?: boolean;
  too_short?: boolean;
  from_cache?: boolean;
  cached_at?: string;
  error?: string;
};

function useDebounced<T>(value: T, delay = 600): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

async function fetchSuggest(query: string): Promise<SuggestResponse> {
  const sessionRes = await supabase.auth.getSession();
  const token = sessionRes.data.session?.access_token;
  const res = await fetch("/api/suggest-congress", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query }),
  });
  if (res.status === 429) {
    return { matches: [], error: "per_user_rate_limit" };
  }
  if (!res.ok) return { matches: [], error: "lookup_failed" };
  return (await res.json()) as SuggestResponse;
}

export function useCongressSuggest(query: string, enabled = true) {
  const debounced = useDebounced(query.trim(), 600);
  const q = useQuery({
    queryKey: ["congress-suggest", debounced],
    enabled: enabled && debounced.length >= 3,
    queryFn: () => fetchSuggest(debounced),
    staleTime: 5 * 60 * 1000,
  });
  return { ...q, debounced };
}