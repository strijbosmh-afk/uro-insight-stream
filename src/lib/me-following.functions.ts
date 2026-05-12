import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type FollowedSource = {
  id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  verified: boolean | null;
  role: string | null;
};

export const listMyFollowedSources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FollowedSource[]> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("user_subscribed_sources")
      .select(
        "source_id, sources(id, handle, display_name, avatar_url, verified, role)",
      )
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<{ sources: FollowedSource | null }>)
      .map((r) => r.sources)
      .filter((s): s is FollowedSource => !!s);
  });