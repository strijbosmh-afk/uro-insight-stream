import { createFileRoute } from "@tanstack/react-router";

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export const Route = createFileRoute("/api/public/hooks/diag-secret-hash")({
  server: {
    handlers: {
      GET: async () => {
        const v = process.env.X_JOB_SECRET ?? "";
        const sha = await sha256Hex(v);
        return Response.json({
          present: v.length > 0,
          length: v.length,
          sha256: sha,
        });
      },
    },
  },
});