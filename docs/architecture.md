# UroFeed Clinical — Architecture

Living document of the as-built system. Written for a new contributor who
needs to find the code from a high-level concept. Pair with the saved Lovable
prompts in `outputs/` for the per-feature spec record.

## 1. Overview

UroFeed Clinical helps oncology professionals stay on top of the X (Twitter)
conversation around their subspecialty. Users **discover** sources and groups
aligned to their cancer area, drill into a source's **Spotlight** for themes
and a generated **Briefing**, set **Alerts** (watchlists) on keywords or
sources, draft a **Reply** with LLM assistance, and **Post** back to X
through their own bring-your-own-key credentials. Underneath, a per-user
ingestion pipeline keeps the feed live without sharing a single API quota.

## 2. Data model (load-bearing tables)

- **Identity** — `auth.users` (Supabase-managed) + `public.profiles` (display
  name, avatar, `pending_x_connection`, `x_grace_until`, `is_demo`). Roles
  live in `public.user_roles` with `has_role()` / `is_admin()` helpers.
- **Subscriptions** — `user_subscribed_sources`, `user_subscribed_hashtags`,
  `user_subscribed_congresses`, `user_specialties`, `user_onboarding_state`.
- **Sources & taxonomy** — `sources` (X profile cache), `cancer_areas` and
  `cancer_area_signals` (keyword / hashtag dictionary used by classifiers),
  `source_groups` + `source_group_members` (curated bundles), the materialized
  `user_effective_sources` view (subscriptions ∪ group memberships).
- **Congresses & sessions** — `congresses`, `sessions`, `abstracts`,
  `congress_featured_sources`, `congress_cancer_areas`.
- **Tweets** — `tweets` (the core fact table) + `ingestion_runs` audit.
- **Watchlists** — `watchlists`, `watchlist_keywords`, `watchlist_matches`,
  `watchlist_pending_deltas`, `watchlist_classifier_cache`,
  `watchlist_mute_tokens`.
- **X credentials** — `user_x_credentials` (OAuth1 tokens, pgsodium-encrypted),
  `user_x_setup_progress`, `user_x_follows_cache`, `user_x_read_counters`.
- **Queue** — `ingest_queue` (per-source jobs), `ingest_queue_run_log`,
  `ingestion_config`.
- **LLM caches** — `source_briefings`, `source_themes_cache`,
  `reply_drafts_cache`, `congress_suggestion_cache`, `congress_lookup_cache`.
- **Ops** — `audit_log`, `admin_audit_log`, `email_send_log`,
  `email_send_state`, `ops_alerts`.

Most user data is gated by RLS keyed on `auth.uid()`; admin tables use the
`is_admin(auth.uid())` security-definer helper.

## 3. X integration (BYOK)

- **Credential storage** — `user_x_credentials` stores per-user OAuth1
  consumer/secret + access tokens, pgsodium-encrypted at rest. Surfaced via
  `src/serverFns/x-credentials.ts`.
- **OAuth1 adapter** — `src/adapters/twitter/xApiV2OAuth1.ts` signs requests
  with the user's tokens. Generic adapter interface in `src/adapters/twitter/`.
- **Routing** — `src/server/x-ingestion-credentials.server.ts#resolveIngestionAuth`
  picks per-user OAuth1 if present, else falls back to the platform bearer
  token only inside the user's 14-day grace window.
- **Grace policy** — On signup, `profiles.x_grace_until = now() + 14 days`.
  After expiry, ingestion for that user pauses until they connect.
- **Wizard** — `src/components/x-wizard/XConnectWizard.tsx` walks the user
  through 8 illustrated steps mirroring the X Developer Portal. Progress is
  persisted in `user_x_setup_progress`.
- **Banners** — `PreGraceBanner` (days 0–13, escalating tiers) and
  `PostGraceBanner` (day 14+) under `src/components/x-wizard/`. Mounted in
  `AppShell`. Pre-grace dismissal is per-session (sessionStorage).
- **Header link** — `ConnectXHeaderLink` in `src/components/shell/TopBar.tsx`
  shows an accent dot indicator when `profiles.pending_x_connection = true`
  (user explicitly skipped onboarding's Connect-X step).
- **Import follows** — `src/server/x-follows.server.ts` pages the user's
  /following endpoint, scores each handle against `cancer_area_signals`, and
  surfaces the result through `src/components/x/ImportFollowsPanel.tsx` for
  bulk subscription. Cached for 7 days in `user_x_follows_cache`.

## 4. Ingestion pipeline

1. **Enqueue** — `src/routes/api/public/hooks/tweet-ingest.ts` (cron + on-
   demand triggers) inserts `ingest_queue` rows; the route does not call X
   itself.
2. **Consume** — `src/routes/api/public/hooks/process-ingest-queue.ts` runs
   on a separate cron, picks up to N pending jobs (`enrichment_status =
   'pending'`), calls `runIngestionForTarget` in
   `src/server/ingestion.server.ts`, upserts tweets, and fires
   `classifyNewTweets` in the watchlist classifier.
3. **Lifecycle** — `enrichment_status` is the source of truth (`pending →
   processing → completed | failed | rate_limited`). The legacy `status`
   column is mirrored automatically by the
   `trg_sync_ingest_queue_status` trigger; no code path should write `status`
   directly.
4. **Bio enrichment** — `src/server/x-enrichment.server.ts` dual-writes
   profile metadata (display name, avatar, bio, followers) into both
   `sources` and `source_candidates`.
5. **Monitor** — `src/routes/api/public/hooks/check-queue-health.ts` runs
   every 5 minutes and inserts a `stale_ingest_queue` row into `ops_alerts`
   when ≥ 20 jobs are pending for > 30 minutes. Admins triage on
   `/admin/ops`.

## 5. Source groups & cancer areas

- **Taxonomy** — `cancer_areas` (e.g. `prostate`, `bladder`, `kidney`) is the
  spine. `cancer_area_signals` rows attach scoring weight to keywords or
  hashtags per area; consumed by the watchlist classifier, source-candidate
  scorer, and X-follows scorer.
- **Groups** — `source_groups` with `visibility ∈ {private, public,
  official}`; admins curate `official` groups. Membership lives in
  `source_group_members`. The `user_effective_sources` view unions personal
  subscriptions with group-based ones so feed/digest queries hit a single
  surface.
- **Population pipeline** — Three layers feed `source_candidates`:
  (a) bootstrap seeds from cancer-area signals,
  (b) rules in `src/server/group-rules.server.ts` that nominate candidates
  from observed mentions/replies,
  (c) admin curation in `/admin/groups` (review, promote, dismiss).

## 6. Watchlists

- **Schema** — `watchlists` (one per user-defined alert), `watchlist_keywords`
  (terms), `watchlist_matches` (tweet × watchlist hits), `watchlist_pending_deltas`
  (queued for coalesced email), `watchlist_classifier_cache` (verdict reuse),
  `watchlist_mute_tokens` (one-click email mute).
- **Classifier** — `src/server/watchlist-classifier.server.ts` runs a fast
  keyword/regex pass first; only ambiguous candidates fall through to the LLM
  (Lovable AI Gateway via `aiService`). The shared verdict cache prevents
  re-spending tokens on the same tweet × keyword pair.
- **Delivery** — `src/server/watchlist-delivery.server.ts` coalesces matches
  in 5-minute windows, then `/api/public/hooks/watchlist-flush.ts` (cron)
  emits a single delta email per user × watchlist.
- **UI** — `/alerts` route, `WatchlistFormDialog`, `NotificationsBell` in the
  topbar, real-time updates via `useWatchlistRealtime`.

## 7. LLM features

- **Gateway** — All LLM calls go through `aiService` in `src/services/`,
  which talks to the Lovable AI Gateway (no per-user API key).
- **Shared cache shape** — Themes, briefings, reply drafts, and watchlist
  verdicts each have a dedicated cache table keyed by stable inputs
  (`source_id + week_start`, `tweet_id + keyword`, etc.) with an `expires_at`
  TTL, so a regenerate request hits the cache by default and a force-refresh
  flag busts it.
- **Briefings** — `src/server/source-briefing.server.ts` produces a
  structured one-pager (themes, stances, disagreements, citations) for the
  Spotlight page; surfaced via `SourceBriefingDialog`.
- **Reply drafts** — `src/server/reply-drafts.server.ts` produces three
  voice variants (academic / supporting / methodological).
- **Cancer-area signals** — The `cancer_area_signals` dictionary is a
  cross-cutting input: every classifier and scorer reads it so that
  taxonomy edits propagate without code changes.

## 8. Admin

- **Auth** — `src/server/admin-middleware.server.ts#assertAdmin` reads
  `user_roles` via the user-context client; throws 403 on failure. All admin
  server fns call it after `requireSupabaseAuth`.
- **Audit logs** — `audit_log` records app-level actions; `admin_audit_log`
  is admin-only and tracks privileged operations (invites, role changes).
- **Routes** — `/admin/ingestion`, `/admin/users`, `/admin/groups`,
  `/admin/recommendations`, `/admin/email-diagnostics`, `/admin/ops`.
- **Ops surface** — `/admin/ops` lists unacknowledged `ops_alerts`. The
  `stale_ingest_queue` alert is wired today; `llm_quota_exhausted`,
  `x_rate_limit_burst`, and `watchlist_classifier_failure` are reserved enum
  slots for future monitors.
- **Smoke endpoints** — Demo provisioning and reset under `/admin/ingestion`.

## 9. Operational shape

- **Triggering crons manually** — Each cron route is an HTTP POST under
  `/api/public/hooks/` that requires `Authorization: Bearer <X_JOB_SECRET>`,
  sourced from the Postgres vault via `get_cron_job_secret()`. To trigger
  one by hand, fetch the secret with `select public.get_cron_job_secret();`
  and POST to the route.
- **Where to look when things break**:
  - **Stuck ingestion** → `select count(*) from ingest_queue where
    enrichment_status = 'pending' and requested_at < now() - interval '30 min';`
    and the `/admin/ops` dashboard.
  - **Watchlist false positives / negatives** → `watchlist_matches.match_reason`
    is a structured JSON column with the keyword path and (if applicable) LLM
    verdict + confidence.
  - **Email delivery** → `email_send_log` (per-message), `email_send_state`
    (global throttle / retry-after-until).
  - **Privileged actions** → `admin_audit_log`.
  - **Rate-limit shape** → `rate_limit_lookups`, `rate_limit_global_lookups`,
    `rate_limit_congress_suggest`, `rate_limit_access_requests`.
  - **X auth issues** → `user_x_credentials.revoked_at`,
    `user_x_setup_progress.notes`, `user_x_read_counters` for per-user usage.

## Appendix — Key file paths

- Routing: `src/router.tsx`, `src/routes/`
- Shell: `src/components/shell/`
- X wizard: `src/components/x-wizard/`, `src/components/x/`
- Onboarding: `src/components/wizard/OnboardingWizard.tsx`
- Server fns (RPC): `src/serverFns/`
- Server-only logic: `src/server/`
- Migrations: `supabase/migrations/`
- Cron routes: `src/routes/api/public/hooks/`