import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Tweet → session matcher.
//
// Cascade per unprocessed tweet:
//   1. HASHTAG: tweet hashtags include a session.session_hashtag → assign.
//   2. TIME_WINDOW: tweet contains a congress's primary hashtag AND
//      created_at falls inside any session window ±30min.
//        - Single match → assign (match_method='time_window')
//        - Multiple matches → fall through to LLM
//   3. LLM: pick best candidate via Lovable AI Gateway. (match_method='llm')
//
// Every processed tweet (matched or not) gets classification_attempted_at=now()
// so subsequent ticks do NOT re-process it. Without this, every cron tick
// burns LLM budget reprocessing the same unmatched tweets.

const TWEET_BATCH = 200;
const WINDOW_BUFFER_MIN = 30;
const LOOKBACK_HOURS = 72;
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const CLASSIFIER_MODEL = "google/gemini-2.5-flash-lite";

type TweetRow = {
  id: string;
  text: string;
  created_at: string;
  hashtags: string[];
  congress_id: string | null;
};

type SessionRow = {
  id: string;
  congress_id: string;
  title: string;
  track: string;
  session_hashtag: string | null;
  start_time: string;
  end_time: string;
};

type CongressRow = {
  id: string;
  primary_hashtags: string[];
};

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

function normTag(t: string) {
  return t.replace(/^#/, "").toLowerCase();
}

async function tryLock(): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc("try_tweet_matcher_lock");
  if (error) return true;
  return data === true;
}
async function releaseLock(): Promise<void> {
  await supabaseAdmin.rpc("release_tweet_matcher_lock");
}

type Cascade = "hashtag" | "time_window" | "llm" | null;

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
  const list = candidates
    .map(
      (s, i) =>
        `${i + 1}. id=${s.id} | "${s.title}" | track=${s.track} | starts ${s.start_time}`,
    )
    .join("\n");
  const sys =
    "You classify medical-conference tweets to the most likely conference session. Reply with the chosen session id only, or the literal token NONE if no candidate clearly fits.";
  const usr = `TWEET (created ${tweet.created_at}):\n${tweet.text.slice(0, 280)}\n\nCANDIDATE SESSIONS:\n${list}\n\nReply with one of the session ids above, or NONE.`;
  try {
    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: CLASSIFIER_MODEL,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: usr },
        ],
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
    const match = candidates.find((s) => reply.includes(s.id));
    return { sessionId: match?.id ?? null, tokensUsed: tokens };
  } catch {
    return { sessionId: null, tokensUsed: 0 };
  }
}

export const Route = createFileRoute("/api/public/hooks/match-tweets-to-sessions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.X_JOB_SECRET;
        const got = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!expected || got !== expected) {
          return jsonResponse({ ok: false, error: "unauthorized" }, { status: 401 });
        }

        const locked = await tryLock();
        if (!locked) {
          return jsonResponse({ ok: true, skipped: "locked" });
        }

        const startedAt = new Date().toISOString();
        const { data: runRow } = await supabaseAdmin
          .from("tweet_match_run_log")
          .insert({ started_at: startedAt })
          .select("id")
          .single();
        const runId = runRow?.id as string | undefined;

        let considered = 0;
        let hashtagMatches = 0;
        let timeMatches = 0;
        let llmMatches = 0;
        let llmCalls = 0;
        let llmTokens = 0;
        let notes: string | null = null;

        try {
          const sinceISO = new Date(
            Date.now() - LOOKBACK_HOURS * 3_600_000,
          ).toISOString();

          // Pull unprocessed tweets in window
          const { data: tweetsData, error: tErr } = await supabaseAdmin
            .from("tweets")
            .select("id, text, created_at, hashtags, congress_id")
            .is("session_id", null)
            .is("classification_attempted_at", null)
            .gte("created_at", sinceISO)
            .order("created_at", { ascending: false })
            .limit(TWEET_BATCH);
          if (tErr) {
            notes = `tweet_query_error: ${tErr.message}`;
          }
          const tweets = (tweetsData ?? []) as TweetRow[];
          considered = tweets.length;

          if (tweets.length === 0) {
            if (runId) {
              await supabaseAdmin
                .from("tweet_match_run_log")
                .update({
                  finished_at: new Date().toISOString(),
                  tweets_considered: 0,
                  notes: notes ?? "no_unprocessed_tweets",
                })
                .eq("id", runId);
            }
            return jsonResponse({ ok: true, considered: 0 });
          }

          // Fetch sessions + congresses needed
          const { data: sessRows } = await supabaseAdmin
            .from("sessions")
            .select(
              "id, congress_id, title, track, session_hashtag, start_time, end_time",
            );
          const sessions = (sessRows ?? []) as SessionRow[];
          const { data: congRows } = await supabaseAdmin
            .from("congresses")
            .select("id, primary_hashtags");
          const congresses = (congRows ?? []) as CongressRow[];
          const congressById = new Map(congresses.map((c) => [c.id, c]));

          // Build hashtag → session map (for high-confidence)
          const sessionsByHashtag = new Map<string, SessionRow>();
          for (const s of sessions) {
            if (s.session_hashtag) {
              sessionsByHashtag.set(normTag(s.session_hashtag), s);
            }
          }

          // Build congress hashtag → congress map (for time-window matching)
          const congressByHashtag = new Map<string, CongressRow>();
          for (const c of congresses) {
            for (const t of c.primary_hashtags ?? []) {
              congressByHashtag.set(normTag(t), c);
            }
          }

          const nowISO = new Date().toISOString();

          for (const tweet of tweets) {
            const tags = (tweet.hashtags ?? []).map(normTag);
            let assignedSessionId: string | null = null;
            let method: Cascade = null;

            // 1. Hashtag-first
            for (const tag of tags) {
              const s = sessionsByHashtag.get(tag);
              if (s) {
                assignedSessionId = s.id;
                method = "hashtag";
                hashtagMatches += 1;
                break;
              }
            }

            // 2. Time-window via congress hashtag
            if (!assignedSessionId) {
              const tweetMs = new Date(tweet.created_at).getTime();
              // Find candidate congresses by tag
              const candidateCongressIds = new Set<string>();
              for (const tag of tags) {
                const c = congressByHashtag.get(tag);
                if (c) candidateCongressIds.add(c.id);
              }
              if (tweet.congress_id) candidateCongressIds.add(tweet.congress_id);

              if (candidateCongressIds.size > 0) {
                const buffer = WINDOW_BUFFER_MIN * 60_000;
                const matches = sessions.filter((s) => {
                  if (!candidateCongressIds.has(s.congress_id)) return false;
                  const start = new Date(s.start_time).getTime() - buffer;
                  const end = new Date(s.end_time).getTime() + buffer;
                  return tweetMs >= start && tweetMs <= end;
                });
                if (matches.length === 1) {
                  assignedSessionId = matches[0].id;
                  method = "time_window";
                  timeMatches += 1;
                } else if (matches.length > 1) {
                  // 3. LLM disambiguation
                  llmCalls += 1;
                  const decision = await llmClassify(tweet, matches.slice(0, 8));
                  llmTokens += decision.tokensUsed;
                  if (decision.sessionId) {
                    assignedSessionId = decision.sessionId;
                    method = "llm";
                    llmMatches += 1;
                  }
                }
              }
            }

            // Always mark classification_attempted_at — cost control critical.
            const patch: Record<string, unknown> = {
              classification_attempted_at: nowISO,
            };
            if (assignedSessionId && method) {
              patch.session_id = assignedSessionId;
              patch.match_method = method;
              // Inherit congress_id from the matched session if not set
              const sess = sessions.find((s) => s.id === assignedSessionId);
              if (sess && !tweet.congress_id) {
                patch.congress_id = sess.congress_id;
              }
            }
            await supabaseAdmin
              .from("tweets")
              .update(patch as never)
              .eq("id", tweet.id);
          }

          if (runId) {
            await supabaseAdmin
              .from("tweet_match_run_log")
              .update({
                finished_at: new Date().toISOString(),
                tweets_considered: considered,
                hashtag_matches: hashtagMatches,
                time_window_matches: timeMatches,
                llm_matches: llmMatches,
                llm_calls: llmCalls,
                llm_tokens_used: llmTokens,
                notes,
              })
              .eq("id", runId);
          }

          return jsonResponse({
            ok: true,
            considered,
            hashtag: hashtagMatches,
            time_window: timeMatches,
            llm: llmMatches,
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
