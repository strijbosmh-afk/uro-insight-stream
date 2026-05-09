import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/discover/")({
  beforeLoad: () => {
    throw redirect({ to: "/discover", search: { tab: "for-you" } });
  },
});
