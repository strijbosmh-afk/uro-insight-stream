// Server-only: deliver new watchlist matches via in-app (already inserted) +
// optional email. Email sends honor:
//  - email_enabled flag on the watchlist
//  - quiet hours (interpreted as UTC for v1; per-watchlist tz is a follow-up)
//  - max_emails_per_day cap
//  - muted_until
//  - 5-minute coalescing window per watchlist

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveWatchlistTimezone, isInQuietHoursTz } from "./watchlist-tz.server";

const COALESCE_WINDOW_MS = 5 * 60 * 1000;
const SITE_NAME = "uro-insight-stream";
const FROM_DOMAIN = "urofeed.com";
const SENDER_DOMAIN = "notify.urofeed.com";

type IncomingMatch = {
  id: string;
  watchlist_id: string;
  tweet_id: string;
  matched_topic: string;
};

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function publicSiteUrl(): string {
  return process.env.PUBLIC_SITE_URL || "https://urofeed.com";
}

/**
 * Render the email payload for a watchlist + a set of matches and enqueue
 * it via the transactional queue. Returns the email_send_log message_id on
 * success, or null when nothing was enqueued (e.g. enqueue error). Caller
 * is responsible for recording the watchlist_email_sends row(s).
 */
async function renderAndEnqueueAlert(
  wl: { id: string; name: string },
  recipientEmail: string,
  matches: IncomingMatch[],
  opts: { isDelta?: boolean } = {},
): Promise<string | null> {
  if (matches.length === 0) return null;
  const tweetIds = matches.map((m) => m.tweet_id);
  const { data: tweets } = await supabaseAdmin
    .from("tweets")
    .select("id, text, author_handle, created_at")
    .in("id", tweetIds);
  const tweetById = new Map((tweets ?? []).map((t) => [t.id as string, t]));

  const muteToken = generateToken();
  await supabaseAdmin.from("watchlist_mute_tokens").insert({
    token: muteToken,
    watchlist_id: wl.id,
    hours: 24,
  });
  const muteUrl = `${publicSiteUrl()}/api/public/watchlist-mute/${muteToken}`;
  const alertsUrl = `${publicSiteUrl()}/alerts`;

  const itemsHtml = matches
    .map((m) => {
      const t = tweetById.get(m.tweet_id);
      if (!t) return "";
      const safeText = String(t.text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return `<div style="border:1px solid #e5e7eb;border-radius:6px;padding:12px;margin-bottom:8px;">
  <div style="font:600 12px ui-sans-serif,system-ui;color:#6b7280;margin-bottom:4px;">@${t.author_handle} · matched <em>${m.matched_topic}</em></div>
  <div style="font:14px ui-sans-serif,system-ui;color:#111;white-space:pre-wrap;">${safeText.slice(0, 480)}</div>
  <div style="margin-top:8px;font:12px ui-sans-serif,system-ui;">
    <a href="https://x.com/${t.author_handle}/status/${t.id}" style="color:#2563eb;text-decoration:none;margin-right:12px;">Open on X</a>
    <a href="${alertsUrl}" style="color:#2563eb;text-decoration:none;">Reply via UroFeed</a>
  </div>
</div>`;
    })
    .join("");

  const heading = opts.isDelta
    ? `Watchlist update: ${wl.name} — additional matches`
    : `Watchlist alert: ${wl.name}`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f9fafb;">
<div style="max-width:600px;margin:0 auto;background:#fff;padding:24px;border-radius:8px;">
  <div style="font:600 14px ui-sans-serif,system-ui;color:#111;margin-bottom:16px;">${heading}</div>
  ${itemsHtml}
  <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;font:12px ui-sans-serif,system-ui;color:#6b7280;">
    <a href="${muteUrl}" style="color:#6b7280;">Mute this watchlist for 24h</a> · <a href="${alertsUrl}" style="color:#6b7280;">Manage watchlists</a>
  </div>
</div></body></html>`;
  const text =
    `${heading}\n\n` +
    matches
      .map((m) => {
        const t = tweetById.get(m.tweet_id);
        if (!t) return "";
        return `@${t.author_handle} (matched ${m.matched_topic}):\n${t.text}\nhttps://x.com/${t.author_handle}/status/${t.id}\n`;
      })
      .join("\n") +
    `\nMute 24h: ${muteUrl}\nManage: ${alertsUrl}`;

  const messageId = crypto.randomUUID();
  const subject = opts.isDelta
    ? `Watchlist: ${wl.name} — ${matches.length} more ${matches.length === 1 ? "match" : "matches"}`
    : `Watchlist: ${wl.name} — ${matches.length} new ${matches.length === 1 ? "match" : "matches"}`;

  await supabaseAdmin.from("email_send_log").insert({
    message_id: messageId,
    template_name: opts.isDelta ? "watchlist-alert-delta" : "watchlist-alert",
    recipient_email: recipientEmail,
    status: "pending",
  });

  const { error: enqueueError } = await supabaseAdmin.rpc("enqueue_email", {
    queue_name: "transactional_emails",
    payload: {
      message_id: messageId,
      to: recipientEmail,
      from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject,
      html,
      text,
      purpose: "transactional",
      label: opts.isDelta ? "watchlist-alert-delta" : "watchlist-alert",
      idempotency_key: `watchlist-${wl.id}-${messageId}`,
      queued_at: new Date().toISOString(),
    },
  });
  if (enqueueError) {
    console.error("[watchlist-delivery] enqueue failed", enqueueError);
    await supabaseAdmin.from("email_send_log").insert({
      message_id: messageId,
      template_name: opts.isDelta ? "watchlist-alert-delta" : "watchlist-alert",
      recipient_email: recipientEmail,
      status: "failed",
      error_message: enqueueError.message,
    });
    return null;
  }
  return messageId;
}

export async function deliverWatchlistMatches(matches: IncomingMatch[]): Promise<void> {
  if (matches.length === 0) return;

  // Group by watchlist for batch email evaluation.
  const byWatchlist = new Map<string, IncomingMatch[]>();
  for (const m of matches) {
    if (!byWatchlist.has(m.watchlist_id)) byWatchlist.set(m.watchlist_id, []);
    byWatchlist.get(m.watchlist_id)!.push(m);
  }

  const wlIds = Array.from(byWatchlist.keys());
  const { data: watchlists } = await supabaseAdmin
    .from("user_watchlists")
    .select(
      "id, user_id, name, email_enabled, quiet_hours_start, quiet_hours_end, max_emails_per_day, muted_until, timezone",
    )
    .in("id", wlIds);

  if (!watchlists) return;

  for (const wl of watchlists) {
    if (!wl.email_enabled) continue;
    const muted = wl.muted_until && new Date(wl.muted_until as string).getTime() > Date.now();
    if (muted) continue;
    const tz = await resolveWatchlistTimezone({
      watchlistTimezone: wl.timezone as string | null,
      userId: wl.user_id as string,
    });
    if (
      isInQuietHoursTz(
        wl.quiet_hours_start as number,
        wl.quiet_hours_end as number,
        tz,
      )
    ) {
      continue;
    }

    const wlMatches = byWatchlist.get(wl.id as string) ?? [];
    if (wlMatches.length === 0) continue;

    // Daily cap (per watchlist).
    const startOfDayIso = new Date(
      new Date().toISOString().slice(0, 10) + "T00:00:00.000Z",
    ).toISOString();
    const { count: sentToday } = await supabaseAdmin
      .from("watchlist_email_sends")
      .select("id", { count: "exact", head: true })
      .eq("watchlist_id", wl.id as string)
      .gte("sent_at", startOfDayIso);
    if ((sentToday ?? 0) >= (wl.max_emails_per_day as number)) continue;

    // Coalescing model: first match in a 5-minute window sends an email
    // immediately. Subsequent matches inside the window queue into the
    // existing row's pending_match_ids; a cron flush sends ONE follow-up
    // delta email after window_closes_at.
    const nowMs = Date.now();
    const { data: openRow } = await supabaseAdmin
      .from("watchlist_email_sends")
      .select("id, pending_match_ids, window_closes_at, delta_sent_at")
      .eq("watchlist_id", wl.id as string)
      .is("delta_sent_at", null)
      .gt("window_closes_at", new Date(nowMs).toISOString())
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (openRow) {
      const existing = (openRow.pending_match_ids as unknown as string[]) ?? [];
      const merged = Array.from(new Set([...existing, ...wlMatches.map((m) => m.id)]));
      await supabaseAdmin
        .from("watchlist_email_sends")
        .update({ pending_match_ids: merged })
        .eq("id", openRow.id as string);
      await supabaseAdmin
        .from("user_watchlist_matches")
        .update({ delivered_via: ["in_app", "email_coalesced"] })
        .in("id", wlMatches.map((m) => m.id));
      continue;
    }

    // Resolve recipient + tweets payload.
    const userId = wl.user_id as string;
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email, is_demo")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.email) continue;
    if (profile.is_demo) continue;

    const { data: suppressed } = await supabaseAdmin
      .from("suppressed_emails")
      .select("id")
      .eq("email", profile.email.toLowerCase())
      .maybeSingle();
    if (suppressed) continue;

    const messageId = await renderAndEnqueueAlert(
      { id: wl.id as string, name: wl.name as string },
      profile.email,
      wlMatches,
      { isDelta: false },
    );
    if (!messageId) continue;

    // Race-safe insert: the partial unique index
    // (uniq_wes_open_window_per_watchlist) ensures only one open
    // coalescing window per watchlist exists. If a parallel matcher
    // already opened one between the SELECT above and our INSERT, this
    // throws a unique-violation that we treat as "merge into the
    // existing row" instead of double-emailing.
    const { error: insertErr } = await supabaseAdmin
      .from("watchlist_email_sends")
      .insert({
        user_id: userId,
        watchlist_id: wl.id as string,
        match_ids: wlMatches.map((m) => m.id),
        window_closes_at: new Date(nowMs + COALESCE_WINDOW_MS).toISOString(),
        pending_match_ids: [],
      });
    if (insertErr) {
      // 23505 = unique_violation. Another matcher beat us; merge our
      // matches into whatever open window now exists.
      const code = (insertErr as { code?: string }).code;
      if (code === "23505") {
        const { data: rival } = await supabaseAdmin
          .from("watchlist_email_sends")
          .select("id, pending_match_ids")
          .eq("watchlist_id", wl.id as string)
          .is("delta_sent_at", null)
          .limit(1)
          .maybeSingle();
        if (rival) {
          const merged = Array.from(
            new Set([
              ...((rival.pending_match_ids as unknown as string[]) ?? []),
              ...wlMatches.map((m) => m.id),
            ]),
          );
          await supabaseAdmin
            .from("watchlist_email_sends")
            .update({ pending_match_ids: merged })
            .eq("id", rival.id as string);
        }
      } else {
        console.error("[watchlist-delivery] insert failed", insertErr);
      }
    }

    await supabaseAdmin
      .from("user_watchlist_matches")
      .update({ delivered_via: ["in_app", "email"] })
      .in(
        "id",
        wlMatches.map((m) => m.id),
      );
  }
}

/**
 * Cron-driven flush: for each watchlist_email_sends row whose coalescing
 * window has closed and whose pending_match_ids is non-empty, send ONE
 * follow-up delta email summarizing the queued matches and stamp
 * delta_sent_at. Idempotent — the partial index makes the scan cheap.
 */
export async function flushPendingDeltas(): Promise<{ processed: number }> {
  const nowIso = new Date().toISOString();
  const { data: rows } = await supabaseAdmin
    .from("watchlist_email_sends")
    .select("id, watchlist_id, user_id, pending_match_ids, window_closes_at")
    .is("delta_sent_at", null)
    .lt("window_closes_at", nowIso)
    .limit(50);

  let processed = 0;
  for (const row of rows ?? []) {
    const pending = (row.pending_match_ids as unknown as string[]) ?? [];
    if (pending.length === 0) {
      // Nothing to send — still stamp delta_sent_at so we stop revisiting.
      await supabaseAdmin
        .from("watchlist_email_sends")
        .update({ delta_sent_at: nowIso })
        .eq("id", row.id as string);
      continue;
    }

    const { data: wl } = await supabaseAdmin
      .from("user_watchlists")
      .select(
        "id, user_id, name, email_enabled, muted_until, max_emails_per_day, quiet_hours_start, quiet_hours_end, timezone",
      )
      .eq("id", row.watchlist_id as string)
      .maybeSingle();
    if (!wl) {
      await supabaseAdmin
        .from("watchlist_email_sends")
        .update({ delta_sent_at: nowIso })
        .eq("id", row.id as string);
      continue;
    }

    // Honor mute/email_enabled even on flush.
    const muted = wl.muted_until && new Date(wl.muted_until as string).getTime() > Date.now();
    if (!wl.email_enabled || muted) {
      await supabaseAdmin
        .from("watchlist_email_sends")
        .update({ delta_sent_at: nowIso })
        .eq("id", row.id as string);
      continue;
    }

    // Honor quiet hours in the watchlist's resolved timezone. If we're
    // currently inside the quiet window, leave delta_sent_at NULL so the
    // next cron tick reconsiders once the window ends — don't ship a
    // delta email at 03:30 local time just because UTC is 08:30.
    const tz = await resolveWatchlistTimezone({
      watchlistTimezone: wl.timezone as string | null,
      userId: wl.user_id as string,
    });
    if (
      isInQuietHoursTz(
        wl.quiet_hours_start as number,
        wl.quiet_hours_end as number,
        tz,
      )
    ) {
      continue;
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email, is_demo")
      .eq("id", row.user_id as string)
      .maybeSingle();
    if (!profile?.email || profile.is_demo) {
      await supabaseAdmin
        .from("watchlist_email_sends")
        .update({ delta_sent_at: nowIso })
        .eq("id", row.id as string);
      continue;
    }

    // Resolve match → tweet/topic for the email.
    const { data: matchRows } = await supabaseAdmin
      .from("user_watchlist_matches")
      .select("id, watchlist_id, tweet_id, matched_topic")
      .in("id", pending);
    const incoming: IncomingMatch[] = (matchRows ?? []).map((r) => ({
      id: r.id as string,
      watchlist_id: r.watchlist_id as string,
      tweet_id: r.tweet_id as string,
      matched_topic: (r.matched_topic as string) ?? "",
    }));
    if (incoming.length === 0) {
      await supabaseAdmin
        .from("watchlist_email_sends")
        .update({ delta_sent_at: nowIso })
        .eq("id", row.id as string);
      continue;
    }

    const messageId = await renderAndEnqueueAlert(
      { id: wl.id as string, name: wl.name as string },
      profile.email,
      incoming,
      { isDelta: true },
    );
    if (!messageId) {
      // Leave delta_sent_at null so the next cron tick retries.
      continue;
    }

    await supabaseAdmin
      .from("watchlist_email_sends")
      .update({
        delta_sent_at: nowIso,
        match_ids: Array.from(
          new Set([...(pending), ...((row.pending_match_ids as unknown as string[]) ?? [])]),
        ),
      })
      .eq("id", row.id as string);

    await supabaseAdmin
      .from("user_watchlist_matches")
      .update({ delivered_via: ["in_app", "email"] })
      .in("id", pending);

    processed += 1;
  }
  return { processed };
}

/** Consume a one-tap mute token. Returns true if the watchlist is now muted. */
export async function consumeMuteToken(token: string): Promise<{ ok: boolean; watchlistName?: string }> {
  const { data: row } = await supabaseAdmin
    .from("watchlist_mute_tokens")
    .select("watchlist_id, hours, used_at, expires_at")
    .eq("token", token)
    .maybeSingle();
  // Reject if missing, already used, or past its expiry (H-S1: leaked email
  // archives must not stay actionable forever).
  if (!row || row.used_at) return { ok: false };
  if (row.expires_at && new Date(row.expires_at as string).getTime() < Date.now()) {
    return { ok: false };
  }

  const muteUntil = new Date(Date.now() + (row.hours as number) * 3600 * 1000).toISOString();
  await supabaseAdmin
    .from("user_watchlists")
    .update({ muted_until: muteUntil })
    .eq("id", row.watchlist_id as string);
  await supabaseAdmin
    .from("watchlist_mute_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("token", token);

  const { data: wl } = await supabaseAdmin
    .from("user_watchlists")
    .select("name")
    .eq("id", row.watchlist_id as string)
    .maybeSingle();

  // Opportunistic cleanup: drop expired/old-used tokens so the table doesn't
  // grow forever. Best-effort — failures are not user-visible.
  void supabaseAdmin
    .rpc("cleanup_watchlist_mute_tokens")
    .then(({ error }) => {
      if (error) console.error("[watchlist-mute] cleanup failed", error);
    });

  return { ok: true, watchlistName: (wl?.name as string) ?? "watchlist" };
}