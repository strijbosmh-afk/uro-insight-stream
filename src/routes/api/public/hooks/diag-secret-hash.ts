import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "crypto";

export const Route = createFileRoute("/api/public/hooks/diag-secret-hash")({
  server: {
    handlers: {
      GET: async () => {
        const v = process.env.X_JOB_SECRET ?? "";
        const sha = createHash("sha256").update(v).digest("hex");
        return Response.json({
          present: v.length > 0,
          length: v.length,
          sha256: sha,
        });
      },
    },
  },
});