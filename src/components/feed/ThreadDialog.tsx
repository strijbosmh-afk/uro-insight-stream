import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, MessagesSquare } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { feedService } from "@/services/feedService";
import { TweetCard } from "./TweetCard";
import type { Source } from "@/types";

interface Props {
  tweetId: string | null;
  sourcesById: Record<string, Source>;
  onClose: () => void;
}

export function ThreadDialog({ tweetId, sourcesById, onClose }: Props) {
  const open = !!tweetId;
  const { data, isLoading, error } = useQuery({
    queryKey: ["tweet-thread", tweetId],
    enabled: open && !!tweetId,
    queryFn: () => feedService.getTweetThread(tweetId as string),
    staleTime: 30_000,
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col p-0 gap-0 bg-panel border-border">
        <DialogHeader className="px-4 py-3 border-b border-border shrink-0">
          <DialogTitle className="text-[12px] font-mono uppercase tracking-wider text-text-muted flex items-center gap-2">
            <MessagesSquare className="w-3.5 h-3.5 text-accent" />
            Thread {data ? `· ${data.length} ${data.length === 1 ? "post" : "posts"}` : ""}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-auto ios-scroll p-3 space-y-2">
          {isLoading && (
            <div className="flex items-center justify-center py-12 text-text-muted text-[12px]">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Loading thread…
            </div>
          )}
          {error && (
            <div className="text-[12px] text-danger p-3">
              Failed to load thread.
            </div>
          )}
          {data?.map((t) => (
            <div
              key={t.id}
              className={t.id === tweetId ? "ring-1 ring-accent/60 rounded-[3px]" : ""}
            >
              <TweetCard tweet={t} source={sourcesById[t.sourceId]} />
            </div>
          ))}
          {data && data.length === 0 && (
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