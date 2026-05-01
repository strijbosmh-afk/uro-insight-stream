import { createFileRoute } from "@tanstack/react-router";
import { CongressDetail } from "@/components/congresses/CongressDetail";

export const Route = createFileRoute("/congresses/$congressId")({
  head: () => ({ meta: [{ title: "Congress — UroFeed" }] }),
  component: CongressDetailPage,
});

function CongressDetailPage() {
  const { congressId } = Route.useParams();
  return <CongressDetail congressId={congressId} />;
}