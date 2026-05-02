# POLISH_TODO

Items deferred from the polish turn (2026-05-02). Each line says **why
deferred** so the next polish turn can pick them up cleanly.

## Deferred

- **Mobile responsive shell @ 768px (bottom tab bar, collapsing top bar with
  expandable search, stacked panels with sticky tab strip)** — touches the
  shell + every multi-pane route; needs its own turn so it can be tested on a
  real phone (not just devtools) and the breakpoint behaviour can be verified
  per-route. Currently the desktop grid degrades reasonably on tablet but is
  not phone-ready.
- **Keyboard shortcuts + `?` help modal** (`g d` dashboard, `g f` feed,
  `g s` sources, `/` focus search, `j`/`k` navigate tweet list, `r`
  regenerate summary) — power-user feature, not blocking demo.
- **Print stylesheet for Session detail** — redundant with the new PDF + MD
  export. Revisit only if users explicitly ask for browser print.
- **Dark/light toggle** — RayStation brand stays dark; light mode dilutes
  the visual identity. Don't add until a customer requests it.
- **Admin audit log viewer UI** — admin can SQL the `audit_log` table
  directly until a real need emerges. When implemented, do it as a separate
  turn together with: (a) migrating audit writes to Postgres triggers
  (currently scattered `recordAudit()` calls, gap-prone), (b) backfilling any
  missing call sites, (c) adding RLS so only admins can `SELECT`.
- **Full a11y pass (focus rings on every interactive element in `--accent`,
  AA contrast on all text against panels, ARIA labels on all icon
  buttons)** — should happen in a dedicated turn, not bundled with visual
  polish. Use axe-core or Lighthouse a11y audit as the acceptance criterion.

## Done in this turn

- Empty states for every list (Sources, Hashtags, Congresses, Sessions,
  Live Feed, Summaries) using the new `<EmptyState>` primitive — 1px border
  panel, lucide icon, mono caption, accent action.
- Panel-shaped skeletons (`TweetCardSkeleton`, `SummarySkeleton`,
  `SessionRowSkeleton`, `TableRowSkeleton`, `CardSkeleton`) wired into list
  loading paths.
- PDF + Markdown export of summaries from the Session detail page and the
  Summaries index. Direct `jsPDF` text rendering (selectable, searchable).
  Filename: `urofeed_<congressShortCode>_<sessionSlug>_<YYYYMMDD>.{pdf,md}`.