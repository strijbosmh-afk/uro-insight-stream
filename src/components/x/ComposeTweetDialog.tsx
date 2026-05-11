import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Send, ExternalLink, AlertCircle, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getXConnectionStatus,
  postTweet,
} from "@/serverFns/x-credentials";
import { useServerFn } from "@tanstack/react-start";
import { suggestReplyDrafts, type ReplyDraftsResult } from "@/serverFns/reply-drafts";
import { useIsMobile } from "@/hooks/use-mobile";
import { XConnectWizard } from "@/components/x-wizard/XConnectWizard";

function graphemeLen(s: string) {
  try {
    const seg = new Intl.Segmenter("en", { granularity: "grapheme" });
    let n = 0;
    for (const _ of seg.segment(s)) n++;
    return n;
  } catch {
    return [...s].length;
  }
}

export interface ReplyContext {
  tweetId: string;
  authorHandle: string;
  text: string;
}

const TONE_OPTIONS = [
  { value: "professional", label: "Professional", prompt: "professional, precise, clinically rigorous" },
  { value: "collegial", label: "Collegial", prompt: "warm, collegial, supportive peer tone" },
  { value: "inquisitive", label: "Inquisitive", prompt: "curious and inquisitive; lead with thoughtful questions" },
  { value: "counterpoint", label: "Counterpoint", prompt: "respectful counterpoint; challenge claims with evidence" },
  { value: "concise", label: "Concise", prompt: "ultra-concise, punchy, under 180 chars" },
] as const;
type ToneValue = (typeof TONE_OPTIONS)[number]["value"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialText?: string;
  reply?: ReplyContext;
  /** When true, fire the AI suggest action automatically after the dialog opens. */
  triggerAiSuggest?: boolean;
}

export function ComposeTweetDialog({ open, onOpenChange, initialText = "", reply, triggerAiSuggest }: Props) {
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const [text, setText] = React.useState(initialText);
  const [wizardOpen, setWizardOpen] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<
    { text: string; angle: string }[]
  >([]);
  const [suggestLoading, setSuggestLoading] = React.useState(false);
  const [tone, setTone] = React.useState<ToneValue>("professional");
  const [keyboardInset, setKeyboardInset] = React.useState(0);

  // Track on-screen keyboard height (iOS Safari) so the AI-assist row stays visible.
  React.useEffect(() => {
    if (!open || !isMobile || typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const diff = window.innerHeight - vv.height - vv.offsetTop;
      setKeyboardInset(diff > 80 ? diff : 0);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [open, isMobile]);

  React.useEffect(() => {
    if (open) {
      setText(initialText || (reply ? `@${reply.authorHandle} ` : ""));
      setSuggestions([]);
    }
  }, [open, initialText, reply]);

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ["x-connection-status"],
    queryFn: () => getXConnectionStatus(),
    enabled: open,
    staleTime: 30_000,
  });

  const len = graphemeLen(text);
  const overLimit = len > 280;
  const empty = len === 0;

  const mutation = useMutation({
    mutationFn: () =>
      postTweet({
        data: { text, inReplyToTweetId: reply?.tweetId },
      }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success("Posted to X", {
          action: {
            label: "View",
            onClick: () => window.open(res.url, "_blank", "noopener"),
          },
        });
        qc.invalidateQueries({ queryKey: ["x-connection-status"] });
        qc.invalidateQueries({ queryKey: ["x-my-posts"] });
        onOpenChange(false);
      } else {
        toast.error(res.message);
      }
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const notConnected = !statusLoading && !status;

  // Pre-cached reply starter drafts, keyed by parent tweet. Only fetched when
  // the dialog is open in reply mode for a real tweet id.
  const fetchReplyDrafts = useServerFn(suggestReplyDrafts);
  const replyDraftsQuery = useQuery<ReplyDraftsResult>({
    queryKey: ["reply-drafts", reply?.tweetId],
    queryFn: () => fetchReplyDrafts({ data: { tweetId: reply!.tweetId } }),
    enabled: open && !!reply?.tweetId && !notConnected,
    staleTime: 60 * 60 * 1000,
    retry: 0,
  });

  function applyDraftText(draftText: string) {
    const mention = reply ? `@${reply.authorHandle} ` : "";
    setText(mention + draftText);
  }

  async function handleSuggest() {
    setSuggestLoading(true);
    try {
      const tonePrompt =
        TONE_OPTIONS.find((t) => t.value === tone)?.prompt ?? tone;
      const { data, error } = await supabase.functions.invoke("ai-summarize", {
        body: {
          mode: "suggest_replies",
          parentAuthor: reply?.authorHandle,
          parentText: reply?.text ?? "",
          draft: text,
          tone: tonePrompt,
        },
      });
      if (error) throw new Error(error.message || "AI request failed");
      if (!data?.ok) throw new Error(data?.error || "AI request failed");
      setSuggestions(data.replies ?? []);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSuggestLoading(false);
    }
  }

  // Auto-fire AI suggest once when triggerAiSuggest is set.
  const firedRef = React.useRef(false);
  React.useEffect(() => {
    if (!open) {
      firedRef.current = false;
      return;
    }
    if (triggerAiSuggest && !firedRef.current && !notConnected) {
      firedRef.current = true;
      void handleSuggest();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, triggerAiSuggest, notConnected]);

  const body = (
    <>
      {notConnected ? (
          <div className="space-y-3 py-2">
            <div className="flex items-start gap-2 p-3 rounded-[3px] border border-border bg-panel-elevated">
              <AlertCircle className="w-4 h-4 text-accent shrink-0 mt-0.5" />
              <div className="text-[12px] text-text-primary">
                Your X account isn't connected yet. Connect it in Settings → X
                (Twitter) to post and reply from UroFeed.
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setWizardOpen(true);
                  onOpenChange(false);
                }}
              >
                Connect X now
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {reply && (
              <div className="border border-border rounded-[3px] p-2 bg-panel-elevated text-[12px] text-text-muted">
                <div className="font-mono text-[10px] uppercase tracking-wider mb-1">
                  Replying to @{reply.authorHandle}
                </div>
                <div className="line-clamp-3 text-text-primary/80 whitespace-pre-wrap">
                  {reply.text}
                </div>
              </div>
            )}
            {reply && (
              <div className="space-y-1.5">
                <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-accent" />
                  Quick-start drafts
                  {replyDraftsQuery.isLoading && (
                    <Loader2 className="w-3 h-3 animate-spin text-text-muted" />
                  )}
                </div>
                {replyDraftsQuery.isLoading ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-1.5">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="h-16 rounded-[3px] border border-border bg-panel-elevated/50 animate-pulse"
                      />
                    ))}
                  </div>
                ) : replyDraftsQuery.error ? (
                  <div className="flex items-center justify-between text-[11px] text-text-muted border border-border rounded-[3px] px-2 py-1.5">
                    <span>Couldn't load drafts.</span>
                    <button
                      type="button"
                      onClick={() => replyDraftsQuery.refetch()}
                      className="text-accent hover:underline font-mono uppercase text-[10px] tracking-wider"
                    >
                      Retry
                    </button>
                  </div>
                ) : replyDraftsQuery.data?.drafts.length ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-1.5">
                    {replyDraftsQuery.data.drafts.map((d) => (
                      <button
                        key={d.register}
                        type="button"
                        onClick={() => applyDraftText(d.text)}
                        className="text-left border border-border rounded-[3px] p-2 bg-panel-elevated/30 hover:border-accent hover:bg-panel-elevated transition-colors"
                        title="Click to insert"
                      >
                        <div className="text-[9px] font-mono uppercase tracking-wider text-accent mb-1">
                          {d.label}
                        </div>
                        <div className="text-[11px] text-text-primary line-clamp-3 whitespace-pre-wrap">
                          {d.text}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={reply ? "Write your reply…" : "What's happening?"}
              rows={isMobile ? 4 : 5}
              className="resize-none max-h-[200px] overflow-auto"
              autoFocus
            />
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-text-muted">
                Posting as{" "}
                <span className="text-accent">@{status?.x_username ?? "…"}</span>
              </span>
              <span
                className={
                  overLimit
                    ? "text-destructive"
                    : len > 260
                      ? "text-warning"
                      : "text-text-muted"
                }
              >
                {len}/280
              </span>
            </div>
            <div
              className="flex items-center justify-between gap-2 sticky bg-panel py-2"
              style={isMobile ? { bottom: keyboardInset } : undefined}
            >
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSuggest}
                disabled={suggestLoading || mutation.isPending}
                className="text-[11px]"
              >
                {suggestLoading ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                )}
                AI suggest {reply ? "replies" : "drafts"}
              </Button>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
                  Tone
                </span>
                <Select value={tone} onValueChange={(v) => setTone(v as ToneValue)}>
                  <SelectTrigger className="h-7 text-[11px] w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TONE_OPTIONS.map((t) => (
                      <SelectItem key={t.value} value={t.value} className="text-[12px]">
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {suggestions.length > 0 && (
              <div className="space-y-2">
                <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
                  Suggestions — click to insert
                </div>
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setText(s.text)}
                    className="w-full text-left border border-border rounded-[3px] p-2 bg-panel-elevated hover:border-accent hover:bg-panel transition-colors"
                  >
                    <div className="text-[10px] font-mono uppercase tracking-wider text-accent mb-1">
                      {s.angle}
                    </div>
                    <div className="text-[12px] text-text-primary whitespace-pre-wrap">
                      {s.text}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {!isMobile && (
              <DialogFooter>
                <Button
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                  disabled={mutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => mutation.mutate()}
                  disabled={empty || overLimit || mutation.isPending}
                >
                  {mutation.isPending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      Posting…
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5 mr-1.5" />
                      {reply ? "Reply" : "Post"}
                    </>
                  )}
                </Button>
              </DialogFooter>
            )}
            {mutation.data && !mutation.data.ok && (
              <div className="text-[11px] text-destructive flex items-center gap-1">
                <ExternalLink className="w-3 h-3" />
                {mutation.data.message}
              </div>
            )}
          </div>
      )}
    </>
  );

  if (isMobile) {
    return (
      <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="h-[100dvh] w-screen max-w-none p-0 bg-panel border-border flex flex-col gap-0"
        >
          {/* Header */}
          <div className="h-11 shrink-0 flex items-center justify-between px-2 border-b border-border safe-pt">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
              className="w-11 h-11 flex items-center justify-center text-text-muted hover:text-text-primary"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="text-[12px] font-mono uppercase tracking-wider text-text-muted">
              {reply ? "Reply on X" : "Share to X"}
            </div>
            <button
              type="button"
              onClick={() => mutation.mutate()}
              disabled={empty || overLimit || mutation.isPending || notConnected}
              className="h-9 px-3 rounded-[3px] bg-accent text-accent-foreground text-[12px] font-medium disabled:opacity-40"
            >
              {mutation.isPending ? "…" : reply ? "Reply" : "Post"}
            </button>
          </div>
          <div
            className="flex-1 min-h-0 overflow-auto p-3"
            style={{ paddingBottom: keyboardInset + 16 }}
          >
            {body}
          </div>
        </SheetContent>
      </Sheet>
      <XConnectWizard open={wizardOpen} onOpenChange={setWizardOpen} />
      </>
    );
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl bg-panel border-border">
        <DialogHeader>
          <DialogTitle className="text-[12px] font-mono uppercase tracking-wider text-text-muted">
            {reply ? "Reply on X" : "Share to X"}
          </DialogTitle>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
    <XConnectWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </>
  );
}

export default ComposeTweetDialog;