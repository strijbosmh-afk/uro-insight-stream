import { createFileRoute } from "@tanstack/react-router";
import { SummariesIndex } from "@/components/summaries/SummariesIndex";
import { buildSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/summaries")({
  head: () =>
    buildSeoHead({
      title: "Summaries",
      description:
        "AI-generated session and topic summaries from the latest urology congresses, ready to scan, share and export.",
      path: "/summaries",
    }),
  component: SummariesPage,
});

function SummariesPage() {
  return <SummariesIndex />;
}