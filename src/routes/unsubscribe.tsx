import * as React from "react";
import { createFileRoute, useSearch } from "@tanstack/react-router";

export const Route = createFileRoute("/unsubscribe")({
  head: () => ({ meta: [{ title: "Unsubscribe — UroFeed" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : "",
  }),
  component: UnsubscribePage,
});

function UnsubscribePage() {
  const { token } = useSearch({ from: "/unsubscribe" });
  const [status, setStatus] = React.useState<
    "loading" | "valid" | "already" | "invalid" | "submitting" | "done" | "error"
  >("loading");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!token) {
      setStatus("invalid");
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/email/unsubscribe?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!res.ok) {
          setStatus("invalid");
          return;
        }
        if (data.valid) setStatus("valid");
        else if (data.reason === "already_unsubscribed") setStatus("already");
        else setStatus("invalid");
      } catch {
        setStatus("error");
      }
    })();
  }, [token]);

  const handleConfirm = async () => {
    setStatus("submitting");
    try {
      const res = await fetch("/email/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed");
        setStatus("error");
        return;
      }
      if (data.success) setStatus("done");
      else if (data.reason === "already_unsubscribed") setStatus("already");
      else setStatus("error");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setStatus("error");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-6">
      <div
        className="w-full max-w-md p-8"
        style={{
          background: "var(--panel)",
          border: "1px solid var(--border)",
        }}
      >
        <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted mb-2">
          UroFeed · Email preferences
        </div>
        <h1 className="text-xl font-semibold text-text-primary mb-4">
          Unsubscribe
        </h1>
        {status === "loading" && (
          <p className="text-[13px] text-text-muted">Verifying your link…</p>
        )}
        {status === "valid" && (
          <>
            <p className="text-[13px] text-text-primary mb-6">
              Click below to stop receiving emails from UroFeed at this address.
            </p>
            <button
              type="button"
              onClick={handleConfirm}
              className="bg-accent text-bg px-4 py-2 text-[13px] font-medium rounded-[3px] hover:opacity-90"
            >
              Confirm unsubscribe
            </button>
          </>
        )}
        {status === "submitting" && (
          <p className="text-[13px] text-text-muted">Processing…</p>
        )}
        {status === "done" && (
          <p className="text-[13px] text-success">
            You have been unsubscribed. We won't email you again.
          </p>
        )}
        {status === "already" && (
          <p className="text-[13px] text-text-muted">
            This address is already unsubscribed.
          </p>
        )}
        {status === "invalid" && (
          <p className="text-[13px] text-danger">
            This unsubscribe link is invalid or has expired.
          </p>
        )}
        {status === "error" && (
          <p className="text-[13px] text-danger">
            Something went wrong{error ? `: ${error}` : "."}
          </p>
        )}
      </div>
    </div>
  );
}