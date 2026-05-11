import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const USER_ID = "77880bda-7887-4d14-b04d-d492850116f7";
const SOURCE_ID = "piet_ost";
const log = (l: string, v: unknown) => console.log(`\n=== ${l} ===\n${JSON.stringify(v, null, 2)}`);

async function cleanup(wlId?: string) {
  if (wlId) await sb.from("user_watchlists").delete().eq("id", wlId);
  await sb.from("tweets").delete().like("id", "smoke_%");
}

async function insMatch(wlId: string, tweetId: string, topic: string) {
  const r = await sb.from("user_watchlist_matches")
    .insert({ watchlist_id: wlId, tweet_id: tweetId, matched_topic: topic, match_reason: { keyword: topic }, delivered_via: ["in_app"] })
    .select("id").single();
  if (r.error) throw r.error;
  return r.data!.id as string;
}

async function main() {
  await cleanup();
  const { data: wl, error: e1 } = await sb.from("user_watchlists").insert({
    user_id: USER_ID, name: "[smoke] coalescing probe", target_kind: "source", target_source_id: SOURCE_ID,
    email_enabled: false, quiet_hours_start: 0, quiet_hours_end: 0, max_emails_per_day: 100,
  }).select("*").single();
  if (e1) throw e1;
  const wlId = wl.id as string;
  log("watchlist", { id: wlId });

  await sb.from("user_watchlist_topics").insert([
    { watchlist_id: wlId, topic: "prostate" },
    { watchlist_id: wlId, topic: "cancer" },
    { watchlist_id: wlId, topic: "trial" },
  ]);

  const now = new Date();
  await sb.from("tweets").insert([
    { id: "smoke_001", text: "prostate study results", source_id: SOURCE_ID, author_handle: "smoke", url: "https://x.com/smoke/status/smoke_001", created_at: new Date(now.getTime() - 60_000).toISOString() },
    { id: "smoke_002", text: "cancer registry data", source_id: SOURCE_ID, author_handle: "smoke", url: "https://x.com/smoke/status/smoke_002", created_at: new Date(now.getTime() - 45_000).toISOString() },
    { id: "smoke_003", text: "trial enrollment milestone", source_id: SOURCE_ID, author_handle: "smoke", url: "https://x.com/smoke/status/smoke_003", created_at: new Date(now.getTime() - 30_000).toISOString() },
  ]);

  const m1 = await insMatch(wlId, "smoke_001", "prostate");
  const winClose = new Date(Date.now() + 5 * 60_000).toISOString();
  const { data: anchor, error: ae } = await sb.from("watchlist_email_sends").insert({
    user_id: USER_ID, watchlist_id: wlId, match_ids: [m1], window_closes_at: winClose, pending_match_ids: [],
  }).select("*").single();
  if (ae) throw ae;
  log("A. anchor row", { id: anchor!.id, window_closes_at: anchor!.window_closes_at });

  await sb.from("user_watchlists").update({ email_enabled: true }).eq("id", wlId);
  const m2 = await insMatch(wlId, "smoke_002", "cancer");

  const { deliverWatchlistMatches, flushPendingDeltas } = await import("/dev-server/src/server/watchlist-delivery.server.ts");
  await deliverWatchlistMatches([{ id: m2, watchlist_id: wlId, tweet_id: "smoke_002", matched_topic: "cancer" }]);
  const { data: afterA } = await sb.from("watchlist_email_sends").select("id, pending_match_ids, match_ids, delta_sent_at").eq("watchlist_id", wlId);
  log("A. after match-2 (expect: pending_match_ids has m2, no new row)", { afterA, m2 });

  // B. Mute + flush
  await sb.from("watchlist_email_sends").update({ window_closes_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", anchor!.id);
  await sb.from("user_watchlists").update({ muted_until: new Date(Date.now() + 3600_000).toISOString() }).eq("id", wlId);
  const flushRes1 = await flushPendingDeltas();
  log("B. flush w/ mute on", flushRes1);
  const { data: afterB } = await sb.from("watchlist_email_sends").select("id, delta_sent_at, pending_match_ids").eq("watchlist_id", wlId);
  log("B. row after flush (expect: delta_sent_at set; pending preserved)", afterB);

  // C. New match arrives after old window stamped → should NOT extend old row (it has delta_sent_at)
  await sb.from("user_watchlists").update({ muted_until: null, email_enabled: false }).eq("id", wlId);
  const m3 = await insMatch(wlId, "smoke_003", "trial");
  await deliverWatchlistMatches([{ id: m3, watchlist_id: wlId, tweet_id: "smoke_003", matched_topic: "trial" }]);
  const { data: afterC } = await sb.from("watchlist_email_sends").select("id, window_closes_at, delta_sent_at, pending_match_ids").eq("watchlist_id", wlId).order("sent_at");
  log("C. rows after match-3 with email_enabled=false (expect: still 1 row, m3 NOT appended because old row is closed/stamped)", afterC);

  // C2. Verify openRow lookup with same params delivery uses
  const { data: openLookup } = await sb.from("watchlist_email_sends")
    .select("id").eq("watchlist_id", wlId).is("delta_sent_at", null).gt("window_closes_at", new Date().toISOString()).maybeSingle();
  log("C2. openRow lookup (expect: null — fresh window would start)", openLookup);

  await cleanup(wlId);
  console.log("\n✅ done");
}
main().catch((e) => { console.error(e); process.exit(1); });
