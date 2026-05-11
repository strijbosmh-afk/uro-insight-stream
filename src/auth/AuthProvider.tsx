import * as React from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import "@/auth/serverFnFetchPatch";
import { claimInvitation } from "@/serverFns/admin-users";

export type AppRole = "admin" | "editor" | "viewer";

export interface UserPreferences {
  default_congress_id: string | null;
  default_source_list_id: string | null;
  summary_tone: string;
  summary_language: string;
  theme_density: "compact" | "comfortable" | "spacious";
  polling_interval_seconds: number;
  digest_default_frequency: "daily" | "weekly" | "biweekly" | "monthly";
  digest_default_send_hour: number;
  digest_default_timezone: string;
  digests_active_by_default: boolean;
  digests_master_enabled: boolean;
  notify_new_summary: boolean;
  notify_new_tweet_followed_source: boolean;
  notify_weekly_recap: boolean;
  quick_start_dismissed: boolean;
}

export interface ProfileRow {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  active: boolean;
  is_demo?: boolean;
}

export interface AuthCtx {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: ProfileRow | null;
  roles: AppRole[];
  isAdmin: boolean;
  isEditor: boolean; // admin OR editor
  prefs: UserPreferences | null;
  reload: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = React.createContext<AuthCtx | null>(null);

const DEFAULT_PREFS: UserPreferences = {
  default_congress_id: null,
  default_source_list_id: null,
  summary_tone: "clinical",
  summary_language: "English",
  theme_density: "comfortable",
  polling_interval_seconds: 30,
  digest_default_frequency: "weekly",
  digest_default_send_hour: 9,
  digest_default_timezone: "UTC",
  digests_active_by_default: true,
  digests_master_enabled: true,
  notify_new_summary: true,
  notify_new_tweet_followed_source: false,
  notify_weekly_recap: true,
  quick_start_dismissed: false,
};

// Claim a pending invitation if the freshly-signed-in user carries an
// `invitation_token` in their Supabase user_metadata (set by the admin
// inviteUserByEmail call). Idempotent — safe to call on every sign-in.
const CLAIMED_TOKENS = new Set<string>();
async function maybeClaimInvitation(u: User, refresh: () => Promise<void>) {
  const token = (u.user_metadata as { invitation_token?: string } | undefined)
    ?.invitation_token;
  if (!token || CLAIMED_TOKENS.has(token)) return;
  CLAIMED_TOKENS.add(token);
  try {
    await claimInvitation({ data: { token } });
    await refresh();
  } catch (e) {
    // Swallow — invitation may already be accepted/expired. Don't block sign-in.
    console.warn("[invite] claim failed", e);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null);
  const [user, setUser] = React.useState<User | null>(null);
  const [profile, setProfile] = React.useState<ProfileRow | null>(null);
  const [roles, setRoles] = React.useState<AppRole[]>([]);
  const [prefs, setPrefs] = React.useState<UserPreferences | null>(null);
  const [loading, setLoading] = React.useState(true);

  // Apply density body class. Default to `comfortable` to avoid a
  // first-paint flash of the compact (root) sizes for new users.
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const d = prefs?.theme_density ?? "comfortable";
    const body = document.body;
    body.classList.remove("density-compact", "density-comfortable", "density-spacious");
    body.classList.add(`density-${d}`);
  }, [prefs?.theme_density]);

  const loadAux = React.useCallback(async (uid: string) => {
    const [{ data: prof }, { data: roleRows }, { data: pref }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase.from("user_preferences").select("*").eq("user_id", uid).maybeSingle(),
    ]);
    setProfile((prof as ProfileRow | null) ?? null);
    setRoles(((roleRows ?? []) as { role: AppRole }[]).map((r) => r.role));
    setPrefs(pref ? { ...DEFAULT_PREFS, ...(pref as Partial<UserPreferences>) } : DEFAULT_PREFS);
  }, []);

  React.useEffect(() => {
    // 1. Subscribe FIRST, then 2. fetch existing session.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (typeof window !== "undefined") {
        (window as unknown as { __SB_ACCESS_TOKEN__?: string | null }).__SB_ACCESS_TOKEN__ =
          s?.access_token ?? null;
      }
      if (s?.user) {
        // Defer to avoid recursion in the auth callback.
        setTimeout(() => {
          void loadAux(s.user.id);
          void maybeClaimInvitation(s.user, () => loadAux(s.user.id));
        }, 0);
      } else {
        setProfile(null);
        setRoles([]);
        setPrefs(null);
      }
    });
    // Hard timeout so a stalled token-refresh (network blocked, Supabase
    // unreachable, etc.) cannot keep the whole shell stuck in the
    // "checking…" skeleton forever. After 5s we release the gate and let
    // the user see the unauthenticated UI; if the session resolves later,
    // onAuthStateChange will populate state.
    const fallback = setTimeout(() => setLoading(false), 5000);
    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
        setUser(data.session?.user ?? null);
        if (typeof window !== "undefined") {
          (window as unknown as { __SB_ACCESS_TOKEN__?: string | null }).__SB_ACCESS_TOKEN__ =
            data.session?.access_token ?? null;
        }
        if (data.session?.user) {
          void loadAux(data.session.user.id).finally(() => setLoading(false));
        } else {
          setLoading(false);
        }
      })
      .catch((err) => {
        console.warn("[auth] getSession failed", err);
        setLoading(false);
      })
      .finally(() => clearTimeout(fallback));
    return () => {
      clearTimeout(fallback);
      sub.subscription.unsubscribe();
    };
  }, [loadAux]);

  const value = React.useMemo<AuthCtx>(
    () => ({
      loading,
      session,
      user,
      profile,
      roles,
      isAdmin: roles.includes("admin"),
      isEditor: roles.includes("admin") || roles.includes("editor"),
      prefs,
      reload: async () => {
        if (user) await loadAux(user.id);
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [loading, session, user, profile, roles, prefs, loadAux],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}