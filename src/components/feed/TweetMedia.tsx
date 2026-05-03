import * as React from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  urls: string[];
  tweetUrl?: string;
}

function MediaCell({
  url,
  tweetUrl,
  onOpen,
  className,
  overlayCount,
}: {
  url: string;
  tweetUrl?: string;
  onOpen: () => void;
  className?: string;
  overlayCount?: number;
}) {
  const [broken, setBroken] = React.useState(false);
  if (broken) {
    return (
      <div
        className={cn(
          "bg-panel-elevated border border-border rounded-[2px] flex items-center justify-center gap-2 text-[10px] font-mono text-text-muted uppercase tracking-wider px-2",
          className,
        )}
      >
        <span>media unavailable</span>
        {tweetUrl && (
          <a
            href={tweetUrl}
            target="_blank"
            rel="noreferrer noopener"
            onClick={(e) => e.stopPropagation()}
            className="text-accent hover:underline inline-flex items-center gap-0.5"
          >
            open on X <ExternalLink className="w-2.5 h-2.5" />
          </a>
        )}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onOpen();
      }}
      className={cn(
        "relative overflow-hidden bg-panel-elevated border border-border rounded-[2px] cursor-zoom-in group/media",
        className,
      )}
    >
      <img
        src={url}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
        className="w-full h-full object-cover transition-transform group-hover/media:scale-[1.02]"
      />
      {overlayCount && overlayCount > 0 ? (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-text-primary font-mono text-sm">
          +{overlayCount}
        </div>
      ) : null}
    </button>
  );
}

function Lightbox({
  urls,
  index,
  onIndex,
  onClose,
  tweetUrl,
}: {
  urls: string[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  tweetUrl?: string;
}) {
  const [broken, setBroken] = React.useState(false);
  React.useEffect(() => setBroken(false), [index]);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && urls.length > 1)
        onIndex((index - 1 + urls.length) % urls.length);
      else if (e.key === "ArrowRight" && urls.length > 1)
        onIndex((index + 1) % urls.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, urls.length, onClose, onIndex]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute top-3 right-3 p-2 text-text-primary/80 hover:text-text-primary"
        aria-label="Close"
      >
        <X className="w-5 h-5" />
      </button>
      {urls.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onIndex((index - 1 + urls.length) % urls.length);
            }}
            className="absolute left-3 top-1/2 -translate-y-1/2 p-2 text-text-primary/70 hover:text-text-primary bg-panel/40 rounded-full"
            aria-label="Previous"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onIndex((index + 1) % urls.length);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-text-primary/70 hover:text-text-primary bg-panel/40 rounded-full"
            aria-label="Next"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </>
      )}
      <div
        className="max-w-[92vw] max-h-[90vh] flex flex-col items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        {broken ? (
          <div className="text-text-muted font-mono text-xs flex items-center gap-2">
            media unavailable
            {tweetUrl && (
              <a
                href={tweetUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="text-accent hover:underline inline-flex items-center gap-1"
              >
                open on X <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        ) : (
          <img
            src={urls[index]}
            alt=""
            onError={() => setBroken(true)}
            className="max-w-full max-h-[85vh] object-contain rounded-[2px]"
          />
        )}
        {urls.length > 1 && (
          <div className="font-mono text-[11px] text-text-muted">
            {index + 1} / {urls.length}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function TweetMedia({ urls, tweetUrl }: Props) {
  const [open, setOpen] = React.useState<number | null>(null);
  if (!urls || urls.length === 0) return null;

  const n = urls.length;
  const visible = urls.slice(0, 4);
  const overflow = n > 4 ? n - 4 : 0;

  let layout: React.ReactNode = null;
  if (n === 1) {
    layout = (
      <MediaCell
        url={visible[0]}
        tweetUrl={tweetUrl}
        onOpen={() => setOpen(0)}
        className="aspect-video w-full"
      />
    );
  } else if (n === 2) {
    layout = (
      <div className="grid grid-cols-2 gap-1.5">
        {visible.map((u, i) => (
          <MediaCell
            key={i}
            url={u}
            tweetUrl={tweetUrl}
            onOpen={() => setOpen(i)}
            className="aspect-video"
          />
        ))}
      </div>
    );
  } else if (n === 3) {
    layout = (
      <div className="grid grid-cols-2 gap-1.5">
        <MediaCell
          url={visible[0]}
          tweetUrl={tweetUrl}
          onOpen={() => setOpen(0)}
          className="aspect-video"
        />
        <MediaCell
          url={visible[1]}
          tweetUrl={tweetUrl}
          onOpen={() => setOpen(1)}
          className="aspect-video"
        />
        <MediaCell
          url={visible[2]}
          tweetUrl={tweetUrl}
          onOpen={() => setOpen(2)}
          className="col-span-2 aspect-[16/7]"
        />
      </div>
    );
  } else {
    layout = (
      <div className="grid grid-cols-2 gap-1.5">
        {visible.map((u, i) => (
          <MediaCell
            key={i}
            url={u}
            tweetUrl={tweetUrl}
            onOpen={() => setOpen(i)}
            className="aspect-video"
            overlayCount={i === 3 ? overflow : 0}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="mt-2">
      {layout}
      {open !== null && (
        <Lightbox
          urls={urls}
          index={open}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
          tweetUrl={tweetUrl}
        />
      )}
    </div>
  );
}

export default TweetMedia;