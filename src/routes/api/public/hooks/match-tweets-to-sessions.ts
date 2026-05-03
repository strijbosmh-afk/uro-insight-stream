import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireCronAuth } from "@/server/cron-auth.server";

// Tweet → session matcher (extended cascade).
//
// Cascade per unprocessed tweet, evaluated in order. First match wins.
//
//   1. HASHTAG          — tweet hashtags include sessions.session_hashtag
//   2. ABSTRACT_NUMBER  — tweet text contains an abstract.abstract_number
//   3. SPEAKER          — tweet text contains any session chair name
//                         (within session time window ± buffer)
//   4. ENTITY           — tweet text contains any session.entities entry
//                         (within session time window ± buffer)
//   5. TIME_WINDOW      — tweet has a congress hashtag and falls inside
//                         exactly one session's window
//   6. LLM              — multi-candidate disambiguation, last resort
//   7. THREAD_PROPAGATION — fallback sweep: assign session_id from parent
//                           tweet when this tweet has parent_in_db_id and
//                           no signal of its own
//
// Every processed tweet (matched or not) gets classification_attempted_at
// stamped so subsequent ticks do NOT re-process it.

const TWEET_BATCH = 200;
const WINDOW_BUFFER_MIN = 30;
const LOOKBACK_HOURS = 72;
const MAX_LLM_CALLS_PER_TICK = 30;
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const CLASSIFIER_MODEL = "google/gemini-2.5-flash-lite";

type TweetRow = {
  id: string;
  text: string;
  created_at: string;
  hashtags: string[];
  congress_id: string | null;
  parent_in_db_id: string | null;
};

type SessionRow = {
  id: string;
  congress_id: string;
  title: string;
  track: string;
  session_hashtag: string | null;
  start_time: string;
  end_time: string;
  chairs: string[];
  entities: string[];
  abstract_ids: string[];
};

type CongressRow = {
  id: string;
  primary_hashtags: string[];
};

type AbstractRow = {
  id: string;
  session_id: string;
  abstract_number: string;
};

type Cascade =
  | "hashtag"
  | "abstract_number"
  | "speaker"
  | "entity"
  | "time_window"
  | "llm"
  | "thread_propagation"
  | null;

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

function normTag(t: string) {
  return t.replace(/^#/, "").toLowerCase();
}

function lower(s: string) {
  return s.toLowerCase();
}

/** Build a regex that matches any of the given names as whole-word, case-insensitive. */
function buildNameRegex(names: string[]): RegExp | null {
  const cleaned = names
    .map((n) => n.trim())
    .filter((n) => n.length >= 3)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (cleaned.length === 0) return null;
  return new RegExp(`\\b(?:${cleaned.join("|")})\\b`, "i");
}

/** Extract candidate abstract-number tokens from a tweet text. */
function extractAbstractNumbers(text: string): string[] {
  const out = new Set<string>();
  const re = /\b(?:abstract|abs|poster)\s*#?(\d{2,5})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.add(m[1]);
  return Array.from(out);
}

async function tryLock(): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc("try_tweet_matcher_lock");
  if (error) return false; // fail-closed (audit M9)
  return data === true;
}
async function releaseLock(): Promise<void> {
  await supabaseAdmin.rpc("release_tweet_matcher_lock");
}

type ClassifyDecision = {
  sessionId: string | null;
  tokensUsed: number;
};

async function llmClassify(
  tweet: TweetRow,
  candidates: SessionRow[],
): Promise<ClassifyDecision> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return { sessionId: null, tokensUsed: 0 };
  const promptCandidates = candidates
    .slice(0, 8)
    .map((s, i) => `${i + 1}. (id:${s.id}) ${s.title}${s.track ? ` — ${s.track}` : ""}`)
    .join("\n");
  const userPrompt = [
    "You're matching a single congress tweet to one of these candidate sessions.",
    "Reply with only the id of the best match, or 'none' if no clear match.",
    "",
    `Tweet: ${tweet.text.slice(0, 280)}`,
    "",
    "Candidates:",
    promptCandidates,
  ].join("\n");
  try {
    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: CLASSIFIER_MODEL,
        messages: [{ role: "user", content: userPrompt }],
        temperature: 0,
        max_tokens: 40,
      }),
    });
    if (!res.ok) return { sessionId: null, tokensUsed: 0 };
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { total_tokens?: number };
    };
    const reply = json.choices?.[0]?.message?.content?.trim() ?? "";
    const tokens = json.usage?.total_tokens ?? 0;
    if (!reply || /^none$/i.test(reply)) return { sessionId: null, tokensUsed: tokens };
    const match = candidates.find((c) => reply.includes(c.id));
    return { sessionId: match?.id ?? null, tokensUsed: tokens };
  } catch {
    return { sessionId: null, tokensUsed: 0 };
  }
}

export const Route = createFileRoute("/api/public/hooks/match-tweets-to-sessions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireCronAuth(request);
        if (auth) return auth;

        const locked = await tryLock();
        if (!locked) return jsonResponse({ ok: true, skipped: "locked" });

        const startedAt = new Date().toISOString();
        const { data: runRow } = await supabaseAdmin
          .from("tweet_match_run_log")
          .insert({ started_at: startedAt })
          .select("id")
          .single();
        const runId = runRow?.id as string | undefined;

        let considered = 0;
        const counts: Record<NonNullable<Cascade>, number> = {
          hashtag: 0,
          abstract_number: 0,
          speaker: 0,
          entity: 0,
          time_window: 0,
          llm: 0,
          thread_propagation: 0,
        };
        let llmCalls = 0;
        let llmTokens = 0;
        let notes: string | null = null;

        try {
          const sinceISO = new Date(
            Date.now() - LOOKBACK_HOURS * 3_600_000,
          ).toISOString();

          const { data: tweetsData, error: tErr } = await supabaseAdmin
            .from("tweets")
            .select(
              "id, text, created_at, hashtags, congress_id, parent_in_db_id",
            )
            .is("session_id", null)
            .is("classification_attempted_at", null)
            .gte("created_at", sinceISO)
            .order("created_at", { ascending: false })
            .limit(TWEET_BATCH);
          if (tErr) notes = `tweet_query_error: ${tErr.message}`;

          const tweets = (tweetsData ?? []) as TweetRow[];
          considered = tweets.length;

          if (tweets.length === 0) {
            // Even with no unprocessed tweets, run thread propagation in
            // case earlier matches now have unmatched replies.
            const propagated = await runThreadPropagation();
            counts.thread_propagation = propagated;
            if (runId) {
              await supabaseAdmin
                .from("tweet_match_run_log")
                .update({
                  finished_at: new Date().toISOString(),
                  tweets_considered: 0,
                  hashtag_matches: 0,
                  time_window_matches: 0,
                  llm_matches: 0,
                  llm_calls: 0,
                  llm_tokens_used: 0,
                  notes: notes ?? `propagated:${propagated}`,
                })
                .eq("id", runId);
            }
            return jsonResponse({
              ok: true,
              considered: 0,
              thread_propagation: propagated,
            });
          }

          // Pre-fetch sessions with extended fields, congresses, and
          // abstracts. One round-trip each, used across all tweets.
          const { data: sessRows } = await supabaseAdmin
            .from("sessions")
            .select(
              "id, congress_id, title, track, session_hashtag, start_time, end_time, chairs, abstract_ids",
            );
          const sessions = ((sessRows ?? []) as unknown as SessionRow[]).map((s) => ({
            ...s,
            entities: s.entities ?? [],
          }));
          const sessionById = new Map(sessions.map((s) => [s.id, s]));

          const { data: congRows } = await supabaseAdmin
            .from("congresses")
            .select("id, primary_hashtags");
          const congresses = (congRows ?? []) as CongressRow[];

          const { data: absRows } = await supabaseAdmin
            .from("abstracts")
            .select("id, session_id, abstract_number")
            .neq("abstract_number", "");
          const abstracts = (absRows ?? []) as AbstractRow[];
          const abstractByNumber = new Map<string, AbstractRow>();
          for (const a of abstracts) {
            const num = a.abstract_number.replace(/\D/g, "");
            if (num) abstractByNumber.set(num, a);
          }

          // Maps used by the cascade.
          const sessionsByHashtag = new Map<string, SessionRow>();
          for (const s of sessions) {
            if (s.session_hashtag) {
              sessionsByHashtag.set(normTag(s.session_hashtag), s);
            }
          }
          const congressByHashtag = new Map<string, CongressRow>();
          for (const c of congresses) {
            for (const t of c.primary_hashtags ?? []) {
              congressByHashtag.set(normTag(t), c);
            }
          }
          // Pre-compile name + entity regexes per session.
          const sessionNameRegex = new Map<string, RegExp | null>();
          const sessionEntityRegex = new Map<string, RegExp | null>();
          for (const s of sessions) {
            sessionNameRegex.set(s.id, buildNameRegex(s.chairs ?? []));
            sessionEntityRegex.set(s.id, buildNameRegex(s.entities ?? []));
          }

          const nowISO = new Date().toISOString();

          for (const tweet of tweets) {
            const tags = (tweet.hashtags ?? []).map(normTag);
            const tweetMs = new Date(tweet.created_at).getTime();
            const buffer = WINDOW_BUFFER_MIN * 60_000;
            let assignedSessionId: string | null = null;
            let method: Cascade = null;

            // Step 1 — exact session-hashtag match.
            for (const tag of tags) {
              const s = sessionsByHashtag.get(tag);
              if (s) {
                assignedSessionId = s.id;
                method = "hashtag";
                break;
              }
            }

            // Determine candidate congresses (used by steps 3/4/5 to limit
            // session search to relevant congresses).
            const candidateCongressIds = new Set<string>();
            for (const tag of tags) {
              const c = congressByHashtag.get(tag);
              if (c) candidateCongressIds.add(c.id);
            }
            if (tweet.congress_id) candidateCongressIds.add(tweet.congress_id);

            // Step 2 — abstract number match.
            if (!assignedSessionId) {
              const numbers = extractAbstractNumbers(tweet.text);
              for (const n of numbers) {
                const a = abstractByNumber.get(n);
                if (a) {
                  // Confirm the tweet is plausibly inside the session window.
                  const sess = sessionById.get(a.session_id);
                  if (sess) {
                    const start = new Date(sess.start_time).getTime() - buffer * 4;
                    const end = new Date(sess.end_time).getTime() + buffer * 4;
                    if (tweetMs >= start && tweetMs <= end) {
                      assignedSessionId = a.session_id;
                      method = "abstract_number";
                      break;
                    }
                  }
                }
              }
            }

            // Step 3 — speaker / chair name match within time window.
            if (!assignedSessionId && candidateCongressIds.size > 0) {
              const matches = sessions.filter((s) => {
                if (!candidateCongressIds.has(s.congress_id)) return false;
                const start = new Date(s.start_time).getTime() - buffer;
                const end = new Date(s.end_time).getTime() + buffer;
                if (tweetMs < start || tweetMs > end) return false;
                const re = sessionNameRegex.get(s.id);
                return !!re && re.test(tweet.text);
              });
              if (matches.length === 1) {
                assignedSessionId = matches[0].id;
                method = "speaker";
              }
            }

            // Step 4 — drug / trial / entity vocabulary match.
            if (!assignedSessionId && candidateCongressIds.size > 0) {
              const matches = sessions.filter((s) => {
                if (!candidateCongressIds.has(s.congress_id)) return false;
                const start = new Date(s.start_time).getTime() - buffer;
                const end = new Date(s.end_time).getTime() + buffer;
                if (tweetMs < start || tweetMs > end) return false;
                const re = sessionEntityRegex.get(s.id);
                return !!re && re.test(tweet.text);
              });
              if (matches.length === 1) {
                assignedSessionId = matches[0].id;
                method = "entity";
              }
            }

            // Step 5 — time-window via congress hashtag.
            if (!assignedSessionId && candidateCongressIds.size > 0) {
              const matches = sessions.filter((s) => {
                if (!candidateCongressIds.has(s.congress_id)) return false;
                const start = new Date(s.start_time).getTime() - buffer;
                const end = new Date(s.end_time).getTime() + buffer;
                return tweetMs >= start && tweetMs <= end;
              });
              if (matches.length === 1) {
                assignedSessionId = matches[0].id;
                method = "time_window";
              } else if (matches.length > 1 && llmCalls < MAX_LLM_CALLS_PER_TICK) {
                // Step 6 — LLM disambiguation on multi-candidate.
                llmCalls += 1;
                const decision = await llmClassify(tweet, matches.slice(0, 8));
                llmTokens += decision.tokensUsed;
                if (decision.sessionId) {
                  assignedSessionId = decision.sessionId;
                  method = "llm";
                }
              }
            }

            if (assignedSessionId && method) counts[method] += 1;

            // Always stamp classification_attempted_at — cost-control critical.
            const patch: Record<string, unknown> = {
              classification_attempted_at: nowISO,
            };
            if (assignedSessionId && method) {
              patch.session_id = assignedSessionId;
              patch.match_method = method;
              const sess = sessionById.get(assignedSessionId);
              if (sess && !tweet.congress_id) patch.congress_id = sess.congress_id;
            }
            // Even without a session match, if exactly one congress is
            // implicated by the tweet's hashtags (or it already had one),
            // tag the tweet's congress_id so congress-day summaries pick it up.
            if (
              !patch.congress_id &&
              !tweet.congress_id &&
              candidateCongressIds.size === 1
            ) {
              patch.congress_id = Array.from(candidateCongressIds)[0];
            }
            await supabaseAdmin
              .from("tweets")
              .update(patch as never)
              .eq("id", tweet.id);
          }

          // Step 7 — Thread propagation sweep across all unmatched-but-attempted
          // tweets that have parent_in_db_id pointing at a now-matched parent.
          const propagated = await runThreadPropagation();
          counts.thread_propagation = propagated;

          if (runId) {
            await supabaseAdmin
              .from("tweet_match_run_log")
              .update({
                finished_at: new Date().toISOString(),
                tweets_considered: considered,
                hashtag_matches: counts.hashtag,
                time_window_matches: counts.time_window,
                llm_matches: counts.llm,
                llm_calls: llmCalls,
                llm_tokens_used: llmTokens,
                notes:
                  `abstract:${counts.abstract_number} ` +
                  `speaker:${counts.speaker} ` +
                  `entity:${counts.entity} ` +
                  `propagated:${counts.thread_propagation}` +
                  (notes ? ` | ${notes}` : ""),
              })
              .eq("id", runId);
          }

          return jsonResponse({
            ok: true,
            considered,
            ...counts,
            llm_calls: llmCalls,
            llm_tokens: llmTokens,
          });
        } finally {
          await releaseLock();
        }
      },
    },
  },
});

/**
 * Sweep tweets where session_id IS NULL but parent_in_db_id is set; if the
 * parent has session_id and the child is within ±2h of the parent's
 * created_at, inherit. Bounded sweep — at most 500 propagations per tick.
 */
async function runThreadPropagation(): Promise<number> {
  const { data, error } = await (supabaseAdmin.rpc as unknown as (
    name: string,
  ) => Promise<{ data: unknown; error: { message: string } | null }>)(
    "propagate_session_id_via_thread",
  );
  if (error) {
    // RPC may not exist yet (first deploy of this migration). Fall back to
    // a JS-side sweep so we still get the win on day-zero.
    return await runThreadPropagationFallback();
  }
  return typeof data === "number" ? data : 0;
}

async function runThreadPropagationFallback(): Promise<number> {
  // Pull recent unmatched tweets that DO have a parent-in-db reference and
  // have already been classification-attempted (so they fell through the
  // main cascade). Inherit session_id from the parent if it has one and
  // the timestamps are within 2h.
  const sinceISO = new Date(Date.now() - LOOKBACK_HOURS * 3_600_000).toISOString();
  const { data: candidates } = await supabaseAdmin
    .from("tweets")
    .select("id, parent_in_db_id, created_at")
    .is("session_id", null)
    .not("parent_in_db_id", "is", null)
    .not("classification_attempted_at", "is", null)
    .gte("created_at", sinceISO)
    .limit(500);
  const cands = (candidates ?? []) as Array<{
    id: string;
    parent_in_db_id: string;
    created_at: string;
  }>;
  if (cands.length === 0) return 0;
  const parentIds = Array.from(new Set(cands.map((c) => c.parent_in_db_id)));
  const { data: parents } = await supabaseAdmin
    .from("tweets")
    .select("id, session_id, created_at")
    .in("id", parentIds)
    .not("session_id", "is", null);
  const parentMap = new Map(
    ((parents ?? []) as Array<{ id: string; session_id: string; created_at: string }>).map((p) => [
      p.id,
      p,
    ]),
  );
  let propagated = 0;
  const TWO_HOURS = 2 * 3_600_000;
  for (const c of cands) {
    const p = parentMap.get(c.parent_in_db_id);
    if (!p) continue;
    const dt = Math.abs(
      new Date(c.created_at).getTime() - new Date(p.created_at).getTime(),
    );
    if (dt > TWO_HOURS) continue;
    await supabaseAdmin
      .from("tweets")
      .update({
        session_id: p.session_id,
        match_method: "thread_propagation",
      } as never)
      .eq("id", c.id);
    propagated += 1;
  }
  return propagated;
}
