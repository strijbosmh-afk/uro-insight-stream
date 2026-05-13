import { createFileRoute, Outlet, useMatches } from "@tanstack/react-router";
import { CongressGrid } from "@/components/congresses/CongressGrid";
import { buildSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/congresses")({
  head: () =>
    buildSeoHead({
      title: "Congresses",
      description:
        "Track every major urology congress — EAU, AUA, SIU and ESMO-GU — with live session activity, abstracts and AI-curated highlights.",
      path: "/congresses",
    }),
  component: CongressesLayout,
});

function CongressesLayout() {
  // If a child route (e.g. /congresses/$congressId) is matched, render only the child.
  const matches = useMatches();
  const hasChild = matches.some((m) => m.routeId.startsWith("/congresses/"));
  if (hasChild) return <Outlet />;
  return <CongressGrid />;
}