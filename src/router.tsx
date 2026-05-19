import { createRouter, useRouter } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { routeTree } from "./routeTree.gen";

function DefaultErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();

  return (
    <div className="p-6">
      <section className="bg-panel border border-border rounded-[4px] p-6 max-w-lg mx-auto">
        <div className="flex items-start gap-3">
          <div
            aria-hidden
            className="mt-0.5 h-7 w-7 shrink-0 flex items-center justify-center rounded-[3px] border border-destructive/40 bg-destructive/10 text-destructive"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-destructive">
              error
            </div>
            <h2 className="mt-1 text-[15px] font-semibold text-text-primary">
              Something went wrong
            </h2>
            <p className="mt-1 text-[12px] text-text-muted">
              The page couldn't load. Try again, or head back home.
            </p>
            {import.meta.env.DEV && error.message && (
              <pre className="mt-3 max-h-40 overflow-auto rounded-[3px] border border-border bg-bg p-2 text-left font-mono text-[11px] text-destructive">
                {error.message}
              </pre>
            )}
            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={() => {
                  router.invalidate();
                  reset();
                }}
                className="h-7 px-3 inline-flex items-center text-[11px] font-mono uppercase tracking-wider rounded-[3px] border border-accent bg-accent/10 text-accent hover:bg-accent/20"
              >
                Try again
              </button>
              <a
                href="/dashboard"
                className="h-7 px-3 inline-flex items-center text-[11px] font-mono uppercase tracking-wider rounded-[3px] border border-border text-text-muted hover:text-text-primary"
              >
                Go to dashboard
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export const getRouter = () => {
  // Fresh QueryClient per request — avoids leaking data across SSR requests.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Bumped from 15s -> 60s. The vast majority of reference data
        // (sources, congresses, summaries, sessions) doesn't change in
        // seconds, and a tighter staleTime caused remount-refetch storms
        // on every navigation. Live data (`live-tweets`, `live-kpis`)
        // sets its own refetchInterval and is unaffected.
        staleTime: 60_000,
        // Stop garbage-collecting cached query data the instant the
        // last consumer unmounts -- keeps cross-route caches warm so
        // returning to /dashboard or /feed feels instant.
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        // Avoid re-running queries every time a component remounts
        // (e.g. when the user toggles density/density-driven layouts).
        refetchOnMount: false,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Treat preloaded loader data as fresh for 30s. The previous value
    // (0) meant every link hover re-ran loaders for the target route,
    // pegging the network on dense pages like the sidebar/topbar.
    defaultPreloadStaleTime: 30_000,
    defaultErrorComponent: DefaultErrorComponent,
  });

  return router;
};
