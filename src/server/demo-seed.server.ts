// Demo-account seed + wipe logic. Server-only.
//
// Pre-populates one or more demo profiles with a canonical "looks alive"
// state: specialties, followed sources/congresses, three digests, a few
// pre-generated AI summaries, and a fake post history. The reset cron
// wipes user-controlled writes and re-runs the seed to restore the
// canonical demo state every night.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const DEMO_EMAIL = "demo@urofeed.app";
export const DEMO_DISPLAY_NAME = "Demo · Urology";
export const DEMO_AVATAR_URL =
  "https://api.dicebear.com/7.x/initials/svg?seed=Demo%20Urology";
export const DEMO_SINK_RECIPIENT = "demo-noreply@urofeed.app";

// Handles to follow (lowercase). Missing rows are skipped.
const SEED_SOURCE_HANDLES = [
  "uroweb",
  "amerurological",
  "siu_urology",
  "jurology",
  "esmo",
  "asco",
  "drspratticus",
  "oncoalert",
  "tylersbrt",
  "scserendipity1",
  "nataliagandur",
  "cpeedell",
  "piet_ost",
  "dryukselurun",
];

const SEED_SPECIALTIES: Array<{ id: string; primary: boolean }> = [
  { id: "onco_prostate", primary: true },
  { id: "andrology", primary: false },
  { id: "functional", primary: false },
];

const SEED_CONGRESS_SHORT_CODES = ["APCCC26", "EAU26", "ASCOGU26"];

const APCCC_SESSIONS = [
  {
    title: "Focal therapy in low- and intermediate-risk prostate cancer",
    track: "Prostate cancer",
    chairs: ["Caroline Moore", "Mark Emberton"],
    entities: ["HIFU", "cryotherapy", "focal therapy"],
    session_hashtag: "#APCCC26-FT",
  },
  {
    title: "PSMA-PET imaging: state of the art",
    track: "Imaging",
    chairs: ["Wolfgang Fendler", "Stefano Fanti"],
    entities: ["PSMA", "68Ga-PSMA", "18F-PSMA", "PET"],
    session_hashtag: "#APCCC26-PSMA",
  },
  {
    title: "Treatment intensification in mHSPC",
    track: "Advanced disease",
    chairs: ["Nicholas James", "Karim Fizazi"],
    entities: [
      "enzalutamide",
      "apalutamide",
      "darolutamide",
      "docetaxel",
      "mHSPC",
    ],
    session_hashtag: "#APCCC26-mHSPC",
  },
  {
    title: "PARP inhibitors in mCRPC: who, when, how",
    track: "Advanced disease",
    chairs: ["Joaquin Mateo", "Maha Hussain"],
    entities: ["olaparib", "talazoparib", "TALAPRO-2", "BRCA", "mCRPC"],
    session_hashtag: "#APCCC26-PARP",
  },
  {
    title: "Lutetium-PSMA: practical considerations",
    track: "Advanced disease",
    chairs: ["Oliver Sartor", "Michael Hofman"],
    entities: ["lutetium-177", "lu-177-PSMA", "VISION", "PSMAfore"],
    session_hashtag: "#APCCC26-LU",
  },
  {
    title: "Active surveillance in 2026: who's still appropriate",
    track: "Localized",
    chairs: ["Laurence Klotz", "Hashim Ahmed"],
    entities: ["active surveillance", "mpMRI", "PRECISION", "ProtecT"],
    session_hashtag: "#APCCC26-AS",
  },
];

const DEMO_POSTS = [
  {
    daysAgo: 1,
    text:
      "Great Q&A from @DrSpratticus on PSMA-PET integration into staging workflows. The data on detection rates in BCR is finally settling.",
  },
  {
    daysAgo: 3,
    text:
      "TALAPRO-2 PFS update at #APCCC26 — duration of response is more striking than the headline number IMO.",
  },
  {
    daysAgo: 6,
    text:
      "Anyone else seeing increased referrals for focal therapy candidacy after the consensus updates? Patient demand is real.",
  },
  {
    daysAgo: 9,
    text:
      "Hot take: lu-177-PSMA sequencing matters more than we initially thought. VISION post-hoc analysis is going to be interesting.",
  },
  {
    daysAgo: 13,
    text:
      "Lecture worth your time: Klotz on active surveillance criteria evolution. ProtecT 15-yr data changes the calculus for some.",
  },
];

/** Find or create the demo auth user. Idempotent. Returns the user id. */
export async function ensureDemoAuthUser(): Promise<{
  userId: string;
  created: boolean;
}> {
  const password = process.env.DEMO_USER_PASSWORD;
  if (!password || password.length < 8) {
    throw new Error(
      "DEMO_USER_PASSWORD secret is not set; cannot provision demo account."
    );
  }

  // Try to find an existing profile by email first (fast path).
  const { data: existingProfile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("email", DEMO_EMAIL)
    .maybeSingle();
  if (existingProfile?.id) {
    return { userId: existingProfile.id, created: false };
  }

  // Look up the auth user (in case profile got out of sync).
  // listUsers paginates; one page should be enough for our scale.
  const { data: list, error: listErr } =
    await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr) throw new Error(`listUsers: ${listErr.message}`);
  const existing = list.users.find(
    (u) => (u.email ?? "").toLowerCase() === DEMO_EMAIL
  );
  if (existing) {
    await ensureDemoProfile(existing.id);
    return { userId: existing.id, created: false };
  }

  const { data: created, error: createErr } =
    await supabaseAdmin.auth.admin.createUser({
      email: DEMO_EMAIL,
      password,
      email_confirm: true,
      user_metadata: { display_name: DEMO_DISPLAY_NAME },
    });
  if (createErr || !created.user) {
    throw new Error(`createUser failed: ${createErr?.message ?? "no user"}`);
  }
  await ensureDemoProfile(created.user.id);
  return { userId: created.user.id, created: true };
}

/** Mark profile as demo + apply display name/avatar. */
async function ensureDemoProfile(userId: string): Promise<void> {
  // Profile row gets created by handle_new_user trigger; update fields.
  const { error } = await supabaseAdmin
    .from("profiles")
    .update({
      is_demo: true,
      display_name: DEMO_DISPLAY_NAME,
      avatar_url: DEMO_AVATAR_URL,
      active: true,
    })
    .eq("id", userId);
  if (error) throw new Error(`update profile: ${error.message}`);

  // Ensure NO admin/editor roles slipped in (trigger blocks future ones).
  await supabaseAdmin
    .from("user_roles")
    .delete()
    .eq("user_id", userId)
    .in("role", ["admin", "editor"]);

  // Make sure viewer role exists.
  await supabaseAdmin
    .from("user_roles")
    .upsert({ user_id: userId, role: "viewer" }, { onConflict: "user_id,role" });
}

/** Wipe all user-controlled state for a single demo user. */
export async function wipeDemoUser(userId: string): Promise<void> {
  // Order matters only for FK chains; most are independent.
  await supabaseAdmin.from("user_subscribed_sources").delete().eq("user_id", userId);
  await supabaseAdmin.from("user_subscribed_congresses").delete().eq("user_id", userId);
  await supabaseAdmin.from("user_subscribed_hashtags").delete().eq("user_id", userId);
  await supabaseAdmin.from("user_specialties").delete().eq("user_id", userId);
  // digest_subscriptions cascades to recipients/sources via FK on app side
  // (or we delete children explicitly to be safe).
  const { data: digests } = await supabaseAdmin
    .from("digest_subscriptions")
    .select("id")
    .eq("user_id", userId);
  const digestIds = (digests ?? []).map((d) => d.id);
  if (digestIds.length > 0) {
    await supabaseAdmin
      .from("digest_subscription_recipients")
      .delete()
      .in("digest_id", digestIds);
    await supabaseAdmin
      .from("digest_subscription_sources")
      .delete()
      .in("digest_id", digestIds);
  }
  await supabaseAdmin.from("digest_subscriptions").delete().eq("user_id", userId);
  await supabaseAdmin.from("demo_posts").delete().eq("user_id", userId);
  await supabaseAdmin.from("source_candidate_dismissals").delete().eq("user_id", userId);
  await supabaseAdmin.from("user_x_post_log").delete().eq("user_id", userId);
  await supabaseAdmin.from("user_bookmarks").delete().eq("user_id", userId);
}

/** Apply the canonical seed for one demo user. Idempotent (uses upserts). */
export async function seedDemoUser(userId: string): Promise<{
  sources: number;
  congresses: number;
  sessions: number;
  summaries: number;
  digests: number;
  posts: number;
}> {
  // a) Specialties
  for (const s of SEED_SPECIALTIES) {
    await supabaseAdmin
      .from("user_specialties")
      .upsert(
        { user_id: userId, specialty_id: s.id, is_primary: s.primary },
        { onConflict: "user_id,specialty_id" }
      );
  }

  // b) Subscribed sources
  const { data: sources } = await supabaseAdmin
    .from("sources")
    .select("id, handle")
    .in(
      "handle",
      // sources.handle is mixed-case; do a case-insensitive match by
      // listing all and filtering in JS.
      SEED_SOURCE_HANDLES
    );
  // Fallback: case-insensitive scan if direct match comes back short.
  let resolvedSources = sources ?? [];
  if (resolvedSources.length < SEED_SOURCE_HANDLES.length) {
    const { data: all } = await supabaseAdmin.from("sources").select("id, handle");
    const want = new Set(SEED_SOURCE_HANDLES);
    resolvedSources = (all ?? []).filter((r) =>
      want.has((r.handle ?? "").toLowerCase())
    );
  }
  if (resolvedSources.length > 0) {
    await supabaseAdmin.from("user_subscribed_sources").upsert(
      resolvedSources.map((s) => ({ user_id: userId, source_id: s.id })),
      { onConflict: "user_id,source_id" }
    );
  }

  // c) Subscribed congresses (only those that already exist)
  const { data: congresses } = await supabaseAdmin
    .from("congresses")
    .select("id, short_code, start_date, end_date")
    .in("short_code", SEED_CONGRESS_SHORT_CODES);
  if ((congresses ?? []).length > 0) {
    await supabaseAdmin.from("user_subscribed_congresses").upsert(
      (congresses ?? []).map((c) => ({ user_id: userId, congress_id: c.id })),
      { onConflict: "user_id,congress_id" }
    );
  }

  // d) APCCC26 sessions
  const apccc = (congresses ?? []).find((c) => c.short_code === "APCCC26");
  let createdSessions = 0;
  let psmaSessionId: string | null = null;
  if (apccc) {
    const startDate = apccc.start_date
      ? new Date(apccc.start_date)
      : new Date();
    for (let i = 0; i < APCCC_SESSIONS.length; i++) {
      const s = APCCC_SESSIONS[i];
      const dayOffset = Math.floor(i / 2); // 2 sessions/day
      const slotInDay = i % 2;
      const start = new Date(startDate);
      start.setUTCHours(9 + slotInDay * 2, 0, 0, 0);
      start.setUTCDate(start.getUTCDate() + dayOffset);
      const end = new Date(start.getTime() + 90 * 60 * 1000);
      const id = `demo_apccc26_s${i + 1}`;
      await supabaseAdmin.from("sessions").upsert(
        {
          id,
          congress_id: apccc.id,
          title: s.title,
          track: s.track,
          room: "Auditorium",
          chairs: s.chairs,
          entities: s.entities,
          session_hashtag: s.session_hashtag,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          seeded_from_mock: true,
        },
        { onConflict: "id" }
      );
      createdSessions++;
      if (s.session_hashtag === "#APCCC26-PSMA") psmaSessionId = id;
    }
  }

  // e) Pre-generated summaries
  let createdSummaries = 0;
  if (psmaSessionId) {
    await supabaseAdmin.from("summaries").upsert(
      {
        id: `demo_sum_${psmaSessionId}`,
        target_type: "session",
        target_id: psmaSessionId,
        bullet_points: [
          "PSMA-PET sensitivity for biochemical recurrence at PSA <0.5 ng/mL is consistently >70% in pooled series.",
          "68Ga vs 18F tracers show comparable diagnostic performance; logistics drive site-level choice.",
          "Standardized PROMISE/E-PSMA reporting reduces interpretive variability across centers.",
          "Management changes after PSMA-PET occur in ~50–60% of recurrence cases.",
          "Outstanding question: does PSMA-PET–guided salvage improve hard endpoints? Trials ongoing.",
        ],
        key_quotes: [
          {
            text: "PSMA-PET is now the staging standard of care, not a research tool.",
            author: "Demo · Wolfgang Fendler",
          },
          {
            text: "Workflow integration is the next bottleneck — not the imaging.",
            author: "Demo · Stefano Fanti",
          },
          {
            text: "Reporting standards matter as much as the scanner you bought.",
            author: "Demo · APCCC26 panel",
          },
        ],
        sentiment: "positive",
        controversies: [
          "Optimal cutoffs for PSMA-PET–guided treatment changes remain center-specific.",
        ],
        takeaways: [
          "Adopt structured reporting templates locally.",
          "Prefer PSMA-PET over conventional imaging for BCR workup.",
        ],
        tweet_count: 24,
        model_used: "demo-seed",
        seeded_from_mock: true,
      },
      { onConflict: "target_type,target_id" }
    );
    createdSummaries++;
  }

  if (apccc) {
    const today = new Date().toISOString().slice(0, 10);
    await supabaseAdmin.from("summaries").upsert(
      {
        id: `demo_sum_congress_${apccc.id}_${today}`,
        target_type: "congress",
        target_id: `${apccc.id}:${today}`,
        bullet_points: [
          "PSMA-PET dominated the imaging session; consensus on staging utility was strong.",
          "mHSPC: triplet therapy momentum continues, especially for high-volume disease.",
          "PARP inhibitors: BRCA selection still primary; broader HRR signals discussed.",
          "Lu-177-PSMA: sequencing and patient selection refined post-VISION.",
          "Focal therapy and active surveillance: criteria converging across guidelines.",
        ],
        key_quotes: [],
        sentiment: "neutral",
        controversies: [
          "Triplet vs doublet in lower-volume mHSPC remains debated.",
        ],
        takeaways: [
          "Most actionable change: PSMA-PET reporting standardization.",
        ],
        tweet_count: 87,
        model_used: "demo-seed",
        seeded_from_mock: true,
      },
      { onConflict: "target_type,target_id" }
    );
    createdSummaries++;
  }

  const eau = (congresses ?? []).find((c) => c.short_code === "EAU26");
  if (eau) {
    await supabaseAdmin.from("summaries").upsert(
      {
        id: `demo_sum_congress_${eau.id}_archive`,
        target_type: "congress",
        target_id: `${eau.id}:archive`,
        bullet_points: [
          "Plenary highlights: localised disease management with mpMRI-driven biopsy pathways.",
          "BPH: aquablation and Rezum head-to-head data discussed.",
          "Stones: dusting vs basketing — center-level practice patterns persist.",
          "Bladder cancer: enfortumab-vedotin + pembrolizumab now first-line standard.",
          "Functional urology: sacral neuromodulation outcomes at 5 years presented.",
        ],
        key_quotes: [],
        sentiment: "neutral",
        controversies: [],
        takeaways: ["EAU26 served as a consolidation, not disruption, year."],
        tweet_count: 0,
        model_used: "demo-seed",
        seeded_from_mock: true,
      },
      { onConflict: "target_type,target_id" }
    );
    createdSummaries++;
  }

  // f) Digests
  const now = new Date();
  const nextMonday = new Date(now);
  nextMonday.setUTCDate(
    now.getUTCDate() + ((1 - now.getUTCDay() + 7) % 7 || 7)
  );
  nextMonday.setUTCHours(9, 0, 0, 0);
  const tomorrow18 = new Date(now);
  tomorrow18.setUTCDate(now.getUTCDate() + 1);
  tomorrow18.setUTCHours(18, 0, 0, 0);
  const firstNextMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 9, 0, 0)
  );

  const digestSpecs = [
    {
      name: "Weekly oncology digest",
      frequency: "weekly",
      day_of_week: 1,
      send_hour: 9,
      next_send_at: nextMonday.toISOString(),
      is_active: true,
      congress_id: null as string | null,
      specialty_id: null as string | null,
      sourceHandles: [
        "jurology",
        "esmo",
        "asco",
        "drspratticus",
        "oncoalert",
      ],
    },
    {
      name: "APCCC26 catch-up",
      frequency: "daily",
      day_of_week: null as number | null,
      send_hour: 18,
      next_send_at: tomorrow18.toISOString(),
      is_active: true,
      congress_id: apccc?.id ?? null,
      specialty_id: null,
      sourceHandles: [],
    },
    {
      name: "Andrology this month",
      frequency: "monthly",
      day_of_week: null as number | null,
      send_hour: 9,
      next_send_at: firstNextMonth.toISOString(),
      is_active: false,
      congress_id: null,
      specialty_id: "andrology",
      sourceHandles: [],
    },
  ];

  let digestsCreated = 0;
  for (const spec of digestSpecs) {
    const { data: ins, error: digErr } = await supabaseAdmin
      .from("digest_subscriptions")
      .insert({
        user_id: userId,
        name: spec.name,
        frequency: spec.frequency,
        day_of_week: spec.day_of_week,
        send_hour: spec.send_hour,
        timezone: "UTC",
        next_send_at: spec.next_send_at,
        is_active: spec.is_active,
        congress_id: spec.congress_id,
        specialty_id: spec.specialty_id,
        hashtags: [],
      })
      .select("id")
      .single();
    if (digErr || !ins) continue;
    digestsCreated++;

    await supabaseAdmin.from("digest_subscription_recipients").insert({
      digest_id: ins.id,
      email: DEMO_SINK_RECIPIENT,
      is_default: true,
    });

    if (spec.sourceHandles.length > 0) {
      const want = new Set(spec.sourceHandles);
      const matched = resolvedSources.filter((s) =>
        want.has((s.handle ?? "").toLowerCase())
      );
      if (matched.length > 0) {
        await supabaseAdmin.from("digest_subscription_sources").insert(
          matched.map((s) => ({ digest_id: ins.id, source_id: s.id }))
        );
      }
    }
  }

  // g) Demo posts
  for (const p of DEMO_POSTS) {
    const postedAt = new Date(now.getTime() - p.daysAgo * 24 * 60 * 60 * 1000);
    const simulatedId = `demo_seed_${p.daysAgo}`;
    await supabaseAdmin.from("demo_posts").insert({
      user_id: userId,
      text: p.text,
      simulated_tweet_id: simulatedId,
      posted_at: postedAt.toISOString(),
    });
  }

  // h) Onboarding state — completed
  // g2) Demo bookmarks — pick up to 4 recent tweets from followed sources.
  if (resolvedSources.length > 0) {
    const { data: recentTweets } = await supabaseAdmin
      .from("tweets")
      .select("id")
      .in("source_id", resolvedSources.map((s) => s.id))
      .order("created_at", { ascending: false })
      .limit(4);
    const notes = [
      "revisit for clinic discussion",
      "check the cited paper",
      null,
      null,
    ];
    const rows = (recentTweets ?? []).map((t, i) => ({
      user_id: userId,
      tweet_id: t.id,
      note: notes[i] ?? null,
    }));
    if (rows.length > 0) {
      await supabaseAdmin
        .from("user_bookmarks")
        .upsert(rows, { onConflict: "user_id,tweet_id" });
    }
  }

  await supabaseAdmin.from("user_onboarding_state").upsert(
    {
      user_id: userId,
      current_step: 7,
      completed_at: new Date().toISOString(),
      skipped_at: null,
      version: 1,
    },
    { onConflict: "user_id" }
  );

  // i) Preferences — defaults with quick-start visible
  await supabaseAdmin.from("user_preferences").upsert(
    {
      user_id: userId,
      theme_density: "comfortable",
      polling_interval_seconds: 30,
      digest_default_frequency: "weekly",
      digest_default_send_hour: 9,
      digest_default_timezone: "UTC",
      digests_active_by_default: true,
      digests_master_enabled: true,
      notify_new_summary: true,
      notify_new_tweet_followed_source: false,
      notify_weekly_recap: true,
      quick_start_dismissed: false,
    },
    { onConflict: "user_id" }
  );

  return {
    sources: resolvedSources.length,
    congresses: (congresses ?? []).length,
    sessions: createdSessions,
    summaries: createdSummaries,
    digests: digestsCreated,
    posts: DEMO_POSTS.length,
  };
}

/** Wipe + reseed every demo user. Used by the nightly cron + admin button. */
export async function resetAllDemoUsers(): Promise<{
  users: number;
  totals: Awaited<ReturnType<typeof seedDemoUser>>;
}> {
  const { data: demos, error } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("is_demo", true);
  if (error) throw new Error(error.message);

  const totals = {
    sources: 0,
    congresses: 0,
    sessions: 0,
    summaries: 0,
    digests: 0,
    posts: 0,
  };
  for (const row of demos ?? []) {
    await wipeDemoUser(row.id);
    const r = await seedDemoUser(row.id);
    totals.sources += r.sources;
    totals.congresses += r.congresses;
    totals.sessions += r.sessions;
    totals.summaries += r.summaries;
    totals.digests += r.digests;
    totals.posts += r.posts;
  }
  return { users: (demos ?? []).length, totals };
}