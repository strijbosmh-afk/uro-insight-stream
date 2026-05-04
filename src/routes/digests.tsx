import { createFileRoute } from "@tanstack/react-router";
import { DigestsList } from "@/components/digests/DigestsList";

export const Route = createFileRoute("/digests")({
  head: () => ({ meta: [{ title: "Digests — UroFeed" }] }),
  component: DigestsPage,
});

function DigestsPage() {
  return <DigestsList />;
}