import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowUp, Search, FileText, BookOpen, Download, ExternalLink } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

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
  image?: string;
};

const SECTIONS: Section[] = [
  {
    id: "dashboard",
    number: "1",
    title: "Dashboard",
    overview:
      "Your home base. New users see a Quick Start panel with four onboarding actions; everyone gets KPI tiles, ingestion health, the live-now strip, and a Recent Activity stream.",
    steps: [
      { title: "Open the Dashboard", body: "Click 'Dashboard' in the sidebar to land on the overview." },
      { title: "Use Quick Start (first 7 days)", body: "Pick any of the four cards — Follow KOLs, Set up a digest, Share a post, Read the guide. Acting on a card or hitting the panel-level X dismisses it for good." },
      { title: "Scan the KPI tiles", body: "Active congresses, posts/min, sources tracked, and summaries today. They double as shortcuts into the matching section." },
      { title: "Watch ingestion health", body: "The Ingestion panel shows the four cron jobs (matcher, queue, summarizer, ingest) and how recently each succeeded.", tip: "If a row turns red ('never'), that pipeline is stale — check the Ingestion admin page." },
      { title: "Browse Recent Activity", body: "Newest posts from your followed sources stream in on the right. Click any item to open it in the Live Feed." },
    ],
    screenshot: "Dashboard with Quick Start, KPIs, ingestion and recent activity",
    image: "/help-screenshots/dashboard.png",
  },
  {
    id: "feed",
    number: "2",
    title: "Live Feed",
    overview:
      "Real-time stream of posts matching your followed sources, hashtags, congresses, and sessions. Includes an inline composer, live signals sidebar, and a 24-hour timeline.",
    steps: [
      { title: "Apply filters", body: "Top filter bar scopes by congress, session, source list, hashtag, date range, and language." },
      { title: "Use the inline composer", body: "The 'Share something with the urology community…' bar above the stream opens the Share to X dialog with one click — no need to leave the feed." },
      { title: "Open a thread", body: "Click any post to open the full thread in a side dialog. Opened posts stay highlighted so you can track what you've read." },
      { title: "Quote with comment", body: "Each post has a Quote button — it opens the composer with the post URL pre-filled, ready for your take." },
      { title: "Watch live signals", body: "The right sidebar tracks top hashtags, top sources, sentiment, and trending sessions in the last hour." },
    ],
    screenshot: "Live Feed with inline composer and live signals",
    image: "/help-screenshots/feed.png",
  },
  {
    id: "summaries",
    number: "3",
    title: "Summaries",
    overview:
      "AI-generated summaries of sessions, abstracts, and topic clusters. Filterable by target type, sentiment, and recency.",
    steps: [
      { title: "Browse summaries", body: "Open 'Summaries' for the full table. Each row links to the source session or abstract." },
      { title: "Filter and search", body: "Use the search box plus the target/sentiment/sort dropdowns to narrow down quickly." },
      { title: "Open a summary", body: "Click a row to read the full takeaway, source posts, and citations." },
      { title: "Customise tone & audience", body: "From the detail page, regenerate with a different tone, length, or audience to fit your use case." },
    ],
    screenshot: "Summaries table",
    image: "/help-screenshots/summaries.png",
  },
  {
    id: "congresses",
    number: "4",
    title: "Congresses",
    overview:
      "Track conferences with their dates, locations, hashtags, and sessions. Cards show status (Upcoming / Live / Archived) and per-congress KPIs.",
    steps: [
      { title: "Browse congresses", body: "Open 'Congresses' for the card grid. Filter by cancer area or status." },
      { title: "Open a congress", body: "Click any card to view its sessions, abstracts, scheduled program, and matched posts." },
      { title: "Add a new congress", body: "Click 'New congress' and follow the wizard to configure dates, location, hashtags, and the source list to track.", tip: "Sessions become matchable as soon as you give the congress a primary hashtag." },
    ],
    screenshot: "Congress grid",
    image: "/help-screenshots/congresses.png",
  },
  {
    id: "discover",
    number: "5",
    title: "Discover",
    overview:
      "Find new sources to follow. Three tabs: For you (personalised), By group (curated lists), and By specialty (top sources per cancer area). The active tab persists across sessions.",
    steps: [
      { title: "For you", body: "Personalised candidates ranked by reach and relevance to your specialties. Use the checkboxes to bulk-follow, or the X to dismiss a suggestion." },
      { title: "By group", body: "Curated, admin-maintained lists (e.g. 'Prostate cancer KOLs'). Subscribe to a whole group in one click." },
      { title: "By specialty", body: "Top recommended sources per cancer area, ordered by weight. The 'All caught up' state means you already follow everything we'd suggest." },
      { title: "Use the filter bar", body: "Search, toggle Verified-only, and pin a single specialty chip to focus the recommendations." },
    ],
    screenshot: "Discover with three tabs and filter bar",
    image: "/help-screenshots/discover.png",
  },
  {
    id: "sources",
    number: "6",
    title: "My Following",
    overview:
      "The full list of X handles and hashtags currently driving your feed. Two side-by-side tables: Sources and Hashtags.",
    steps: [
      { title: "Follow / unfollow", body: "Click the toggle button on any row to add or drop a source from your feed." },
      { title: "Add a source", body: "Click 'Add source' and paste an X handle or URL. New handles enter ingestion within minutes." },
      { title: "Organise into lists", body: "Use 'Lists' to group sources (e.g. 'Industry', 'KOLs') for fine-grained feed filtering." },
      { title: "Manage hashtags", body: "On the right, add or pause hashtags. Active hashtags drive the live-feed match.", tip: "Hashtags are stored lowercase, without the leading #." },
    ],
    screenshot: "Sources and hashtags tables",
    image: "/help-screenshots/sources.png",
  },
  {
    id: "digests",
    number: "7",
    title: "Digests",
    overview:
      "Recurring email digests bound to any combination of sources, your specialty, an active congress, and/or hashtags. Three preset starters get you running fast.",
    steps: [
      { title: "Create a digest", body: "Click 'New digest' (or the empty-state CTA). Step 1 names it; step 2 picks bindings; step 3 sets cadence; step 4 confirms recipients." },
      { title: "Pick a preset", body: "Step 2 shows three starters: My specialty digest (auto-binds to your primary specialty), Active congress digest (auto-binds to a live congress), or Custom (mix any bindings)." },
      { title: "Combine bindings", body: "Open any of the four collapsible sections — Sources, Specialty, Congress, Hashtags — and combine them. The send job ORs them together." },
      { title: "Preview & send now", body: "From the digest detail you can run an on-demand preview send before the schedule fires.", tip: "Toggle 'Master enabled' off in Settings → Notifications to pause every digest at once without deleting them." },
    ],
    screenshot: "Digest wizard step 2 with presets and bindings",
    image: "/help-screenshots/digest-wizard.png",
  },
  {
    id: "settings-profile",
    number: "8",
    title: "Settings — Profile",
    overview:
      "Display name, email, and the multi-select for your urology specialties. Specialty selection drives 'For you' recommendations and the 'My specialty digest' preset.",
    steps: [
      { title: "Edit your profile", body: "Settings → Profile lets you change display name and review your email." },
      { title: "Pick specialties", body: "Use the chips to add or remove specialties. Mark one as primary — it's used by Quick Start and the digest presets." },
    ],
    screenshot: "Profile settings with specialty multi-select",
    image: "/help-screenshots/settings-profile.png",
  },
  {
    id: "settings-preferences",
    number: "9",
    title: "Settings — Preferences",
    overview: "Personal display preferences (theme, density, default landing tab).",
    steps: [
      { title: "Open Preferences", body: "Settings → Preferences." },
      { title: "Adjust density", body: "Switch between comfortable and compact for tighter table rows." },
    ],
    screenshot: "Preferences tab",
    image: "/help-screenshots/settings-preferences.png",
  },
  {
    id: "settings-notifications",
    number: "10",
    title: "Settings — Notifications",
    overview:
      "Per-event email toggles plus a master switch for all digests. Defaults here are applied to every new digest you create.",
    steps: [
      { title: "Toggle event emails", body: "Pick which events trigger an email — new post from a followed source, mentions, weekly summary, etc." },
      { title: "Master digest switch", body: "Turn 'Digests master enabled' off to pause every scheduled digest at once. The send-job skips you until you re-enable it." },
    ],
    screenshot: "Notifications tab",
    image: "/help-screenshots/settings-notifications.png",
  },
  {
    id: "settings-ai",
    number: "11",
    title: "Settings — AI",
    overview: "Pick the model and defaults used to generate summaries.",
    steps: [
      { title: "Choose a model", body: "Pick from the supported Lovable AI Gateway models — Gemini 2.5 Flash for speed, GPT-5 for hardest reasoning, etc." },
      { title: "Set defaults", body: "Tone, length, and audience defaults are applied to every new summary unless you override them at generation time." },
    ],
    screenshot: "AI settings",
    image: "/help-screenshots/settings-ai.png",
  },
  {
    id: "settings-x",
    number: "12",
    title: "Settings — X account",
    overview: "Connect one or more X (Twitter) accounts for posting and quoting. Switch between them from the top bar account chip.",
    steps: [
      { title: "Add an account", body: "Settings → X account and follow the four-step OAuth 1.0a credential guide." },
      { title: "Switch accounts", body: "Use the account chip in the top bar to choose which connected account to post as." },
      { title: "Disconnect", body: "Remove any account from the list at any time.", tip: "UroFeed uses OAuth 1.0a — you need Consumer Key/Secret AND Access Token/Secret." },
    ],
    screenshot: "X account settings",
    image: "/help-screenshots/settings-x.png",
  },
  {
    id: "compose",
    number: "13",
    title: "Sharing to X",
    overview:
      "Three ways to compose a post: the prominent Share to X button in the top bar, the inline composer above the Live Feed, and per-post Quote buttons. On mobile, a floating + button opens the same composer.",
    steps: [
      { title: "Top-bar Share to X", body: "Always visible in the top bar — opens the compose dialog from anywhere in the app." },
      { title: "Inline 'What did you take away?'", body: "Above the Live Feed stream — one click opens the dialog already focused, ready to type." },
      { title: "Quote a post", body: "Every post card has a Quote button. It opens the composer with the source URL appended so the embed shows up on X." },
      { title: "Mobile FAB", body: "On screens narrower than 768px, a floating + button anchors to the bottom-right and opens the same composer." },
    ],
    screenshot: "Compose dialog",
    image: "/help-screenshots/compose.png",
  },
  {
    id: "admin",
    number: "14",
    title: "Admin (admins only)",
    overview:
      "The Admin sidebar section appears only for users with the admin role and exposes platform-wide tools.",
    steps: [
      { title: "Users", body: "Invite, promote, or deactivate users; assign roles." },
      { title: "Groups", body: "Create and curate the source groups that show up under Discover → By group." },
      { title: "Recommendations", body: "Tune the recommendation engine, review nominated handles, and approve them into the catalogue." },
      { title: "Ingestion", body: "Trigger or inspect ingestion jobs, the queue, and webhook health." },
      { title: "Email diagnostics", body: "Inspect the email queue, recent sends, bounces, and DLQ entries." },
    ],
    screenshot: "Admin panel",
    image: "/help-screenshots/admin.png",
  },
  {
    id: "spotlight",
    number: "15",
    title: "Source Spotlight",
    overview:
      "A deep-dive page for any X handle in the catalogue. Click a @handle anywhere in the app — feed cards, digests, alerts — to land here. Combines header, themes, rhythm, inner circle, recent tweets, and the actions you'd want before a meeting or reply.",
    steps: [
      { title: "Open a Spotlight", body: "Click any @handle chip in the feed, in a digest, or in an alert match. Direct URL: /sources/:handle." },
      { title: "Read the header", body: "Avatar, display name, verified badge, bio, follower count, cancer-area chips, and group memberships. Group pills link back to /groups/:slug." },
      { title: "Use the CTAs", body: "Follow / Unfollow, 'Set up alerts' (creates a watchlist pre-filled with this source), and 'Generate briefing' (see next section)." },
      { title: "Themes panel", body: "LLM-derived themes from the last ~30 days of activity, each with cancer-area chips, top hashtags, and example tweets." },
      { title: "Rhythm panel", body: "Two histograms — hour-of-day and day-of-week — with an inferred timezone caption so you know when this person is most active." },
      { title: "Inner circle", body: "Two columns: who they reply to most, and who replies to them most. Hidden cleanly when there isn't enough signal.", tip: "Click any handle in either column to jump to that source's Spotlight." },
      { title: "Recent tweets", body: "Tabs for Recent and Top (re-ranked by engagement). Open any tweet in the standard thread dialog." },
    ],
    screenshot: "Source Spotlight with header, themes, rhythm, inner circle",
    image: "/help-screenshots/spotlight.png",
  },
  {
    id: "briefings",
    number: "16",
    title: "Source Briefings",
    overview:
      "A printable one-pager summarising a source's last 30 days — themes, recent stances, points of disagreement, conversation partners, upcoming relevance, and recommended angles. Designed for the 'before a congress, before a clinical meeting, before a cold reply' use case.",
    steps: [
      { title: "Generate a briefing", body: "On any Source Spotlight page, click 'Generate briefing'. First open takes 5–10s while the LLM runs; subsequent opens hit the weekly cache and render instantly." },
      { title: "Read the sections", body: "Executive summary, main themes (with weight bars), notable stances (with citations), points of disagreement, conversation partners, upcoming relevance, recommended angles, and caveats." },
      { title: "Recommended angles", body: "The highlighted section near the bottom — concrete conversation starters tied to specific recent tweets. This is the 'why you opened the briefing' payoff." },
      { title: "Copy as text", body: "Plain-text serialisation of all sections. Useful for pasting into a CRM, prep doc, or reply draft." },
      { title: "Print", body: "Optimised print stylesheet hides the dialog chrome, switches to a serif body, and breaks the page so Recommended Angles starts at the top of page 2.", tip: "Briefings are cached per source for 7 days. Admins see a refresh icon to force regeneration." },
    ],
    screenshot: "Source briefing dialog with all sections expanded",
    image: "/help-screenshots/briefings.png",
  },
  {
    id: "alerts",
    number: "17",
    title: "Alerts & Watchlists",
    overview:
      "Watchlists turn 'I want to know when X happens' into emails and an in-app inbox. Bind a watchlist to a source, group, congress, or hashtag, add topic keywords, and pick how you want to be told. The /alerts page has two tabs: Inbox (matches) and Watchlists (rules).",
    steps: [
      { title: "Create a watchlist", body: "Easiest path: open a Source Spotlight and click 'Set up alerts' — the dialog pre-fills source and target. You can also create one directly from /alerts → Watchlists tab." },
      { title: "Add topics", body: "Topics are keywords or short phrases. A match fires when a tweet from the target mentions any topic (literal or semantic). Press Enter to add a chip; click X to remove." },
      { title: "Configure email delivery", body: "Toggle email on, set quiet hours and timezone (defaults to your digest timezone), and choose a daily cap. Matches that arrive during quiet hours are coalesced into a single email when the window ends." },
      { title: "Inbox tab", body: "Stream of all matches across all watchlists. Each card shows source, tweet excerpt, matched-topic chip, and a match-reason chip ('keyword: …' or 'semantic: …'). Reply, Open on X, or Dismiss inline." },
      { title: "Real-time updates", body: "New matches appear instantly via realtime — both the topbar bell and the Inbox update without a refresh." },
      { title: "Mute / Pause / Delete", body: "Per-watchlist kebab menu: Mute 24h (in-app stays, email stops), Pause (no new matches at all), or Delete. The mute link in every email also works as a single-use 24h mute.", tip: "Use Pause when you're on holiday; use Mute when you just want a quiet day." },
    ],
    screenshot: "Alerts inbox with realtime match cards",
    image: "/help-screenshots/alerts.png",
  },
  {
    id: "reply-drafts",
    number: "18",
    title: "Reply Drafts",
    overview:
      "When you click Reply on a feed card or an alert match, the compose dialog can suggest three LLM-drafted replies in distinct registers — academic question, supporting context, or counterpoint. Pick one, edit, send.",
    steps: [
      { title: "Open the composer in reply mode", body: "Click Reply on any post (in the feed, a thread, or an alert match). The dialog opens with the source tweet quoted at the top." },
      { title: "Suggest drafts", body: "Click 'Suggest drafts'. Three options render in distinct registers so you can pick the angle that matches your voice." },
      { title: "Pick and edit", body: "Click a draft to populate the textarea (with the @handle pre-prepended). Edit freely — the draft is a starting point, not a script." },
      { title: "Send", body: "Posts using your active connected X account. Success toast includes a 'View on X' link.", tip: "Daily post limit is 50/account/day. If you hit it, you'll get a friendly error and the attempt is logged but never sent to X." },
    ],
    screenshot: "Compose dialog with three suggested reply drafts",
    image: "/help-screenshots/reply-drafts.png",
  },
  {
    id: "onboarding",
    number: "19",
    title: "Onboarding Wizard",
    overview:
      "The first-run flow that gets you from sign-up to a working feed in about three minutes. Steps: Welcome, Specialties, Congresses, Sources, Connect X, Hashtags, Review, Provisioning. Resumable — close it and a banner brings you back.",
    steps: [
      { title: "Pick specialties", body: "Choose 2–3 cancer areas and mark one primary. Drives 'For you' recommendations, the specialty digest preset, and the Quick Start panel." },
      { title: "Pick congresses & sources", body: "Optional but recommended — seeds your feed with relevant signal from day one." },
      { title: "Connect X", body: "Inserted between Sources and Hashtags. Opens the Connect X Wizard (next section). You can skip and connect later from Settings — a grace banner reminds you." },
      { title: "Pick hashtags", body: "1–2 hashtags relevant to your specialties keeps the live feed flowing." },
      { title: "Review & provision", body: "Confirm everything, submit, and the provisioning step seeds your initial ingestion. You land on the Dashboard with Quick Start active." },
    ],
    screenshot: "Onboarding wizard step list",
  },
  {
    id: "connect-x-wizard",
    number: "20",
    title: "Connect X Wizard",
    overview:
      "An eight-step illustrated walkthrough that takes you from 'no X developer account' to 'connected with Read+Write'. Used during onboarding and re-openable any time from Settings → X account.",
    steps: [
      { title: "Open the wizard", body: "Triggered automatically during onboarding, or on demand from Settings → X account → 'Set this up now'." },
      { title: "Walk the eight steps", body: "Create a developer account, create an App, choose a tier, configure permissions to Read+Write, generate Consumer Keys, generate Access Tokens, paste into UroFeed, verify." },
      { title: "Verify", body: "Step 8 calls X with your credentials and confirms 'Connected as @username — Read ✓ — Write ✓'. Confetti fires once and the wizard closes." },
      { title: "Grace period", body: "If you skip during onboarding, you have a grace period before posting features start nudging. The header shows a 'pending X connection' link.", tip: "Use a dedicated app, not your personal one, if you'll be posting on behalf of a team." },
    ],
    screenshot: "Connect X wizard step 8 with verified state",
  },
  {
    id: "brainstorm",
    number: "21",
    title: "Brainstorm",
    overview:
      "A standalone team chat surface (separate from Admin) for product and clinical team conversations. Realtime presence, reactions, and per-message read state.",
    steps: [
      { title: "Open Brainstorm", body: "Sidebar → Brainstorm. The badge counts unread messages addressed to your role." },
      { title: "Post a message", body: "Composer at the bottom; supports plain text, mentions, and reactions." },
      { title: "React", body: "Hover any message and pick a reaction. Reactions are realtime across all connected clients." },
      { title: "Catch up after time away", body: "The 'Unread since you were last here' dialog summarises what you missed when you reopen the channel." },
    ],
    screenshot: "Brainstorm message list with presence and reactions",
    image: "/help-screenshots/brainstorm.png",
  },
  {
    id: "groups",
    number: "22",
    title: "Groups",
    overview:
      "Curated, admin-maintained source lists (e.g. 'Prostate cancer KOLs', 'Industry voices'). Subscribe to a whole group and every member feeds into your stream. Group detail pages show members, recent activity, and let you subscribe in one click.",
    steps: [
      { title: "Browse groups", body: "Discover → By group shows every official group filtered by your specialties." },
      { title: "Open a group", body: "Click any card to open /groups/:slug — full member list with handle chips, follow status, and subscribe-to-group toggle at the top." },
      { title: "Subscribe", body: "Subscribing pins the group to your following set so all current and future members feed into your live stream." },
      { title: "Unsubscribe", body: "Unsubscribe at any time from the same toggle. Individually-followed members stay followed.", tip: "Group membership changes propagate automatically — no need to re-subscribe when admins add new handles." },
    ],
    screenshot: "Group detail page with member list and subscribe toggle",
    image: "/help-screenshots/groups.png",
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
              {section.image ? (
                <div className="mt-4 rounded-md border border-border overflow-hidden bg-panel-elevated/40">
                  <img
                    src={section.image}
                    alt={section.screenshot}
                    loading="lazy"
                    className="w-full h-auto block"
                  />
                </div>
              ) : (
                <div className="mt-4 rounded-md border border-dashed border-border bg-panel-elevated/40 aspect-[16/9] flex items-center justify-center text-text-muted text-sm">
                  Screenshot: {section.screenshot}
                </div>
              )}
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