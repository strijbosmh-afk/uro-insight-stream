import * as React from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Compass, Mail, PenSquare, BookOpen, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { DigestWizard } from "@/components/digests/DigestWizard";
import { ComposeTweetDialog } from "@/components/x/ComposeTweetDialog";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const STARTER_TEXT =
  "Hello urology community 👋 — excited to share what I'm working on and learn from all of you here.";

interface CardDef {
  key: "follow" | "digest" | "post" | "guide";
  icon: React.ReactNode;
  title: string;
  description: string;
  cta: string;
}

const CARDS: CardDef[] = [
  {
    key: "follow",
    icon: <Compass className="w-4 h-4" />,
    title: "Follow your first 5 KOLs",
    description: "Curated experts for your specialties",
    cta: "Browse",
  },
  {
    key: "digest",
    icon: <Mail className="w-4 h-4" />,
    title: "Set up a weekly digest",
    description: "AI-summarized email every week",
    cta: "Create digest",
  },
  {
    key: "post",
    icon: <PenSquare className="w-4 h-4" />,
    title: "Share your first post",
    description: "Say hello to the urology community on X",
    cta: "Compose",
  },
  {
    key: "guide",
    icon: <BookOpen className="w-4 h-4" />,
    title: "Read the guide",
    description: "How UroFeed works in 5 minutes",
    cta: "Open",
  },
];

export function QuickStartPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [digestOpen, setDigestOpen] = React.useState(false);
  const [composeOpen, setComposeOpen] = React.useState(false);

  const prefsQ = useQuery({
    queryKey: ["quick-start-prefs", user?.id ?? null],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_preferences")
        .select("quick_start_dismissed")
        .eq("user_id", user!.id)
        .maybeSingle();
      return { dismissed: !!data?.quick_start_dismissed };
    },
  });

  const isNewUser = React.useMemo(() => {
    if (!user?.created_at) return false;
    return Date.now() - new Date(user.created_at).getTime() < SEVEN_DAYS_MS;
  }, [user?.created_at]);

  const dismiss = React.useCallback(async () => {
    if (!user) return;
    // Optimistic
    qc.setQueryData(["quick-start-prefs", user.id], { dismissed: true });
    await supabase
      .from("user_preferences")
      .update({ quick_start_dismissed: true })
      .eq("user_id", user.id);
  }, [user, qc]);

  if (!user || !isNewUser) return null;
  if (prefsQ.isLoading) return null;
  if (prefsQ.data?.dismissed) return null;

  const handleAction = (key: CardDef["key"]) => {
    if (key === "follow") {
      void dismiss();
      navigate({ to: "/discover", search: { tab: "by-specialty" } });
    } else if (key === "digest") {
      setDigestOpen(true);
    } else if (key === "post") {
      setComposeOpen(true);
    } else if (key === "guide") {
      void dismiss();
      navigate({ to: "/help/instructions" });
    }
  };

  return (
    <>
      <div
        className="border border-border bg-panel rounded-[4px] shrink-0"
        style={{ borderTopColor: "var(--accent)", borderTopWidth: "1px" }}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-accent">
              Quick start
            </div>
            <div className="text-[12px] text-text-primary mt-0.5">
              Get rolling — pick any of these to set up UroFeed for your work.
            </div>
          </div>
          <button
            type="button"
            aria-label="Dismiss quick start"
            onClick={() => void dismiss()}
            className="text-text-muted hover:text-text-primary p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-2">
          {CARDS.map((c) => (
            <div
              key={c.key}
              className="relative border border-border rounded-[3px] bg-panel-elevated/30 p-3 flex flex-col gap-2 hover:border-accent/50 transition-colors"
            >
              <button
                type="button"
                aria-label={`Dismiss ${c.title}`}
                onClick={() => void dismiss()}
                className="absolute top-1.5 right-1.5 text-text-muted hover:text-text-primary p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
              <div className="flex items-center gap-2 text-accent">
                {c.icon}
              </div>
              <div className="text-[12px] font-medium text-text-primary leading-snug pr-4">
                {c.title}
              </div>
              <div className="text-[11px] text-text-muted leading-snug flex-1">
                {c.description}
              </div>
              <button
                type="button"
                onClick={() => handleAction(c.key)}
                className="mt-1 self-start text-[11px] font-mono uppercase tracking-wider text-accent hover:underline"
              >
                {c.cta} →
              </button>
            </div>
          ))}
        </div>
      </div>

      {digestOpen && (
        <DigestWizard
          digestId={null}
          initialPreset="specialty"
          onClose={() => {
            setDigestOpen(false);
            void dismiss();
          }}
        />
      )}

      <ComposeTweetDialog
        open={composeOpen}
        onOpenChange={(o) => {
          setComposeOpen(o);
          if (!o) void dismiss();
        }}
        initialText={STARTER_TEXT}
      />
    </>
  );
}

export default QuickStartPanel;
