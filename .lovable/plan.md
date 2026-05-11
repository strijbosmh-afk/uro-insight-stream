# Connect-X Wizard + Per-User Ingestion

## Scope

1. Schema: extend `user_x_credentials`, add `user_x_setup_progress`, add `profiles.x_grace_until`, ensure `ingest_queue.requested_by` exists.
2. Wizard UI: `XConnectWizard` — 8 steps, resumable, opened from Settings → X tab and from a new (skippable) onboarding step. Honest SVG illustrations using app palette + font, captioned "Illustration".
3. Ingestion refactor: worker resolves credentials per `requested_by` user; falls back to `X_BEARER_TOKEN` only inside the user's per-user grace window with reduced cadence (1×/day) and source cap (top 10 most-recently-subscribed).
4. Status surfaces: connected card with read/post quota usage; banner after grace expires for unconnected users.

## Steps

```text
1  Do you have a developer account?     → branch: yes / no (link to developer.x.com signup)
2  Pick your tier (Free/Basic/Pro)      → user-declared, stored on credentials.tier; explains read+post quota
3  Create a Project + App                → illustration of Portal nav
4  Set User authentication settings      → Read+Write, OAuth 1.0a, Type=Web App, callback http://localhost
5  Generate Consumer Keys + Access Token → illustration of Keys&Tokens tab; "regenerate Access Token AFTER setting permissions"
6  Paste credentials                     → 4 inputs; calls existing connectX server fn (verifies + stores encrypted)
7  Verify                                → shows username pulled back, read+post scopes
8  Done                                  → links to Sources page; explains grace period if applicable
```

Each step:
- Left: instructions + copy buttons for callback URL.
- Right: SVG illustration component (`<PortalIllustration variant="..." />`) with footer "Illustration — the actual X Developer Portal may look different."
- Bottom: Back / Save & exit / Next. Progress persisted on Next via `saveSetupProgress` server fn.

## Per-user ingestion

`src/server/ingestion.server.ts` (and queue worker `process-ingest-queue`):

```text
for each job with requested_by = U:
  creds = getActiveCredentials(U)       // decrypts via x-credentials.server
  if creds: use OAuth1 user-context for X v2 search
  else:
    grace_until = profile.x_grace_until ?? created_at + 14d
    if now < grace_until AND job is among U's top-10 most-recent subs
       AND U has no successful ingest in last 24h:
         use platform X_BEARER_TOKEN
    else: mark job skipped(reason='no_credentials' | 'grace_expired' | 'rate_capped')
```

Bump per-user `read_count_today` (rolling 15-min window resets).

## Files

**Migrations** (single migration):
- `alter user_x_credentials add tier, scope_read, read_count_window_start, read_count_today`
- `create user_x_setup_progress` + RLS owner-only
- `alter profiles add x_grace_until timestamptz` + backfill `created_at + interval '14 days'`
- `alter ingest_queue add requested_by uuid` (only if missing)

**Server**
- `src/server/x-ingestion-credentials.server.ts` — resolve creds + grace policy.
- Patch `src/server/ingestion.server.ts` to use it.
- `src/serverFns/x-setup-progress.ts` — get/save wizard progress; `setTier`.

**Client**
- `src/components/x-wizard/XConnectWizard.tsx` (Dialog host + step router)
- `src/components/x-wizard/steps/Step1Account.tsx` … `Step8Done.tsx`
- `src/components/x-wizard/PortalIllustration.tsx` (8 variants, inline SVG, themed)
- `src/components/x-wizard/IllustrationFrame.tsx` (caption wrapper)
- Hook into `XSettings.tsx`: replace raw key form with "Connect via wizard" CTA + keep advanced manual entry collapsed.
- `OnboardingWizard.tsx`: insert "Connect X" step (skippable; sets a dismissed flag).
- `AppShell` or top-level: show `XGracePostExpiryBanner` when `!connected && now > x_grace_until`.

## Acceptance

- Migration applies cleanly; existing connected users unaffected.
- Wizard opens from Settings → X and onboarding; step state persists across reload.
- Pasting valid keys returns username and writes encrypted record.
- Ingest job for connected user uses their token (verified via `ingestion_runs` notes column carrying `auth=user`).
- Ingest job for unconnected user within grace runs once/day on top-10 sources only.
- After grace, unconnected user sees banner; their queued jobs are marked skipped with `grace_expired`.

## Out of scope (this pass)

- Real X Developer Portal screenshots (illustrations only; slot left for later).
- OAuth-based "one-click connect" (still manual key paste).
- Automatic tier auto-detection (user-declared).
