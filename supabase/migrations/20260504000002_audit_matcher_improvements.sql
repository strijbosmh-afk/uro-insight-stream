-- Audit improvement: extend the tweet→session matcher cascade with
-- deterministic free signals (speaker/chair, abstract number, entity
-- vocabulary) plus thread propagation.

-- 1. Add `entities` to sessions for drug/trial/intervention vocabulary
--    (Recommendation #5). Free-form text array, populated by LLM extraction
--    at session creation OR by admin curation on the session edit form.
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS entities text[] NOT NULL DEFAULT '{}'::text[];

-- 2. Extend the match_method enum to track the new cascade steps. Existing
--    constraint allowed only ('hashtag','time_window','llm','manual'); add
--    the four new methods.
ALTER TABLE public.tweets
  DROP CONSTRAINT IF EXISTS tweets_match_method_check;
ALTER TABLE public.tweets
  ADD CONSTRAINT tweets_match_method_check
  CHECK (match_method IS NULL OR match_method IN (
    'hashtag',
    'abstract_number',
    'speaker',
    'entity',
    'time_window',
    'llm',
    'thread_propagation',
    'manual'
  ));

-- 3. Index on sessions.entities for quick filter.
CREATE INDEX IF NOT EXISTS idx_sessions_entities
  ON public.sessions USING GIN (entities);

-- 4. Index on abstracts(abstract_number, session_id) for fast lookup
--    when matching against tweet text.
CREATE INDEX IF NOT EXISTS idx_abstracts_number_session
  ON public.abstracts (abstract_number, session_id)
  WHERE abstract_number <> '';

