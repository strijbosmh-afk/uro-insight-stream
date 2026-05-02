import { Link, Outlet, createRootRouteWithContext, HeadContent, Scripts, useRouterState } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { AppShell } from "@/components/shell/AppShell";
import { AuthProvider, useAuth } from "@/auth/AuthProvider";
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { ShellSkeleton } from "@/components/shell/ShellSkeleton";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "UroFeed — Clinical congress intelligence" },
      { name: "description", content: "AI-powered congress feed for urologists. Track EAU, AUA, SIU and ESMO-GU in real time." },
      { name: "author", content: "UroFeed" },
      { property: "og:title", content: "UroFeed — Clinical congress intelligence" },
      { property: "og:description", content: "AI-powered congress feed for urologists." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  beforeLoad: async ({ location }) => {
    // Bypass redirects for /lovable/* server routes (auth email webhook, preview, etc.)
    if (location.pathname.startsWith("/lovable/")) return;
    // Server-side / loader-side guard. Runs on every navigation including
    // initial deep-link. We only enforce on the client because the Supabase
    // session lives in browser storage; during SSR there's no session to
    // read, so we let the page render and the client AuthGate handles it.
    if (typeof window === "undefined") return;
    const path = location.pathname;
    if (path === "/auth") return;
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const search = new URLSearchParams();
      const target = location.href || path;
      if (target && target !== "/") search.set("redirect", target);
      const qs = search.toString();
      window.location.replace("/auth" + (qs ? `?${qs}` : ""));
      // Throw to abort further loading; the navigation above will replace.
      throw new Error("__redirect_to_auth__");
    }
  },
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuthGate />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function AuthGate() {
  const { user, loading } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const onAuthRoute = pathname === "/auth";

  React.useEffect(() => {
    if (loading) return;
    if (!user && !onAuthRoute) {
      // Preserve the originally-requested URL so we can bounce back after sign-in.
      const here = window.location.pathname + window.location.search;
      const target =
        here && here !== "/"
          ? `/auth?redirect=${encodeURIComponent(here)}`
          : "/auth";
      window.location.replace(target);
    }
    // Note: when authenticated AND on /auth, the /auth page itself handles
    // redirecting (so it can honour ?redirect=… and ?invite=… correctly).
  }, [user, loading, onAuthRoute]);

  if (loading) {
    // Show the full shell with all panels in their loading state — keeps
    // perceived load fast and avoids a flash of blank background.
    return <ShellSkeleton />;
  }

  // /auth route: render its own component (no shell).
  if (onAuthRoute) return <Outlet />;

  // No user — render nothing while AuthGate redirects to /auth.
  if (!user) return null;

  return <AppShell />;
}
