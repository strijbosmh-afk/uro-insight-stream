import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { listMyPosts } from "@/serverFns/x-credentials";
import { MobileSubPage } from "@/components/shell/MobileSubPage";

export const Route = createFileRoute("/me/posts")({
  head: () => ({ meta: [{ title: "My posts — UroFeed" }] }),
  component: MyPostsPage,
});

function MyPostsPage() {
  const { data: posts, isLoading } = useQuery({
    queryKey: ["my-x-posts"],
    queryFn: () => listMyPosts({ data: { limit: 50 } }),
  });

  return (
    <MobileSubPage title="My posts">
      {isLoading && (
        <div className="text-[12px] font-mono text-text-muted">Loading…</div>
      )}
      {!isLoading && (!posts || posts.length === 0) && (
        <div className="text-[12px] font-mono text-text-muted">
          No posts yet. Use Share to X to publish your first.
        </div>
      )}
      <ul className="flex flex-col gap-2">
        {(posts ?? []).map((p) => (
          <li
            key={p.id}
            className="bg-panel border border-border rounded-[3px] p-3"
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
                {new Date(p.posted_at).toLocaleString()}
              </span>
              <span
                className={
                  "text-[10px] font-mono uppercase tracking-wider " +
                  (p.status === "posted"
                    ? "text-success"
                    : p.status === "failed"
                      ? "text-warning"
                      : "text-text-muted")
                }
              >
                {p.status}
              </span>
            </div>
            <div className="text-[13px] text-text-primary whitespace-pre-wrap line-clamp-3">
              {p.text}
            </div>
            {p.posted_tweet_id && (
              <a
                href={`https://x.com/i/web/status/${p.posted_tweet_id}`}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-[12px] text-accent hover:underline"
              >
                View on X <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {p.error_message && (
              <div className="mt-2 text-[11px] font-mono text-warning">
                {p.error_message}
              </div>
            )}
          </li>
        ))}
      </ul>
    </MobileSubPage>
  );
}
