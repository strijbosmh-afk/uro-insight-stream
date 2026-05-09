import * as React from "react";
import { CheckCircle2, Heart, MessageCircle, Repeat2, ExternalLink, CornerDownRight } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { RoleBadge } from "@/components/sources/RoleBadge";
import { cn } from "@/lib/utils";
import type { Source, Tweet } from "@/types";
import { feedNowMs } from "./feedClock";
import { HandleChip } from "@/components/handles/HandleChip";
import { TweetMedia } from "./TweetMedia";
import { ParentPreview } from "./ParentPreview";
import { ReplyButton } from "@/components/x/ReplyButton";
import { QuoteButton } from "@/components/x/QuoteButton";
import { engageWithTweet } from "@/serverFns/x-engagement";

function relativeTime(iso: string): string {
  const diff = feedNowMs() - new Date(iso).getTime();
  if (diff < 0) return "soon";
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function absoluteTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function highlight(text: string) {
  // Highlight #hashtags and @mentions
  const parts = text.split(/(\s+)/);
  return parts.map((part, i) => {
    if (/^#[A-Za-z0-9_]+$/.test(part)) {
      return (
        <span key={i} className="text-accent font-mono">
          {part}
        </span>
      );
    }
    const m = /^@([A-Za-z0-9_]{1,15})([.,!?:;]*)$/.exec(part);
    if (m) {
      return (
        <React.Fragment key={i}>
          <HandleChip handle={m[1]} variant="inline" />
          {m[2]}
        </React.Fragment>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

function compact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

interface Props {
  tweet: Tweet;
  source?: Source;
  isNew?: boolean;
  isOpened?: boolean;
  onOpenThread?: (tweetId: string) => void;
}

export const TweetCard = React.memo(function TweetCard({
  tweet,
  source,
  isNew,
  isOpened,
  onOpenThread,
}: Props) {
  const handle = source?.handle.replace(/^@/, "") ?? "unknown";
  const display = source?.displayName ?? "Unknown source";
  const tweetUrl = `https://x.com/${handle}/status/${tweet.id}`;
  const tweetType = tweet.tweetType ?? "original";
  const isReply = tweetType === "reply";
  const isQuote = tweetType === "quote";
  const isRetweet = tweetType === "retweet";

  const [liked, setLiked] = React.useState(false);
  const [retweeted, setRetweeted] = React.useState(false);

  const likeMutation = useMutation({
    mutationFn: (next: boolean) =>
      engageWithTweet({
        data: { tweetId: tweet.id, action: next ? "like" : "unlike" },
      }),
    onMutate: (next: boolean) => {
      setLiked(next);
    },
    onSuccess: (res, next) => {
      if (!res.ok) {
        setLiked(!next);
        toast.error(res.message);
      } else {
        toast.success(next ? "Liked on X" : "Removed like");
      }
    },
    onError: (e, next) => {
      setLiked(!next);
      toast.error((e as Error).message);
    },
  });

  const retweetMutation = useMutation({
    mutationFn: (next: boolean) =>
      engageWithTweet({
        data: { tweetId: tweet.id, action: next ? "retweet" : "unretweet" },
      }),
    onMutate: (next: boolean) => {
      setRetweeted(next);
    },
      onSuccess: (res, next) => {
      if (!res.ok) {
        setRetweeted(!next);
        toast.error(res.message);
      } else {
          toast.success(next ? "Reposted on X" : "Removed repost");
      }
    },
    onError: (e, next) => {
      setRetweeted(!next);
      toast.error((e as Error).message);
    },
  });

  const handleClick = (e: React.MouseEvent) => {
    if (!onOpenThread) return;
    // Don't trigger when the user clicked an interactive child (link, button, etc).
    const target = e.target as HTMLElement;
    // Exclude interactive descendants, but not the article itself (it has role="button").
    const interactive = target.closest("a, button, input, textarea, select");
    if (interactive && interactive !== e.currentTarget) return;
    // Don't hijack text selection.
    if (window.getSelection()?.toString()) return;
    onOpenThread(tweet.id);
  };
  const handleKey = (e: React.KeyboardEvent) => {
    if (!onOpenThread) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpenThread(tweet.id);
    }
  };
  return (
    <article
      id={`tweet-${tweet.id}`}
      onClick={onOpenThread ? handleClick : undefined}
      onKeyDown={onOpenThread ? handleKey : undefined}
      role={onOpenThread ? "button" : undefined}
      tabIndex={onOpenThread ? 0 : undefined}
      className={cn(
        "relative border border-border bg-panel rounded-[3px] p-3",
        "transition-all duration-150",
        onOpenThread
          ? "cursor-pointer hover:border-accent hover:bg-panel-elevated hover:ring-1 hover:ring-accent/40 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/60"
          : "hover:border-accent/40",
        isReply && "border-l-2 border-l-accent/60",
        isNew && "tweet-new",
        isOpened &&
          "border-accent ring-2 ring-accent/60 shadow-[0_0_0_4px_color-mix(in_oklab,var(--accent)_15%,transparent)]",
      )}
      title={onOpenThread ? "Click to open thread" : undefined}
    >
      {isReply && tweet.parentHandle && (
        <div className="mb-1.5 flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-text-muted">
          <CornerDownRight className="w-3 h-3" />
          <span>replying to</span>
          <span className="text-accent normal-case tracking-normal">
            @{tweet.parentHandle}
          </span>
        </div>
      )}
      {isRetweet && tweet.parentHandle && (
        <div className="mb-1.5 flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-text-muted">
          <Repeat2 className="w-3 h-3" />
          <span>retweeted by</span>
          <span className="text-accent normal-case tracking-normal">@{handle}</span>
        </div>
      )}
      <div className="flex gap-3">
        <img
          src={source?.avatarUrl}
          alt=""
          loading="lazy"
          className="w-9 h-9 rounded-[3px] border border-border bg-panel-elevated flex-shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[12px] flex-wrap">
            <HandleChip handle={handle} />
            {source?.verified && (
              <CheckCircle2 className="w-3 h-3 text-accent" />
            )}
            <span className="text-text-primary truncate max-w-[180px]">
              {display}
            </span>
            {source && <RoleBadge role={source.role} />}
            <span
              className="ml-auto font-mono text-[11px] text-text-muted"
              title={absoluteTime(tweet.createdAt)}
            >
              {relativeTime(tweet.createdAt)}
            </span>
          </div>

          {isReply && (
            <ParentPreview
              parentHandle={tweet.parentHandle}
              parentText={tweet.parentText}
              parentInDbId={tweet.parentInDbId}
              variant="reply"
            />
          )}

          <p
            className="mt-1.5 text-text-primary whitespace-pre-wrap break-words"
            style={{
              fontSize: "var(--text-size-tweet)",
              lineHeight: "var(--line-height-content)",
            }}
          >
            {highlight(tweet.text)}
          </p>

          <TweetMedia urls={tweet.mediaUrls} tweetUrl={tweetUrl} />

          {isQuote && (tweet.parentHandle || tweet.parentText) && (
            <ParentPreview
              parentHandle={tweet.parentHandle}
              parentText={tweet.parentText}
              parentInDbId={tweet.parentInDbId}
              variant="quote"
            />
          )}

          <div className="mt-2 flex items-center gap-4 text-[11px] font-mono text-text-muted">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                likeMutation.mutate(!liked);
              }}
              disabled={likeMutation.isPending}
              title={liked ? "Unlike on X" : "Like on X"}
              className={cn(
                "flex items-center gap-1 transition-colors hover:text-rose-400",
                liked && "text-rose-400",
              )}
            >
              <Heart className={cn("w-3 h-3", liked && "fill-current")} />
              {compact(tweet.likeCount + (liked ? 1 : 0))}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                retweetMutation.mutate(!retweeted);
              }}
              disabled={retweetMutation.isPending}
              title={retweeted ? "Undo repost" : "Repost on X"}
              className={cn(
                "flex items-center gap-1 transition-colors hover:text-emerald-400",
                retweeted && "text-emerald-400",
              )}
            >
              <Repeat2 className="w-3 h-3" />
              {compact(tweet.retweetCount + (retweeted ? 1 : 0))}
            </button>
            <span className="flex items-center gap-1">
              <MessageCircle className="w-3 h-3" />
              {compact(tweet.replyCount)}
            </span>
            <span className="ml-auto uppercase tracking-wider text-text-muted/70">
              {tweet.lang}
            </span>
            <a
              href={tweetUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-center gap-1 text-text-muted hover:text-accent"
            >
              View on X
              <ExternalLink className="w-3 h-3" />
            </a>
            <ReplyButton
              reply={{ tweetId: tweet.id, authorHandle: handle, text: tweet.text }}
            />
            <QuoteButton tweetUrl={tweetUrl} />
          </div>
        </div>
      </div>
    </article>
  );
});

export default TweetCard;