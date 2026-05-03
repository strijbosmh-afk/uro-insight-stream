import * as React from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import "@/auth/serverFnFetchPatch";

export type AppRole = "admin" | "editor" | "viewer";

export interface UserPreferences {
  default_congress_id: string | null;
  default_source_list_id: string | null;
  summary_tone: string;
  summary_language: string;
  theme_density: "compact" | "comfortable";
  polling_interval_seconds: number;
}

export interface ProfileRow {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  active: boolean;
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
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null);
  const [user, setUser] = React.useState<User | null>(null);
  const [profile, setProfile] = React.useState<ProfileRow | null>(null);
  const [roles, setRoles] = React.useState<AppRole[]>([]);
  const [prefs, setPrefs] = React.useState<UserPreferences | null>(null);
  const [loading, setLoading] = React.useState(true);

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
        }, 0);
      } else {
        setProfile(null);
        setRoles([]);
        setPrefs(null);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
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
    });
    return () => sub.subscription.unsubscribe();
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