import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type LiveKpis = {
  tweetsLast24h: number;
  tweetsLastHour: number;
  tweetsPerMin: number;
  activeSources: number;
  activeHashtags: number;
};

async function fetchKpis(): Promise<LiveKpis> {
  const now = Date.now();
  const h24 = new Date(now - 24 * 60 * 60_000).toISOString();
  const h1 = new Date(now - 60 * 60_000).toISOString();

  const [
    { count: c24 },
    { count: c1 },
    { count: srcCount },
    { count: tagCount },
  ] = await Promise.all([
    supabase.from("tweets").select("id", { count: "exact", head: true }).gte("created_at", h24),
    supabase.from("tweets").select("id", { count: "exact", head: true }).gte("created_at", h1),
    supabase.from("sources").select("id", { count: "exact", head: true }).eq("active", true),
    supabase.from("hashtags").select("id", { count: "exact", head: true }).eq("active", true),
  ]);

  return {
    tweetsLast24h: c24 ?? 0,
    tweetsLastHour: c1 ?? 0,
    tweetsPerMin: Math.round(((c1 ?? 0) / 60) * 10) / 10,
    activeSources: srcCount ?? 0,
    activeHashtags: tagCount ?? 0,
  };
}

export function useLiveKpis(refetchMs = 30_000) {
  return useQuery({
    queryKey: ["live-kpis"],
    queryFn: fetchKpis,
    refetchInterval: refetchMs,
    staleTime: refetchMs / 2,
  });
}
