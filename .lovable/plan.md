## Scope

Surface-level restructure across navigation, Discover, Compose entry points, and Settings. One small migration adds digest preference columns; no other schema changes.

---

### 1. Sidebar (`src/components/shell/Sidebar.tsx`)

Restructure into two visible sections + a bottom utility area separated by a divider.

- Workspace (non-admin): Dashboard, Live Feed, Summaries, Congresses, Discover, **My Following** (was Sources), Digests
- Admin section (admin only): Users, Groups, Recommendations, Ingestion, **Brainstorm** (moved here), **Email diagnostics** (new entry → `/admin/email-diagnostics`)
- Bottom (above collapse toggle, divider above): Help, Settings
- Remove "Configuration" group entirely; remove second Discover entry; remove the Help group container (Help becomes a bottom item; Contact stays as a bottom item too).
- Re-route `/admin/email-diagnostics` to render `EmailDiagnosticsView` (currently it redirects to `/admin/users` — replace).

### 2. Discover unification

- Rewrite `src/routes/discover.tsx` (currently `<Outlet />`) into a real page with a header and three tabs (`for-you`, `by-group`, `by-specialty`).
- Tab persistence: `localStorage["urofeed:discover:tab"]`, default `by-specialty` for new users; reads `?tab=` search param to allow direct linking.
- Header filter bar above tabs: search input, specialty chip filter, verified-only toggle. Filters apply to all three tabs (passed down as props).
- Reuse existing logic from `discover.index.tsx` and `discover.groups.tsx` by importing their main components.
- New "By specialty" tab component:
  - Reads `user_specialties` for current user → queries `recommended_sources_by_specialty` joined to `sources` filtered by those specialty IDs.
  - Excludes sources already followed (left-join `user_subscribed_sources` filter).
  - Groups by specialty with section headers ("Specialty · N recommendations"), primary specialty first, weight desc.
  - Empty state when user has no specialties: prompt + button dispatches `urofeed:open-wizard-step` event with `Specialties` step.
  - Follow uses existing `useFollowSource` hook.
- Old routes:
  - `discover.index.tsx` → redirect to `/discover?tab=for-you`
  - `discover.groups.tsx` → redirect to `/discover?tab=by-group`

### 3. Compose promotion

- `TopBar.tsx`: replace ComposeButton with primary CTA (`bg-accent text-accent-foreground`, h-9, ~110px wide, "Share to X" + Send icon) on `sm+`, 40px accent icon-only on mobile. Same dialog.
- `TweetStream.tsx` (top of feed): inline composer Panel with avatar + muted prompt "What did you take away from this?". Click opens `ComposeTweetDialog` with initialText pre-filled with the active congress's first primary hashtag if `feedFilters.congressId` is set.
- `TweetCard.tsx`: add Quote icon between reply and external-link. Opens compose dialog with initialText `https://x.com/<handle>/status/<id>\n\n` and cursor at the end.
- Mobile FAB: new `<MobileComposeFab />` rendered inside `AppShell.tsx`. Uses a `useShouldShowComposeFab(pathname)` hook with allowlist (`/`, `/dashboard`, `/feed`, `/summaries`, `/congresses`, `/congresses/$`, `/sessions/$`, `/discover`, `/sources`, `/digests`); hidden on `/auth`, `/settings`, `/admin/*`, `/help/*`, `/configuration/*`, `/unsubscribe`. 56px circle, `fixed bottom-6 right-4 z-30`, accent bg, Plus icon, `active:scale-95`, `shadow-lg`, only shows on viewport `< md`. Hidden when dialog is open and when keyboard visible (visualViewport heuristic).

### 4. Settings consolidation

- Tabs: **Profile** · Preferences · **Notifications** · AI · X account
- Drop Team and Ingestion tabs (and their imports).
- New `ProfileSettings.tsx`: read-only email, editable display_name + avatar_url (writes to `profiles`), specialty multi-select moved from Interests (writes to `user_specialties`), Sign out button. Remove the Interests tab entirely.
- Rename "X (Twitter)" tab label to "X account".
- New `NotificationsSettings.tsx`: top mono caption with link to `/digests`. Then form bound to new `user_preferences` columns:
  - `digest_default_frequency` (daily | weekly | biweekly | monthly, default weekly)
  - `digest_default_send_hour` (0–23, default 9)
  - `digest_default_timezone` (text, default 'UTC')
  - `digests_active_by_default` (bool, default true)
  - `digests_master_enabled` (bool, default true) — when false, `send-digests` route skips the user
  - In-app toggles: `notify_new_summary` (bool), `notify_new_tweet_followed_source` (bool), `notify_weekly_recap` (bool)
- DigestWizard reads defaults from `user_preferences` (replaces hardcoded `weekly` / `9`).
- `send-digests` cron handler: skip subscriptions where the owning user has `digests_master_enabled = false`.
- `/digests` stays as-is, sidebar entry stays. No redirect.

### 5. Migration

Add columns to `user_preferences` with defaults so existing rows stay valid:

```sql
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS digest_default_frequency text NOT NULL DEFAULT 'weekly',
  ADD COLUMN IF NOT EXISTS digest_default_send_hour smallint NOT NULL DEFAULT 9,
  ADD COLUMN IF NOT EXISTS digest_default_timezone text NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS digests_active_by_default boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS digests_master_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_new_summary boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_new_tweet_followed_source boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_weekly_recap boolean NOT NULL DEFAULT true;

ALTER TABLE public.user_preferences
  ADD CONSTRAINT user_preferences_digest_frequency_check
  CHECK (digest_default_frequency IN ('daily','weekly','biweekly','monthly'));

ALTER TABLE public.user_preferences
  ADD CONSTRAINT user_preferences_digest_send_hour_check
  CHECK (digest_default_send_hour BETWEEN 0 AND 23);
```

No RLS changes needed (existing per-user policies on `user_preferences` cover the new columns).

---

### Implementation order

1. Run the migration (await approval).
2. Sidebar restructure + email-diagnostics route swap.
3. Discover unification + redirects.
4. Settings tabs (Profile, Notifications, drop Team/Interests/Ingestion).
5. DigestWizard + send-digests honor new prefs.
6. Compose promotion (TopBar, inline composer, TweetCard quote, mobile FAB).
7. Sanity check build, navigate the affected routes in preview.

### Out of scope

- No changes to `BrainstormUnreadDialog` or its preference (already done in prior turn).
- No new bottom-tab-bar (POLISH_TODO item, not built).
- No copy/visual changes outside the surfaces named above.