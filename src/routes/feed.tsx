import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/shell/PlaceholderPage";

export const Route = createFileRoute("/feed")({
  head: () => ({ meta: [{ title: "Live Feed — UroFeed" }] }),
  component: FeedPage,
});

function FeedPage() {
  return (
    <PlaceholderPage
      title="Live Feed"
      description="Real-time stream of posts from monitored X/Twitter handles and hashtags. Polls every 30s via useLiveData."
    />
  );
}