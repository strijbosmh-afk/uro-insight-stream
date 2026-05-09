import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/discover/groups")({
  beforeLoad: () => {
    throw redirect({ to: "/discover", search: { tab: "by-group" } });
  },
});
