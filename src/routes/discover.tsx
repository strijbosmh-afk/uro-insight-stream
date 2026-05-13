import * as React from "react";
import { Link, createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { ForYouTab, type DiscoverFilterState } from "@/components/discover/ForYouTab";
import { GroupsTab } from "@/components/discover/GroupsTab";
import { BySpecialtyTab } from "@/components/discover/BySpecialtyTab";
import { MobileDiscover } from "@/components/discover/MobileDiscover";
import { useIsMobile } from "@/hooks/use-mobile";
import { buildSeoHead } from "@/lib/seo";

const TAB_VALUES = ["for-you", "by-group", "by-specialty"] as const;
type TabValue = (typeof TAB_VALUES)[number];

const searchSchema = z.object({
  tab: z.enum(TAB_VALUES).optional(),
});

const STORAGE_KEY = "urofeed:discover:tab";

export const Route = createFileRoute("/discover")({
  validateSearch: searchSchema,
  head: () =>
    buildSeoHead({
      title: "Discover",
      description:
        "Find new urology voices to follow — by specialty, by curated group, or surfaced from your own feed activity.",
      path: "/discover",
    }),
  component: DiscoverPage,
});

function readStoredTab(): TabValue | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && (TAB_VALUES as readonly string[]).includes(raw)) return raw as TabValue;
  } catch {
    /* ignore */
  }
  return null;
}

function DiscoverPage() {
  const navigate = useNavigate({ from: "/discover" });
  const search = useSearch({ from: "/discover" });
  const { user } = useAuth();
  const isMobile = useIsMobile();

  const { data: hasSpecialties } = useQuery({
    queryKey: ["user-specialties-has", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { count } = await supabase
        .from("user_specialties")
        .select("specialty_id", { count: "exact", head: true })
        .eq("user_id", user!.id);
      return (count ?? 0) > 0;
    },
  });

  // Resolve initial tab if URL has none: localStorage > by-specialty (if user has specialties) > for-you.
  React.useEffect(() => {
    if (search.tab) return;
    if (hasSpecialties === undefined && !!user) return; // wait for query
    const stored = readStoredTab();
    let next: TabValue;
    if (stored) next = stored;
    else if (hasSpecialties) next = "by-specialty";
    else next = "for-you";
    navigate({ search: { tab: next }, replace: true });
  }, [search.tab, hasSpecialties, user, navigate]);

  // Persist whenever tab changes via URL.
  React.useEffect(() => {
    if (!search.tab) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, search.tab);
    } catch {
      /* ignore */
    }
  }, [search.tab]);

  const tab: TabValue = search.tab ?? "for-you";

  // Top-level filter state shared across tabs.
  const [query, setQuery] = React.useState("");
  const [verifiedOnly, setVerifiedOnly] = React.useState(false);
  const [specialtyId, setSpecialtyId] = React.useState<string | "all">("all");

  const { data: mySpecialties = [] } = useQuery({
    queryKey: ["user-specialties-with-meta", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_specialties")
        .select("specialty_id, urology_specialties(id, label)")
        .eq("user_id", user!.id);
      return (data ?? []) as Array<{
        specialty_id: string;
        urology_specialties: { id: string; label: string } | null;
      }>;
    },
  });

  const filters: DiscoverFilterState = { query, verifiedOnly, specialtyId };

  if (isMobile) {
    return (
      <div className="px-4 pt-2">
        <MobileDiscover
          tab={tab}
          onTabChange={(t) => navigate({ search: { tab: t }, replace: true })}
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 max-w-6xl">
      <header>
        <h1 className="font-mono text-sm uppercase tracking-[0.18em] text-text-muted">
          Discover
        </h1>
        <p className="text-text-primary text-lg font-semibold mt-1">
          Find new sources and groups
        </p>
      </header>

      {/* Tabs */}
      <div role="tablist" className="flex items-center gap-1 border-b border-border">
        {([
          { v: "by-specialty", label: "By specialty" },
          { v: "for-you", label: "For you" },
          { v: "by-group", label: "By group" },
        ] as const).map((t) => {
          const active = tab === t.v;
          return (
            <Link
              key={t.v}
              to="/discover"
              search={{ tab: t.v }}
              role="tab"
              aria-selected={active}
              className={
                "px-3 h-9 inline-flex items-center text-[12px] font-mono uppercase tracking-wider border-b-2 -mb-px transition-colors " +
                (active
                  ? "border-accent text-text-primary"
                  : "border-transparent text-text-muted hover:text-text-primary")
              }
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <Input
            placeholder="Search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 text-[12px] pl-7 w-56"
          />
        </div>
        <button
          type="button"
          onClick={() => setVerifiedOnly((v) => !v)}
          className={
            "shrink-0 h-7 px-3 rounded-full border text-[11px] font-mono uppercase tracking-wider transition-colors " +
            (verifiedOnly
              ? "bg-accent/10 border-accent text-accent"
              : "bg-panel border-border text-text-muted hover:text-text-primary")
          }
        >
          Verified only
        </button>
        {mySpecialties.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            <button
              type="button"
              onClick={() => setSpecialtyId("all")}
              className={
                "shrink-0 h-7 px-3 rounded-full border text-[11px] transition-colors " +
                (specialtyId === "all"
                  ? "bg-accent/10 border-accent text-accent"
                  : "bg-panel border-border text-text-muted hover:text-text-primary")
              }
            >
              All specialties
            </button>
            {mySpecialties.map((m) => (
              <button
                key={m.specialty_id}
                type="button"
                onClick={() => setSpecialtyId(m.specialty_id)}
                className={
                  "shrink-0 h-7 px-3 rounded-full border text-[11px] transition-colors " +
                  (specialtyId === m.specialty_id
                    ? "bg-accent/10 border-accent text-accent"
                    : "bg-panel border-border text-text-muted hover:text-text-primary")
                }
              >
                {m.urology_specialties?.label ?? m.specialty_id}
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        {tab === "by-specialty" && <BySpecialtyTab filters={filters} />}
        {tab === "for-you" && <ForYouTab filters={filters} />}
        {tab === "by-group" && <GroupsTab filters={filters} />}
      </div>
    </div>
  );
}