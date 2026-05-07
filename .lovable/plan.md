## Add BYOK X (Twitter) posting + replying

A new opt-in feature letting each user paste their own X Developer App OAuth 1.0a credentials, then post original tweets and replies from inside UroFeed. The platform's existing read-only `X_BEARER_TOKEN` and all ingestion code stay untouched.

### What the user will see

1. **Settings → new "X (Twitter)" tab**
   - Disconnected state: explainer + 4 password inputs (Consumer Key/Secret, Access Token/Secret) + step-by-step "How to get these" disclosure + Connect button.
   - Connected state: `@username` card, verified-since, scope badge, today's post count vs 50/day cap, "Send a test tweet", "Disconnect", "Replace credentials", and a recent-posts log (last 20).

2. **New Compose dialog** (`ComposeTweetDialog`)
   - Compose mode: opened from a new "Compose" button in the AppShell top bar.
   - Reply mode: opened from a new reply icon button on every `TweetCard` (Feed, Dashboard, ThreadDialog). Shows the parent tweet quoted at top.
   - 280-grapheme counter (via `Intl.Segmenter`), Send disabled while empty/over/in-flight.
   - If not connected → gated CTA to Settings → X tab.
   - Toasts for sent (with "View on X" link), rate-limit, error.

### Database (one migration)

- `user_x_credentials` — owner row, `auth_mode` enum (currently only `oauth1_byok`), `consumer_key`, **`consumer_secret_encrypted bytea`**, `access_token`, **`access_token_secret_encrypted bytea`**, `x_user_id`, `x_username`, `scope_write`, `last_verified_at`, `last_post_at`, `post_count_today`, `post_count_window_start`, `revoked_at`, timestamps.
- `user_x_post_log` — `posted_tweet_id`, `in_reply_to_tweet_id`, `quoted_tweet_id` (reserved), `text`, `status` ∈ `sent|failed|rate_limited`, `error_code`, `error_message`, `posted_at`.
- `user_x_connection_status` view — exposes only safe columns (no encrypted bytea, no plaintext secrets).
- **Encryption**: `pgsodium` extension; key id stored in env var `PGSODIUM_KEY_ID`. All encrypt/decrypt happens server-side in `src/server/x-credentials.server.ts`.
- **RLS**: owner can SELECT the safe view. ALL writes (insert/update/delete) on the credentials table are blocked at RLS — only `supabaseAdmin` from server functions writes. `user_x_post_log`: owner SELECT, admin SELECT all, no client INSERT.

### Server-only modules

`src/server/x-credentials.server.ts`
- `encryptSecret` / `decryptSecret` — pgsodium wrappers.
- `loadCredentials(userId)` — returns plaintext for in-process use; throws if revoked.
- `verifyAndStore(...)` — calls `GET /2/users/me` with the supplied keys to validate & populate username, encrypts secrets, upserts row.
- `revoke(userId)` — wipes encrypted columns to NULL, sets `revoked_at`, best-effort `POST /1.1/oauth/invalidate_token`.

`src/server/x-posting.server.ts`
- Header comment: "Per-user credentials only. Never uses platform `X_BEARER_TOKEN`."
- `postTweet({ userId, text, inReplyToTweetId? })` — loads creds, OAuth 1.0a-signs `POST /2/tweets` (uses `oauth-1.0a` npm package + node `crypto`), enforces per-user 50/24h app-side rate limit via `post_count_today` / `post_count_window_start`, writes `user_x_post_log`, returns `{ id, url }`.

### RPC bridges (`src/serverFns/x-credentials.ts`)

All `requireSupabaseAuth`, all Zod-validated, none admin-only:
- `getXConnectionStatus()` — reads the safe view.
- `connectX({ consumerKey, consumerSecret, accessToken, accessTokenSecret })` — trims, length-checks, calls `verifyAndStore`, returns structured error code (`invalid_credentials` / `read_only_token` / `network_error`) on failure.
- `disconnectX()` — calls `revoke`.
- `postTweet({ text, inReplyToTweetId? })` — server-truth length + rate-limit checks, calls server posting fn.
- `listMyPosts({ limit?, cursor? })` — paginated read of own log.

### UI files

- `src/components/settings/XSettings.tsx` — the new tab body.
- `src/routes/settings.tsx` — add `<TabsTrigger value="x">X (Twitter)</TabsTrigger>` between Team and Ingestion (visible to all auth users).
- `src/components/x/ComposeTweetDialog.tsx` — both modes; consumes `connectX` status.
- `src/components/x/ReplyButton.tsx` — small icon button, mounted on `TweetCard`. If not connected, brief toast + nav to Settings → X.
- `src/components/shell/TopBar.tsx` — add a "Compose" button on the right.
- `src/components/feed/TweetCard.tsx` — mount `<ReplyButton>` in the action row (does NOT change the existing card-click → thread behavior; reply button stops propagation).

### Dependencies

- `bun add oauth-1.0a` (signing). Native `crypto` covers HMAC-SHA1.

### Safety / abuse rails

- 280 chars enforced server-side (graphemes via `Intl.Segmenter`).
- 50 posts / 24h rolling per-user cap enforced server-side; over-cap writes a `rate_limited` log row and never hits X.
- Every post outcome (sent/failed/rate_limited) is logged.
- Plaintext secrets never leave the server; client form is empty on revisit; "Replace credentials" re-shows inputs.
- `X_BEARER_TOKEN` and `xApiV2.ts` left untouched.

### Out of scope (deferred, explicitly noted in code comments where relevant)

- OAuth 2.0 PKCE platform-app flow (schema already supports a 2nd `auth_mode`).
- LLM "Suggest replies" — flagged as a follow-up; not shipped this turn to keep scope tight.
- Quote tweets, threads, media, polls, scheduled tweets, team accounts, webhooks.

### Done means

A user pastes 4 valid keys → sees `@handle` reflected → clicks Reply on any tweet → tweet appears on X within seconds → log row `sent`. The 51st post in 24h is blocked with a clear in-app message and a `rate_limited` log row. Disconnect wipes encrypted columns. Existing ingestion is unchanged.

---

**Heads up before I start:** this is large (one migration, two server modules, one RPC bridge, three new UI files, two edits to existing UI). I'll ship the core — schema, server functions, Settings tab, Compose+Reply dialog, reply button on `TweetCard`, top-bar Compose button — and skip the LLM "Suggest replies" sugar (deferred). I'll also need you to set the `PGSODIUM_KEY_ID` secret after the migration creates the key.

Approve and I'll implement.