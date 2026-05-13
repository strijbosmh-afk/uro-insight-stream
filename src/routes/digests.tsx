import { createFileRoute } from "@tanstack/react-router";
import { DigestsList } from "@/components/digests/DigestsList";
import { buildSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/digests")({
  head: () =>
    buildSeoHead({
      title: "Digests",
      description:
        "Personalised weekly urology digests built from your followed sources, congresses and watchlists — delivered to your inbox.",
      path: "/digests",
    }),
  component: DigestsPage,
});

function DigestsPage() {
  return <DigestsList />;
}