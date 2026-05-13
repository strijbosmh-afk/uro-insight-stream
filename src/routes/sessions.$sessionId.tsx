import { createFileRoute } from "@tanstack/react-router";
import { SessionDetail } from "@/components/sessions/SessionDetail";
import { buildSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/sessions/$sessionId")({
  head: ({ params }) =>
    buildSeoHead({
      title: `Session ${params.sessionId}`,
      description: `AI-curated session brief for ${params.sessionId} — abstracts, key takeaways and the underlying urology posts driving the discussion.`,
      path: `/sessions/${params.sessionId}`,
      ogType: "article",
    }),
  component: SessionDetailPage,
});

function SessionDetailPage() {
  const { sessionId } = Route.useParams();
  return <SessionDetail sessionId={sessionId} />;
}