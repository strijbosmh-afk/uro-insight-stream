import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Check, Copy, MessagesSquare, Share2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { feedService } from "@/services/feedService";
import { TweetCard } from "./TweetCard";
import type { Source } from "@/types";
import { toast } from "sonner";

interface Props {
  tweetId: string | null;
  sourcesById: Record<string, Source>;
  onClose: () => void;
}

export function ThreadDialog({ tweetId, sourcesById, onClose }: Props) {
  const open = !!tweetId;
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!open) setCopied(false);
  }, [open, tweetId]);

  const shareUrl = React.useMemo(() => {
    if (!tweetId || typeof window === "undefined") return "";
    const u = new URL(window.location.href);
    u.pathname = "/feed";
    u.search = "";
    u.searchParams.set("thread", tweetId);
    u.hash = "";
    return u.toString();
  }, [tweetId]);

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Link copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy link");
    }
  };

  const handleShare = async () => {
    if (!shareUrl) return;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "Tweet thread", url: shareUrl });
        return;
      } catch {
        // user cancelled or share failed — fall back to copy
      }
    }
    handleCopy();
  };

  const canNativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["tweet-thread", tweetId],
    enabled: open && !!tweetId,
    queryFn: () => feedService.getTweetThread(tweetId as string),
    staleTime: 30_000,
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col p-0 gap-0 bg-panel border-border">
        <DialogHeader className="px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <DialogTitle className="text-[12px] font-mono uppercase tracking-wider text-text-muted flex items-center gap-2 flex-1 min-w-0">
              <MessagesSquare className="w-3.5 h-3.5 text-accent shrink-0" />
              <span className="truncate">
                Thread {data ? `· ${data.length} ${data.length === 1 ? "post" : "posts"}` : ""}
              </span>
            </DialogTitle>
            <div className="flex items-center gap-1 shrink-0 mr-6">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopy}
                disabled={!tweetId}
                className="h-7 px-2 text-[11px] font-mono uppercase tracking-wider text-text-muted hover:text-text-primary"
                title="Copy link to this thread"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3 mr-1 text-accent" />
                    copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3 mr-1" />
                    copy link
                  </>
                )}
              </Button>
              {canNativeShare && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleShare}
                  disabled={!tweetId}
                  className="h-7 px-2 text-[11px] font-mono uppercase tracking-wider text-text-muted hover:text-text-primary"
                  title="Share thread"
                >
                  <Share2 className="w-3 h-3 mr-1" />
                  share
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-auto ios-scroll p-3 space-y-2">
          {isLoading && (
            <div className="space-y-2" aria-label="Loading thread" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="border border-border bg-panel rounded-[3px] p-3"
                >
                  <div className="flex gap-3">
                    <Skeleton className="w-9 h-9 rounded-[3px] flex-shrink-0" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="h-3 w-16" />
                        <Skeleton className="h-3 w-10 ml-auto" />
                      </div>
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-[92%]" />
                      <Skeleton className="h-3 w-[70%]" />
                      <div className="flex items-center gap-3 pt-1">
                        <Skeleton className="h-3 w-8" />
                        <Skeleton className="h-3 w-8" />
                        <Skeleton className="h-3 w-8" />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {error && (
            <div
              role="alert"
              className="border border-danger/40 bg-danger/5 rounded-[3px] p-4 flex flex-col items-center text-center gap-3"
            >
              <AlertTriangle className="w-5 h-5 text-danger" />
              <div className="space-y-1">
                <p className="text-[13px] text-text-primary font-medium">
                  Failed to load thread
                </p>
                <p className="text-[12px] text-text-muted">
                  {error instanceof Error ? error.message : "Something went wrong while fetching this thread."}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                {isFetching ? "Retrying…" : "Retry"}
              </Button>
            </div>
          )}
          {!isLoading && !error && data?.map((t) => (
            <div
              key={t.id}
              className={t.id === tweetId ? "ring-1 ring-accent/60 rounded-[3px]" : ""}
            >
              <TweetCard tweet={t} source={sourcesById[t.sourceId]} />
            </div>
          ))}
          {!isLoading && !error && data && data.length === 0 && (
            <div className="text-[12px] text-text-muted p-3">
              No thread found for this post.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ThreadDialog;