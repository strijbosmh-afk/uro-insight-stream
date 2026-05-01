import { createFileRoute, Outlet, useMatches } from "@tanstack/react-router";
import { CongressGrid } from "@/components/congresses/CongressGrid";

export const Route = createFileRoute("/congresses")({
  head: () => ({ meta: [{ title: "Congresses — UroFeed" }] }),
  component: CongressesLayout,
});

function CongressesLayout() {
  // If a child route (e.g. /congresses/$congressId) is matched, render only the child.
  const matches = useMatches();
  const hasChild = matches.some((m) => m.routeId.startsWith("/congresses/"));
  if (hasChild) return <Outlet />;
  return <CongressGrid />;
}