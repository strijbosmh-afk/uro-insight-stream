import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Send, ExternalLink, AlertCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
}

export function ComposeTweetDialog({ open, onOpenChange, initialText = "", reply }: Props) {
  const qc = useQueryClient();
  const [text, setText] = React.useState(initialText);
  const [suggestions, setSuggestions] = React.useState<
    { text: string; angle: string }[]
  >([]);
  const [suggestLoading, setSuggestLoading] = React.useState(false);
  const [tone, setTone] = React.useState<ToneValue>("professional");

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl bg-panel border-border">
        <DialogHeader>
          <DialogTitle className="text-[12px] font-mono uppercase tracking-wider text-text-muted">
            {reply ? "Reply on X" : "Post to X"}
          </DialogTitle>
        </DialogHeader>

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
              <Button asChild>
                <Link to="/settings" onClick={() => onOpenChange(false)}>
                  Go to Settings
                </Link>
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
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={reply ? "Write your reply…" : "What's happening?"}
              rows={5}
              className="resize-none"
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
            <div className="flex items-center justify-between gap-2">
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
            {mutation.data && !mutation.data.ok && (
              <div className="text-[11px] text-destructive flex items-center gap-1">
                <ExternalLink className="w-3 h-3" />
                {mutation.data.message}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default ComposeTweetDialog;