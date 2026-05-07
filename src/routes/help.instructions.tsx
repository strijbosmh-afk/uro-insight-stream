import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowUp, Search } from "lucide-react";

export const Route = createFileRoute("/help/instructions")({
  head: () => ({ meta: [{ title: "UroFeed Instructions Manual" }] }),
  component: InstructionsPage,
});

type Step = { title: string; body: string; tip?: string };
type Section = {
  id: string;
  number: string;
  title: string;
  overview: string;
  steps: Step[];
  screenshot: string;
};

const SECTIONS: Section[] = [
  {
    id: "dashboard",
    number: "1",
    title: "Dashboard",
    overview:
      "Your home base. Shows live KPIs, recent activity, and quick links into the rest of the app.",
    steps: [
      { title: "Open the Dashboard", body: "Click 'Dashboard' in the sidebar to land on the overview page." },
      { title: "Review recent activity", body: "Scroll the activity feed; click any tweet to open it in the Live Feed." },
      { title: "Jump to a section", body: "Use the KPI cards as shortcuts into Congresses, Live Feed, or Summaries." },
    ],
    screenshot: "Dashboard overview",
  },
  {
    id: "congresses",
    number: "2",
    title: "Congresses",
    overview: "Track conferences and their associated sessions, hashtags, and abstracts.",
    steps: [
      { title: "Browse congresses", body: "Open 'Congresses' in the sidebar to see all tracked events." },
      { title: "Add a new congress", body: "Click 'New Congress' and follow the wizard to configure dates, hashtags, and sources." },
      { title: "Open a congress", body: "Click any card to view its sessions, scheduled program, and matched tweets.", tip: "Sessions can be summarized individually from the session detail page." },
    ],
    screenshot: "Congress grid",
  },
  {
    id: "feed",
    number: "3",
    title: "Live Feed",
    overview: "Real-time stream of tweets matching your interests, sources, and hashtags.",
    steps: [
      { title: "Apply filters", body: "Use the filter bar to scope the feed by hashtag, handle, or specialty." },
      { title: "Open a thread", body: "Click any tweet to open the full thread in a side dialog. Opened tweets are highlighted." },
      { title: "Reply or compose", body: "If your X account is connected, use the reply button or compose a new tweet directly." },
    ],
    screenshot: "Live Feed with thread open",
  },
  {
    id: "summaries",
    number: "4",
    title: "Summaries",
    overview: "AI-generated summaries of sessions and topic clusters.",
    steps: [
      { title: "Browse summaries", body: "Open 'Summaries' to see all generated summaries." },
      { title: "Customize a summary", body: "Open a summary, then click 'Customize' to adjust tone, length, and audience." },
      { title: "Export", body: "Use the export menu to download as Markdown, PDF, or copy to clipboard." },
    ],
    screenshot: "Summary detail",
  },
  {
    id: "digests",
    number: "5",
    title: "Digests",
    overview: "Scheduled email digests of curated content for you or your team.",
    steps: [
      { title: "Open Digests", body: "Click 'Digests' in the sidebar." },
      { title: "Create a digest", body: "Use the wizard to pick a cadence, audience, and content sources." },
      { title: "Preview before sending", body: "Each digest can be previewed and sent on demand or on schedule." },
    ],
    screenshot: "Digest wizard",
  },
  {
    id: "discover",
    number: "6",
    title: "Discover & Discover Groups",
    overview: "Find new sources, hashtags, and curated groups relevant to your interests.",
    steps: [
      { title: "Discover", body: "See suggested handles and hashtags based on your activity." },
      { title: "Discover Groups", body: "Browse curated groups and join the ones that match your specialty." },
    ],
    screenshot: "Discover page",
  },
  {
    id: "sources",
    number: "7",
    title: "Sources",
    overview: "Manage the X handles, lists, and hashtags ingested into your feed.",
    steps: [
      { title: "Add a handle", body: "Click 'Add Source' and paste an X handle or URL." },
      { title: "Manage lists", body: "Use 'Manage Lists' to organize sources into lists for filtering." },
      { title: "Add hashtags", body: "Switch to the Hashtags tab and click 'Add Hashtag'.", tip: "Use lowercase hashtags without the # symbol." },
    ],
    screenshot: "Sources table",
  },
  {
    id: "preferences",
    number: "8",
    title: "Settings — Preferences",
    overview: "Personal display preferences (theme, density, locale).",
    steps: [
      { title: "Open Settings", body: "Click 'Settings' in the sidebar, then the 'Preferences' tab." },
      { title: "Adjust density", body: "Switch between comfortable and compact for tighter layouts." },
    ],
    screenshot: "Preferences tab",
  },
  {
    id: "interests",
    number: "9",
    title: "Settings — Interests",
    overview: "Specialties, congresses, sources, and hashtags that drive your personalized feed.",
    steps: [
      { title: "Edit interests", body: "Go to Settings → Interests and add or remove items in each category." },
      { title: "Re-run onboarding", body: "Use the resume banner on the Dashboard to walk through the wizard again." },
    ],
    screenshot: "Interests editor",
  },
  {
    id: "ai",
    number: "10",
    title: "Settings — AI",
    overview: "Choose the AI model and tune defaults used for summaries.",
    steps: [
      { title: "Pick a model", body: "Settings → AI lets you select between supported summarization models." },
      { title: "Set defaults", body: "Tone, length, and audience defaults apply to all new summaries." },
    ],
    screenshot: "AI settings",
  },
  {
    id: "team",
    number: "11",
    title: "Settings — Team",
    overview: "Manage teammates and invitations.",
    steps: [
      { title: "Invite a teammate", body: "Settings → Team → 'Invite' and enter their email." },
      { title: "Assign a role", body: "Pick Admin, Editor, or Viewer when sending the invite.", tip: "Roles are enforced server-side via Lovable Cloud RLS." },
    ],
    screenshot: "Team management",
  },
  {
    id: "x",
    number: "12",
    title: "Settings — X (Twitter)",
    overview: "Connect one or more X accounts for posting and replying. Switch between them from the top bar.",
    steps: [
      { title: "Add an account", body: "Settings → X (Twitter) and follow the four-step credential guide." },
      { title: "Switch accounts", body: "Use the account switcher in the top bar to choose which connected account to act as." },
      { title: "Disconnect", body: "Remove an account from the X settings list at any time.", tip: "UroFeed uses OAuth 1.0a — you need Consumer Key/Secret AND Access Token/Secret." },
    ],
    screenshot: "X account settings",
  },
  {
    id: "ingestion",
    number: "13",
    title: "Settings — Ingestion (Admin)",
    overview: "Inspect and tune how tweets are ingested into the platform.",
    steps: [
      { title: "Open Ingestion", body: "Settings → Ingestion (admin only) shows queue stats and recent runs." },
    ],
    screenshot: "Ingestion settings",
  },
  {
    id: "admin",
    number: "14",
    title: "Admin",
    overview: "Admin-only tools for managing users, groups, recommendations, and ingestion jobs.",
    steps: [
      { title: "Users", body: "Invite, promote, or deactivate users." },
      { title: "Groups", body: "Create and manage curated groups visible under Discover Groups." },
      { title: "Recommendations", body: "Tune the recommendation engine and review nominated handles." },
      { title: "Ingestion", body: "Trigger or inspect ingestion jobs and webhooks." },
    ],
    screenshot: "Admin panel",
  },
];

function InstructionsPage() {
  const [query, setQuery] = React.useState("");
  const [showTop, setShowTop] = React.useState(false);
  const [tocOpen, setTocOpen] = React.useState(false);
  const [activeId, setActiveId] = React.useState<string>(SECTIONS[0]?.id ?? "");

  React.useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 600);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  React.useEffect(() => {
    const ids = SECTIONS.map((s) => s.id);
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => !!el);
    if (elements.length === 0) return;

    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            visible.set(e.target.id, e.intersectionRatio);
          } else {
            visible.delete(e.target.id);
          }
        }
        if (visible.size > 0) {
          // Pick the topmost visible section in document order.
          for (const id of ids) {
            if (visible.has(id)) {
              setActiveId(id);
              break;
            }
          }
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: [0, 0.25, 0.5, 1] },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SECTIONS;
    return SECTIONS.filter((s) => {
      const hay = [s.title, s.overview, ...s.steps.map((st) => st.title + " " + st.body + " " + (st.tip ?? ""))]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [query]);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    setTocOpen(false);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-text-primary">
          UroFeed Instructions Manual
        </h1>
        <p className="mt-2 text-text-muted max-w-2xl">
          A complete walkthrough of every feature in UroFeed. Use the table of contents
          to jump to any section, or search by keyword.
        </p>
        <div className="mt-4 relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search instructions…"
            className="pl-9"
          />
        </div>
      </header>

      <div className="lg:grid lg:grid-cols-[240px_1fr] lg:gap-10">
        {/* TOC — desktop sticky / mobile collapsible */}
        <aside className="lg:sticky lg:top-4 lg:self-start mb-6 lg:mb-0">
          <div className="lg:hidden">
            <Button
              variant="outline"
              className="w-full justify-between"
              onClick={() => setTocOpen((v) => !v)}
            >
              Table of contents
              <span className="text-xs text-text-muted">{tocOpen ? "Hide" : "Show"}</span>
            </Button>
          </div>
          <nav
            className={`${tocOpen ? "block" : "hidden"} lg:block mt-3 lg:mt-0 rounded-md border border-border bg-panel p-3`}
          >
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted mb-2">
              Contents
            </div>
            <ul className="space-y-1">
              {filtered.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => scrollTo(s.id)}
                    className={`relative w-full text-left text-[13px] py-1 pl-3 rounded-sm transition-colors ${
                      activeId === s.id
                        ? "text-text-primary bg-panel-elevated"
                        : "text-text-muted hover:text-text-primary"
                    }`}
                  >
                    {activeId === s.id && (
                      <span className="absolute left-0 top-1 bottom-1 w-[2px] bg-accent rounded-full" />
                    )}
                    <span className="font-mono text-accent mr-2">{s.number}.</span>
                    {s.title}
                  </button>
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="text-[13px] text-text-muted py-1">No matches.</li>
              )}
            </ul>
          </nav>
        </aside>

        <article className="space-y-12 max-w-3xl">
          {filtered.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-6">
              <h2 className="text-2xl font-semibold text-accent">
                <span className="font-mono mr-3">{section.number}.</span>
                {section.title}
              </h2>
              <p className="mt-2 text-text-primary/90 leading-relaxed max-w-[75ch]">
                {section.overview}
              </p>
              <div className="mt-4 rounded-md border border-dashed border-border bg-panel-elevated/40 aspect-[16/9] flex items-center justify-center text-text-muted text-sm">
                Screenshot: {section.screenshot}
              </div>
              <ol className="mt-6 space-y-4 list-decimal pl-5">
                {section.steps.map((step, i) => (
                  <li key={i} className="text-text-primary/90 leading-relaxed max-w-[75ch]">
                    <div className="font-medium">{step.title}</div>
                    <div className="text-text-muted mt-1">{step.body}</div>
                    {step.tip && (
                      <div className="mt-2 rounded-md border-l-2 border-accent bg-panel-elevated/60 px-3 py-2 text-[13px] text-text-primary/80">
                        <span className="font-mono uppercase text-[10px] tracking-[0.18em] text-accent mr-2">
                          Tip
                        </span>
                        {step.tip}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          ))}
          {filtered.length === 0 && (
            <p className="text-text-muted">No sections match “{query}”.</p>
          )}
        </article>
      </div>

      {showTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-6 right-6 z-30 h-10 w-10 rounded-full bg-accent text-accent-foreground shadow-lg flex items-center justify-center hover:opacity-90 transition"
          aria-label="Back to top"
        >
          <ArrowUp className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}