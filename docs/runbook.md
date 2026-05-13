# Operations Runbook

Living document for on-call response and known single-points-of-failure.
Edit this file when ops invariants change.

## H-O1 — Cron is a single point of failure (Supabase pg_cron)

All scheduled work (ingestion ticks, queue health, digest sends, watchlist
flush, demo reset, source-candidate aggregation, group-member nomination)
runs from **Supabase pg_cron** invoking `/api/public/hooks/*` via `pg_net`.

**Failure mode:** if the Supabase project is paused, upgraded, or pg_cron
stops firing, ingestion silently stops. There is **no Cloudflare Workers
scheduled trigger** acting as a redundant heartbeat.

**Detection:** `ingest_queue` rows pile up in `pending` and the
`check-queue-health` cron emits `stale_ingest_queue`. If health-check itself
stops firing, the alert never fires — monitor `cron.job_run_details` from a
separate channel (Supabase dashboard) at least daily.

**Mitigation backlog:** add a Cloudflare Workers `scheduled` handler that
calls the same hook URLs as a backup heartbeat. Tracked separately.

## H-O2 — Worker rollback

`wrangler.jsonc` is intentionally minimal — no script timeout override, no
rollback-to-version pin. To roll back a bad deploy:

```sh
npx wrangler deployments list
npx wrangler rollback <deployment-id>
```

The Lovable "Restore" button publishes the previous commit through the
normal pipeline; for an emergency revert without rebuilding use
`wrangler rollback`.

## H-O3 — Cron route inventory

Routes under `src/routes/api/public/hooks/` and their schedule status (as of
last audit):

| Route | Scheduled? | Notes |
|---|---|---|
| `process-ingest-queue` | Yes | Every 1m |
| `check-queue-health` | Yes | Every 5m — also reaps stale `processing` rows and emits signup-spike alerts |
| `tweet-ingest` | Yes | Every 10m |
| `match-tweets-to-sessions` | Yes | Every 15m |
| `summarize-job` | Yes | Every 10m |
| `send-digests` | Yes | Hourly |
| `watchlist-flush` | Yes | Hourly |
| `backfill-hierarchy-recent` | Yes | Daily |
| `aggregate-source-candidates` | **No** | Manual-only — admin trigger from `/admin/source-candidates`. Schedule daily if traffic warrants. |
| `nominate-group-members` | **No** | Manual-only — admin trigger from `/admin/groups`. |
| `reset-demo-account` | **No** | Manual-only — fired from admin UI. **Should be scheduled hourly** so demo session leaks don't persist. |
| `test-hierarchy-parse` | **No** | Diagnostic only; do not schedule. |

If a route is intentionally manual, leave it deployed but document the
trigger UI. If it's dead code, delete the file in a follow-up cleanup.

## H-O6 — Per-user X read budget

Write side is enforced atomically via `try_reserve_x_post_slot` (50 posts /
24h per user) — see `src/server/x-posting.server.ts`.

**Read side is currently unenforced beyond the 7-day cache on
`fetchMyXFollows`.** A user spamming the "Re-import follows" button can
burn the whole project's X API budget. Mitigation backlog: add a
`try_reserve_x_read_slot` RPC (e.g. 5 follow-list reads / 24h per user) and
gate `fetchMyXFollows` on it.

Until then: Settings UI throttles client-side, and the
`x_rate_limit_burst` ops alert (wired in `x-posting.server.ts` and
`x-follows.server.ts`) catches sustained pressure within 1h.

## H-O8 — Demo account hardening

The demo account email `demo@urofeed.app` is hard-coded in
`src/server/demo-seed.server.ts` (`DEMO_EMAIL`).

**Risk:** anyone who learns the address can request a Supabase password
reset and take over the demo session.

**Mitigations in place:**
- The hourly `reset-demo-account` cron rotates demo state. **It must also
  rotate the demo password** (set via the Admin API to a random secret) —
  see TODO in `reset-demo-account.ts`. Until that lands, treat password
  reset on the demo email as a known accepted risk.
- The demo path in `postTweet` writes to `demo_posts` and never hits the
  real X API, so a takeover cannot post from the org X account.

**Recommended next step:** in `resetDemoAccount`, call
`supabaseAdmin.auth.admin.updateUserById(demoUserId, { password: <random> })`
and store the current password in a secret read by the public landing page
"Try the demo" button.

## Ops alert taxonomy

The `ops_alerts` table has the following `alert_kind` values currently
wired to be written:

| Kind | Source | Severity | Dedup |
|---|---|---|---|
| `stale_ingest_queue` | `check-queue-health` | critical | 6h |
| `stale_processing_jobs` | `check-queue-health` | warning | 1h |
| `signup_spike` | `check-queue-health` | warning | 1h |
| `llm_quota_exhausted` | `llm-quota.server.ts` | info | 6h |
| `global_llm_cap_hit` | `llm-quota.server.ts` | critical | 6h |
| `watchlist_classifier_failure` | `watchlist-classifier.server.ts` | warning | 1h |
| `x_rate_limit_burst` | `x-posting.server.ts`, `x-follows.server.ts` | warning | 1h |

View open alerts: Admin → Ops Alerts.