## Scope

One turn covers: (1) the `Regenerate drafts` admin fold-in on `ComposeTweetDialog`, and (2) Phase 1 of Watchlist Alerts — schema, hybrid matcher, in-app surfaces, opt-in email delivery, Spotlight + Group CTAs. Watchlist analytics dashboards and per-watchlist tuning UI beyond the basics are explicitly out.

## Part A — Regenerate drafts (fold-in)

- `suggestReplyDrafts` server fn: add `refresh?: boolean` (Zod). When `true`, require admin via existing `assertAdmin`; bypass cache, call LLM, upsert row, write `admin_audit_log` (`action='reply_drafts.regenerate'`, `metadata={tweet_id}`).
- `ComposeTweetDialog` reply mode: small `RotateCw` icon button beside "Quick-start drafts" header, visible only when `useAuth().roles.includes('admin')`. Click → confirm dialog → call `suggestReplyDrafts({ tweetId, refresh: true })` → invalidate the react-query key.
- No migration, no other surface changes.

## Part B — Watchlist Alerts (Phase 1)

### Schema (one migration)

```text
user_watchlists
  id uuid pk, user_id uuid, name text,
  target_kind text check in ('source','group'),
  target_source_id text null, target_group_id uuid null,
  email_enabled bool default false,
  quiet_hours_start smallint default 22,
  quiet_hours_end smallint default 8,
  max_emails_per_day int default 10,
  is_active bool default true,
  muted_until timestamptz null,
  created_at, updated_at,
  CHECK ((target_source_id is not null) <> (target_group_id is not null))

user_watchlist_topics(id, watchlist_id, topic text, is_active bool, created_at)

user_watchlist_matches(
  id, watchlist_id, tweet_id, matched_topic text,
  match_reason jsonb,           -- { kind:'keyword'|'llm', matched_topic, evidence }
  classified_at, delivered_via text[], dismissed_at timestamptz null
)

watchlist_match_cache(
  tweet_id text, topic_set_hash text, matches jsonb, classified_at,
  PRIMARY KEY (tweet_id, topic_set_hash)
)

user_llm_quota(user_id pk, day date, classifications int default 0)

watchlist_email_sends(   -- for daily cap + 5min coalescing
  id, user_id, watchlist_id, sent_at, match_ids uuid[]
)
```

RLS: owner-scoped on watchlists/topics/matches; cache + quota service-role-only writes, authenticated read of own quota.

### Server pipeline

`src/server/watchlist-classifier.server.ts`
- Hook called from existing ingest path after a new tweet from a tracked source is inserted.
- For each active watchlist whose target matches the tweet's source (single SQL with `LEFT JOIN source_group_members`, `SELECT DISTINCT`):
  1. Keyword pass (case-insensitive substring against active topics).
  2. If no keyword hit AND user under daily LLM cap → enqueue for batched LLM pass.
- Batch LLM pass per ingest tick: group pending tweets by `topic_set_hash`, single structured call per group ("for each tweet, which topic matches or none"). Write results to `watchlist_match_cache`. Hash = `sha256(sorted lowercase topics)`.
- Insert `user_watchlist_matches` rows with structured `match_reason`.
- Increment `user_llm_quota`.

### Delivery

`src/server/watchlist-delivery.server.ts`
- For each new match, schedule via existing in-app bell (always on).
- Email path only if: `email_enabled && now() outside quiet hours in user tz && sends-today < cap && not muted_until > now()`.
- 5-minute coalescing: before sending, check `watchlist_email_sends` for same watchlist within last 5min — if present, append `match_ids` to that record and skip a new email; otherwise send via Resend (reuse digest pipeline) listing 1..N matches with one-tap "Mute 24h" signed URL (reuse digest unsubscribe signing) and "Unsubscribe" link.

### Server functions (`src/serverFns/watchlists.ts`)

- `listMyWatchlists`, `createWatchlist`, `updateWatchlist`, `deleteWatchlist`, `setTopics`, `muteWatchlist(hours)`.
- `listMyMatches({limit, cursor})`, `dismissMatch(id)`, `getUnreadCount`.
- Public `muteWatchlistByToken({token})` for the email link.

### UI

- New route `src/routes/_authenticated/alerts.tsx`: list of recent matches grouped by day, with tweet card, match-reason chip ("keyword: PARP" / "semantic: olaparib"), Reply / Open on X / Dismiss. Sidebar lists user's watchlists with edit/mute/delete.
- Notification bell in `TopBar` with unread badge from `getUnreadCount` (5min poll + realtime channel on `user_watchlist_matches`).
- In-app banner for matches < 15 min old, dismissable, max one at a time.
- New `WatchlistFormDialog` (create/edit): name, "Watching" picker (source or group, with avatar/icon + member count), topic chips, email toggle (default off, hint "high-signal topics only"), quiet hours, daily cap.
- Spotlight `Set up alerts` button: enables, opens dialog pre-filled `target_kind='source'`.
- Group detail page header: `Set up alerts for this group` button, opens dialog pre-filled `target_kind='group'`.

### LLM

- Use `google/gemini-2.5-flash` via Lovable AI Gateway, structured tool call returning `[{tweet_id, matched_topic|null, evidence}]`.
- Default per-user cap 500 classifications/day; soft warn at 400 in `/alerts` UI banner.

## Out of scope this turn

- Per-watchlist analytics, mute rate dashboards, advanced tuning UI.
- Cross-source aggregation, briefing generator, reply-draft analytics.
- Admin-wide quota override controls (default cap only).
