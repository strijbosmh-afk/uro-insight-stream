import { createFileRoute } from "@tanstack/react-router";
import { SessionDetail } from "@/components/sessions/SessionDetail";

export const Route = createFileRoute("/sessions/$sessionId")({
  head: () => ({ meta: [{ title: "Session — UroFeed" }] }),
  component: SessionDetailPage,
});

function SessionDetailPage() {
  const { sessionId } = Route.useParams();
  return <SessionDetail sessionId={sessionId} />;
}