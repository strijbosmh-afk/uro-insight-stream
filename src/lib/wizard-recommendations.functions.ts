import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type RecommendedCongressRow = {
  congress_id: string;
  weight: number | null;
  note: string | null;
  congress: {
    id: string;
    name: string;
    short_code: string;
    start_date: string | null;
    end_date: string | null;
    city: string | null;
    primary_hashtags: string[];
  } | null;
};

export const listRecommendedCongresses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    const obj = (data ?? {}) as { specialtyIds?: unknown };
    const ids = Array.isArray(obj.specialtyIds)
      ? obj.specialtyIds.filter((x): x is string => typeof x === "string")
      : [];
    return { specialtyIds: ids };
  })
  .handler(async ({ data, context }): Promise<RecommendedCongressRow[]> => {
    const { supabase } = context;
    if (data.specialtyIds.length === 0) return [];
    const { data: recRows, error } = await supabase
      .from("recommended_congresses_by_specialty")
      .select("congress_id, weight, note")
      .in("specialty_id", data.specialtyIds)
      .order("weight", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = (recRows ?? []) as Array<{
      congress_id: string;
      weight: number | null;
      note: string | null;
    }>;
    const ids = Array.from(new Set(rows.map((r) => r.congress_id)));
    if (ids.length === 0) return [];
    const { data: congs, error: cErr } = await supabase
      .from("congresses")
      .select("id, name, short_code, start_date, end_date, city, primary_hashtags")
      .in("id", ids);
    if (cErr) throw new Error(cErr.message);
    const map = new Map(
      ((congs ?? []) as RecommendedCongressRow["congress"][]).map((c) => [c!.id, c!]),
    );
    return rows.map((r) => ({
      congress_id: r.congress_id,
      weight: r.weight,
      note: r.note,
      congress: map.get(r.congress_id) ?? null,
    }));
  });