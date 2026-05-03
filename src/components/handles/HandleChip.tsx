import * as React from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useHandleSubscription,
  useFollowSource,
  useUnfollowSource,
} from "@/hooks/useHandleActions";

interface Props {
  handle: string;
  className?: string;
  /** Visual variant. "inline" matches @mention inside body text. */
  variant?: "default" | "inline";
  /** Override the displayed text (e.g. "@uroweb"). Defaults to "@<handle>". */
  children?: React.ReactNode;
}

type MenuPos = { x: number; y: number };

const X_URL = (h: string) => `https://x.com/${h.replace(/^@/, "")}`;

export function HandleChip({ handle, className, variant = "default", children }: Props) {
  const cleanHandle = handle.replace(/^@/, "");
  const [menuPos, setMenuPos] = React.useState<MenuPos | null>(null);
  const [tipVisible, setTipVisible] = React.useState(false);
  const tipTimer = React.useRef<number | null>(null);
  const longPressTimer = React.useRef<number | null>(null);
  const ref = React.useRef<HTMLSpanElement>(null);
  const navigate = useNavigate();

  const { data: sub } = useHandleSubscription(cleanHandle);
  const followMut = useFollowSource();
  const unfollowMut = useUnfollowSource();

  const closeMenu = React.useCallback(() => setMenuPos(null), []);

  React.useEffect(() => {
    if (!menuPos) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-handle-menu]")) closeMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuPos, closeMenu]);

  const openX = React.useCallback(() => {
    window.open(X_URL(cleanHandle), "_blank", "noopener,noreferrer");
  }, [cleanHandle]);

  const handleClick = (e: React.MouseEvent<HTMLSpanElement>) => {
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      openX();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    setMenuPos({ x: e.clientX, y: e.clientY });
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLSpanElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuPos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseEnter = () => {
    tipTimer.current = window.setTimeout(() => setTipVisible(true), 600);
  };
  const handleMouseLeave = () => {
    if (tipTimer.current) window.clearTimeout(tipTimer.current);
    tipTimer.current = null;
    setTipVisible(false);
  };

  // Long-press for touch
  const handleTouchStart = (e: React.TouchEvent<HTMLSpanElement>) => {
    const t = e.touches[0];
    const x = t.clientX;
    const y = t.clientY;
    longPressTimer.current = window.setTimeout(() => {
      setMenuPos({ x, y });
    }, 500);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  };

  const onFollow = async () => {
    closeMenu();
    const needsLookup = !sub?.existsInSources;
    if (needsLookup) toast.message(`Looking up @${cleanHandle}…`);
    try {
      const res = await followMut.mutateAsync({ handle: cleanHandle, needsLookup });
      if (res.backfilled) {
        toast.success(`Following @${cleanHandle} · backfill queued`);
      } else {
        toast.success(`Now following @${cleanHandle} · feed will populate within a few minutes`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "not_found") toast.error(`@${cleanHandle} not found on X · check spelling`);
      else if (msg === "rate_limit_user") toast.error("Slow down — try again in a few seconds");
      else if (msg === "rate_limit_global") toast.error("System busy — try again in a moment");
      else toast.error(`Couldn't follow @${cleanHandle}`);
    }
  };

  const onUnfollow = async () => {
    closeMenu();
    try {
      await unfollowMut.mutateAsync({ handle: cleanHandle });
      toast.success(`Unfollowed @${cleanHandle} · existing tweets remain in your feed history`);
    } catch {
      toast.error(`Couldn't unfollow @${cleanHandle}`);
    }
  };

  const onCopy = async () => {
    closeMenu();
    try {
      await navigator.clipboard.writeText(cleanHandle);
      toast.success(`Copied @${cleanHandle}`);
    } catch {
      toast.error("Copy failed");
    }
  };

  const onViewTweets = () => {
    closeMenu();
    window.dispatchEvent(
      new CustomEvent("feed:filter-source", { detail: { sourceId: cleanHandle.toLowerCase() } }),
    );
    navigate({ to: "/feed" });
  };

  const isFollowing = !!sub?.isSubscribed;

  return (
    <>
      <span
        ref={ref}
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchEnd={cancelLongPress}
        onTouchMove={cancelLongPress}
        onTouchCancel={cancelLongPress}
        className={cn(
          "relative inline-flex items-center font-mono cursor-pointer select-none rounded-[2px] -mx-0.5 px-0.5 transition-colors",
          "hover:bg-panel-elevated focus:outline-none focus:bg-panel-elevated",
          variant === "inline" ? "text-accent/80" : "text-accent",
          className,
        )}
      >
        {children ?? `@${cleanHandle}`}
        {tipVisible && !menuPos && (
          <span
            className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-1 z-50 whitespace-nowrap font-mono text-[10px] uppercase tracking-wider text-text-muted bg-panel-elevated border border-border px-1.5 py-1 rounded-[2px]"
          >
            right-click for actions · ⌘ click to open on X
          </span>
        )}
      </span>
      {menuPos && (
        <HandleMenuPortal
          pos={menuPos}
          handle={cleanHandle}
          isFollowing={isFollowing}
          existsInSources={!!sub?.existsInSources}
          loading={followMut.isPending || unfollowMut.isPending}
          onFollow={onFollow}
          onUnfollow={onUnfollow}
          onCopy={onCopy}
          onOpenX={() => {
            closeMenu();
            openX();
          }}
          onViewTweets={onViewTweets}
        />
      )}
    </>
  );
}

function HandleMenuPortal(props: React.ComponentProps<typeof HandleMenu>) {
  if (typeof document === "undefined") return null;
  return createPortal(<HandleMenu {...props} />, document.body);
}

function HandleMenu({
  pos,
  handle,
  isFollowing,
  existsInSources,
  loading,
  onFollow,
  onUnfollow,
  onCopy,
  onOpenX,
  onViewTweets,
}: {
  pos: MenuPos;
  handle: string;
  isFollowing: boolean;
  existsInSources: boolean;
  loading: boolean;
  onFollow: () => void;
  onUnfollow: () => void;
  onCopy: () => void;
  onOpenX: () => void;
  onViewTweets: () => void;
}) {
  // Clamp to viewport
  const [adj, setAdj] = React.useState<MenuPos>(pos);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    let { x, y } = pos;
    if (x + r.width > window.innerWidth - 8) x = window.innerWidth - r.width - 8;
    if (y + r.height > window.innerHeight - 8) y = window.innerHeight - r.height - 8;
    setAdj({ x, y });
  }, [pos]);

  return (
    <div
      ref={ref}
      data-handle-menu
      className="fixed z-[1000] min-w-[220px] border border-border bg-panel-elevated rounded-[3px] shadow-xl py-1 font-mono text-[12px]"
      style={{ left: adj.x, top: adj.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {isFollowing ? (
        <>
          <MenuRow disabled>✓ Following</MenuRow>
          <MenuRow onClick={onUnfollow} disabled={loading}>
            Unfollow @{handle}
          </MenuRow>
        </>
      ) : (
        <MenuRow onClick={onFollow} disabled={loading}>
          + Follow @{handle}
          {!existsInSources && (
            <span className="ml-1 text-text-muted opacity-70">(lookup)</span>
          )}
        </MenuRow>
      )}
      <Sep />
      <MenuRow onClick={onOpenX}>
        Open @{handle} on X <span className="text-text-muted">↗</span>
      </MenuRow>
      <MenuRow onClick={onViewTweets}>View all tweets from @{handle}</MenuRow>
      <Sep />
      <MenuRow onClick={onCopy}>Copy @{handle}</MenuRow>
    </div>
  );
}

function MenuRow({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-1.5 transition-colors",
        disabled
          ? "text-text-muted cursor-default"
          : "text-text-primary hover:bg-accent/15 hover:text-accent cursor-pointer",
      )}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <div className="h-px bg-border my-1" />;
}

export default HandleChip;