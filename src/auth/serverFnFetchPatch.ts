// Attach the current Supabase access token to all `/_serverFn/*` requests
// so server functions guarded by `requireSupabaseAuth` receive a Bearer token.
// Runs only on the client; safe to import at module top level.

if (typeof window !== "undefined") {
  const w = window as unknown as {
    __SB_FETCH_PATCHED__?: boolean;
    __SB_ACCESS_TOKEN__?: string | null;
    fetch: typeof fetch;
  };
  if (!w.__SB_FETCH_PATCHED__) {
    w.__SB_FETCH_PATCHED__ = true;
    const orig = w.fetch.bind(window);
    w.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      try {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        if (url && url.includes("/_serverFn/")) {
          const token = w.__SB_ACCESS_TOKEN__;
          if (token) {
            const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
            if (!headers.has("authorization")) {
              headers.set("authorization", `Bearer ${token}`);
            }
            return orig(input, { ...(init || {}), headers });
          }
        }
      } catch {
        // fall through to original fetch
      }
      return orig(input, init);
    };
  }
}

export {};