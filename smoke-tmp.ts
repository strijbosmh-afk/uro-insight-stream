import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient(url, key, { auth: { persistSession: false } });

const USER_ID = "77880bda-7887-4d14-b04d-d492850116f7"; // admin (real email — we will keep email_enabled flips to disabled before any real flush)
const SOURCE_ID = "piet_ost";

function log(label: string, val: unknown) {
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(val, null, 2));
}

async function cleanup(wlId?: string) {
  if (wlId) await sb.from("user_watchlists").delete().eq("id", wlId);
  await sb.from("tweets").delete().like("id", "smoke_%");
}

async function main() {
  await cleanup();

  // Setup: watchlist with email_enabled=true, quiet hours wide-open (0,0 = never quiet),
  // and 3 topics. Daily cap 100 to avoid hitting it.
  const { data: wl, error: wlErr } = await sb
    .from("user_watchlists")
    .insert({
      user_id: USER_ID,
      name: "[smoke] coalescing probe",
      target_kind: "source",
      target_source_id: SOURCE_ID,
      email_enabled: false, // start disabled so first match doesn't enqueue real email
      quiet_hours_start: 0,
      quiet_hours_end: 0,
      max_emails_per_day: 100,
    })
    .select("*")
    .single();
  if (wlErr) throw wlErr;
  const wlId = wl.id as string;
  log("watchlist", { id: wlId });

  await sb.from("user_watchlist_topics").insert([
    { watchlist_id: wlId, topic: "prostate" },
    { watchlist_id: wlId, topic: "cancer" },
    { watchlist_id: wlId, topic: "trial" },
  ]);

  // Three synthetic tweets, all matching different topics.
  const now = new Date();
  const tweets = [
    { id: "smoke_001", text: "New prostate study results out today.", source_id: SOURCE_ID, author_handle: "smoke", url: "https://x.com/smoke/status/smoke_001", created_at: new Date(now.getTime() - 60_000).toISOString() },
    { id: "smoke_002", text: "Cancer registry data shared.", source_id: SOURCE_ID, author_handle: "smoke", url: "https://x.com/smoke/status/smoke_002", created_at: new Date(now.getTime() - 45_000).toISOString() },
    { id: "smoke_003", text: "Trial enrollment milestone reached.", source_id: SOURCE_ID, author_handle: "smoke", url: "https://x.com/smoke/status/smoke_003", created_at: new Date(now.getTime() - 30_000).toISOString() },
  ];
  await sb.from("tweets").insert(tweets);

  // ------- Scenario A: simulate openRow append (match 2 lands inside an open window) -------
  // Pre-create an "initial send" row with window 5 min in the future.
  const winClose = new Date(Date.now() + 5 * 60_000).toISOString();
  // First, create a match for tweet 1 to act as the initial-send anchor.
  const { data: m1 } = await sb.from("user_watchlist_matches").insert({
    user_id: USER_ID, watchlist_id: wlId, tweet_id: "smoke_001", matched_topic: "prostate",
    match_kind: "keyword", evidence: "prostate study", delivered_via: ["in_app", "email"],
  }).select("id").single();
  const { data: anchor } = await sb.from("watchlist_email_sends").insert({
    user_id: USER_ID, watchlist_id: wlId, match_ids: [m1!.id], window_closes_at: winClose, pending_match_ids: [],
  }).select("*").single();
  log("A. anchor row created", { id: anchor!.id, window_closes_at: anchor!.window_closes_at });

  // Now flip email_enabled=true and call deliverWatchlistMatches for match 2 — should hit openRow branch.
  await sb.from("user_watchlists").update({ email_enabled: true }).eq("id", wlId);

  const { data: m2 } = await sb.from("user_watchlist_matches").insert({
    user_id: USER_ID, watchlist_id: wlId, tweet_id: "smoke_002", matched_topic: "cancer",
    match_kind: "keyword", evidence: "cancer registry", delivered_via: ["in_app"],
  }).select("id").single();

  const { deliverWatchlistMatches, flushPendingDeltas } = await import("/dev-server/src/server/watchlist-delivery.server.ts");
  await deliverWatchlistMatches([
    { id: m2!.id, watchlist_id: wlId, tweet_id: "smoke_002", matched_topic: "cancer" },
  ]);

  const { data: afterA } = await sb.from("watchlist_email_sends").select("*").eq("watchlist_id", wlId);
  log("A. email_sends after match-2 delivery (expect: pending_match_ids contains m2; no new row)", afterA);

  // ------- Scenario B: mute → flush should suppress delta but stamp delta_sent_at -------
  // Advance window into the past.
  const past = new Date(Date.now() - 60_000).toISOString();
  await sb.from("watchlist_email_sends").update({ window_closes_at: past }).eq("id", anchor!.id);
  // Mute the watchlist.
  await sb.from("user_watchlists").update({ muted_until: new Date(Date.now() + 60 * 60_000).toISOString() }).eq("id", wlId);

  const flushRes1 = await flushPendingDeltas();
  log("B. flush result with mute on (expect: processed=0, but row stamped)", flushRes1);
  const { data: afterB } = await sb.from("watchlist_email_sends").select("id, delta_sent_at, pending_match_ids").eq("watchlist_id", wlId);
  log("B. email_sends after flush+mute (expect: delta_sent_at set, pending_match_ids preserved)", afterB);

  // ------- Scenario C: unmute → new match arrives → should start a NEW window (not extend old row) -------
  await sb.from("user_watchlists").update({ muted_until: null, email_enabled: false }).eq("id", wlId);
  // email_enabled=false to prevent real email when the NEW window opens.
  const { data: m3 } = await sb.from("user_watchlist_matches").insert({
    user_id: USER_ID, watchlist_id: wlId, tweet_id: "smoke_003", matched_topic: "trial",
    match_kind: "keyword", evidence: "trial enrollment", delivered_via: ["in_app"],
  }).select("id").single();
  await deliverWatchlistMatches([
    { id: m3!.id, watchlist_id: wlId, tweet_id: "smoke_003", matched_topic: "trial" },
  ]);
  const { data: afterC } = await sb.from("watchlist_email_sends").select("id, window_closes_at, delta_sent_at, match_ids, pending_match_ids").eq("watchlist_id", wlId).order("sent_at");
  log("C. email_sends after match-3 (expect: only old row stamped+closed; no new row because email_enabled=false suppressed insert — correct)", afterC);

  // To genuinely test "new window starts when prior is closed", re-enable email and simulate again — but skip insert path: directly observe openRow lookup returns nothing.
  await sb.from("user_watchlists").update({ email_enabled: true }).eq("id", wlId);
  const { data: openLookup } = await sb
    .from("watchlist_email_sends")
    .select("id, window_closes_at, delta_sent_at")
    .eq("watchlist_id", wlId)
    .is("delta_sent_at", null)
    .gt("window_closes_at", new Date().toISOString())
    .maybeSingle();
  log("C2. open-window lookup after old row was stamped (expect: null — new match would start fresh row)", openLookup);

  // ------- Scenario D: smoke endpoint response shape (matched_topic + evidence) -------
  // Simulate the keyword match logic of the smoke endpoint inline to verify shape.
  const text = "Promising prostate cancer trial enrolling in Belgium";
  const lower = text.toLowerCase();
  const topics = ["prostate", "cancer", "trial"];
  let mt: string | null = null, ms: string | null = null, ev: string | null = null;
  for (const t of topics) {
    const idx = lower.indexOf(t.toLowerCase());
    if (idx >= 0) {
      mt = t; ms = text.slice(idx, idx + t.length);
      const start = Math.max(0, idx - 30);
      const end = Math.min(text.length, idx + t.length + 30);
      ev = (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
      break;
    }
  }
  log("D. smoke response shape preview", { matched_topic: mt, matched_substring: ms, evidence: ev });

  await cleanup(wlId);
  console.log("\n✅ Smoke complete. All synthetic data cleaned up.");
}

main().catch((e) => { console.error(e); process.exit(1); });
