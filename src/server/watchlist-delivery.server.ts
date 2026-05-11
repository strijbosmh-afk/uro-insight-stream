// Server-only: deliver new watchlist matches via in-app (already inserted) +
// optional email. Email sends honor:
//  - email_enabled flag on the watchlist
//  - quiet hours (interpreted as UTC for v1; per-watchlist tz is a follow-up)
//  - max_emails_per_day cap
//  - muted_until
//  - 5-minute coalescing window per watchlist

import { supabaseAdmin } from "@/integrations/supabase/client.server";

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

function isInQuietHoursUtc(start: number, end: number, now: Date = new Date()): boolean {
  const h = now.getUTCHours();
  if (start === end) return false;
  if (start < end) return h >= start && h < end;
  // Wraps midnight (e.g. 22 → 8).
  return h >= start || h < end;
}

function publicSiteUrl(): string {
  return process.env.PUBLIC_SITE_URL || "https://urofeed.com";
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
      "id, user_id, name, email_enabled, quiet_hours_start, quiet_hours_end, max_emails_per_day, muted_until",
    )
    .in("id", wlIds);

  if (!watchlists) return;

  for (const wl of watchlists) {
    if (!wl.email_enabled) continue;
    const muted = wl.muted_until && new Date(wl.muted_until as string).getTime() > Date.now();
    if (muted) continue;
    if (
      isInQuietHoursUtc(wl.quiet_hours_start as number, wl.quiet_hours_end as number)
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

    // 5-minute coalescing — append to the most recent send if within window.
    const cutoff = new Date(Date.now() - COALESCE_WINDOW_MS).toISOString();
    const { data: recent } = await supabaseAdmin
      .from("watchlist_email_sends")
      .select("id, match_ids")
      .eq("watchlist_id", wl.id as string)
      .gte("sent_at", cutoff)
      .order("sent_at", { ascending: false })
      .limit(1);
    if (recent && recent.length > 0) {
      const existing = recent[0].match_ids as unknown as string[];
      const merged = Array.from(new Set([...(existing ?? []), ...wlMatches.map((m) => m.id)]));
      await supabaseAdmin
        .from("watchlist_email_sends")
        .update({ match_ids: merged })
        .eq("id", recent[0].id as string);
      // Mark matches as delivered via in_app+email-coalesced (no new email send).
      await supabaseAdmin
        .from("user_watchlist_matches")
        .update({ delivered_via: ["in_app", "email_coalesced"] })
        .in(
          "id",
          wlMatches.map((m) => m.id),
        );
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

    const tweetIds = wlMatches.map((m) => m.tweet_id);
    const { data: tweets } = await supabaseAdmin
      .from("tweets")
      .select("id, text, author_handle, created_at")
      .in("id", tweetIds);
    const tweetById = new Map((tweets ?? []).map((t) => [t.id as string, t]));

    // One-tap mute token (24h).
    const muteToken = generateToken();
    await supabaseAdmin.from("watchlist_mute_tokens").insert({
      token: muteToken,
      watchlist_id: wl.id as string,
      hours: 24,
    });

    const muteUrl = `${publicSiteUrl()}/api/public/watchlist-mute/${muteToken}`;
    const alertsUrl = `${publicSiteUrl()}/alerts`;

    const itemsHtml = wlMatches
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

    const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f9fafb;">
<div style="max-width:600px;margin:0 auto;background:#fff;padding:24px;border-radius:8px;">
  <div style="font:600 14px ui-sans-serif,system-ui;color:#111;margin-bottom:16px;">Watchlist alert: ${wl.name}</div>
  ${itemsHtml}
  <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;font:12px ui-sans-serif,system-ui;color:#6b7280;">
    <a href="${muteUrl}" style="color:#6b7280;">Mute this watchlist for 24h</a> · <a href="${alertsUrl}" style="color:#6b7280;">Manage watchlists</a>
  </div>
</div></body></html>`;

    const text =
      `Watchlist alert: ${wl.name}\n\n` +
      wlMatches
        .map((m) => {
          const t = tweetById.get(m.tweet_id);
          if (!t) return "";
          return `@${t.author_handle} (matched ${m.matched_topic}):\n${t.text}\nhttps://x.com/${t.author_handle}/status/${t.id}\n`;
        })
        .join("\n") +
      `\nMute 24h: ${muteUrl}\nManage: ${alertsUrl}`;

    const messageId = crypto.randomUUID();
    const subject = `Watchlist: ${wl.name} — ${wlMatches.length} new ${wlMatches.length === 1 ? "match" : "matches"}`;

    await supabaseAdmin.from("email_send_log").insert({
      message_id: messageId,
      template_name: "watchlist-alert",
      recipient_email: profile.email,
      status: "pending",
    });

    const { error: enqueueError } = await supabaseAdmin.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        message_id: messageId,
        to: profile.email,
        from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject,
        html,
        text,
        purpose: "transactional",
        label: "watchlist-alert",
        idempotency_key: `watchlist-${wl.id}-${messageId}`,
        queued_at: new Date().toISOString(),
      },
    });

    if (enqueueError) {
      console.error("[watchlist-delivery] enqueue failed", enqueueError);
      await supabaseAdmin.from("email_send_log").insert({
        message_id: messageId,
        template_name: "watchlist-alert",
        recipient_email: profile.email,
        status: "failed",
        error_message: enqueueError.message,
      });
      continue;
    }

    await supabaseAdmin.from("watchlist_email_sends").insert({
      user_id: userId,
      watchlist_id: wl.id as string,
      match_ids: wlMatches.map((m) => m.id),
    });

    await supabaseAdmin
      .from("user_watchlist_matches")
      .update({ delivered_via: ["in_app", "email"] })
      .in(
        "id",
        wlMatches.map((m) => m.id),
      );
  }
}

/** Consume a one-tap mute token. Returns true if the watchlist is now muted. */
export async function consumeMuteToken(token: string): Promise<{ ok: boolean; watchlistName?: string }> {
  const { data: row } = await supabaseAdmin
    .from("watchlist_mute_tokens")
    .select("watchlist_id, hours, used_at")
    .eq("token", token)
    .maybeSingle();
  if (!row || row.used_at) return { ok: false };

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
  return { ok: true, watchlistName: (wl?.name as string) ?? "watchlist" };
}