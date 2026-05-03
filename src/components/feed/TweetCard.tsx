import * as React from "react";
import { CheckCircle2, Heart, MessageCircle, Repeat2, ExternalLink } from "lucide-react";
import { RoleBadge } from "@/components/sources/RoleBadge";
import { cn } from "@/lib/utils";
import type { Source, Tweet } from "@/types";
import { feedNowMs } from "./feedClock";
import { HandleChip } from "@/components/handles/HandleChip";

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
}

export const TweetCard = React.memo(function TweetCard({
  tweet,
  source,
  isNew,
}: Props) {
  const handle = source?.handle.replace(/^@/, "") ?? "unknown";
  const display = source?.displayName ?? "Unknown source";

  return (
    <article
      className={cn(
        "relative border border-border bg-panel rounded-[3px] p-3",
        "hover:border-accent/40 transition-colors",
        isNew && "tweet-new",
      )}
    >
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

          <p className="mt-1.5 text-[13px] leading-relaxed text-text-primary whitespace-pre-wrap break-words">
            {highlight(tweet.text)}
          </p>

          {tweet.mediaUrls.length > 0 && (
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {tweet.mediaUrls.slice(0, 4).map((url, i) => (
                <div
                  key={i}
                  className="aspect-video bg-panel-elevated border border-border rounded-[2px] flex items-center justify-center text-[10px] font-mono text-text-muted uppercase tracking-wider"
                >
                  media · {i + 1}
                </div>
              ))}
            </div>
          )}

          <div className="mt-2 flex items-center gap-4 text-[11px] font-mono text-text-muted">
            <span className="flex items-center gap-1">
              <Heart className="w-3 h-3" />
              {compact(tweet.likeCount)}
            </span>
            <span className="flex items-center gap-1">
              <Repeat2 className="w-3 h-3" />
              {compact(tweet.retweetCount)}
            </span>
            <span className="flex items-center gap-1">
              <MessageCircle className="w-3 h-3" />
              {compact(tweet.replyCount)}
            </span>
            <span className="ml-auto uppercase tracking-wider text-text-muted/70">
              {tweet.lang}
            </span>
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="flex items-center gap-1 text-text-muted hover:text-accent"
            >
              View thread
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    </article>
  );
});

export default TweetCard;