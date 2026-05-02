-- =================================================
-- Migrate sessions/abstracts/summaries to real tables
-- + tweet matcher columns + seed from mock
-- =================================================

ALTER TABLE public.congresses
  ADD COLUMN IF NOT EXISTS seeded_from_mock boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.sessions (
  id text PRIMARY KEY,
  congress_id text NOT NULL,
  title text NOT NULL,
  track text NOT NULL DEFAULT '',
  room text NOT NULL DEFAULT '',
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  chairs text[] NOT NULL DEFAULT '{}'::text[],
  abstract_ids text[] NOT NULL DEFAULT '{}'::text[],
  session_hashtag text,
  seeded_from_mock boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sessions_congress_id ON public.sessions(congress_id);
CREATE INDEX IF NOT EXISTS idx_sessions_window ON public.sessions(start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_sessions_hashtag_lower ON public.sessions(LOWER(session_hashtag)) WHERE session_hashtag IS NOT NULL;

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read sessions" ON public.sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Editors and admins insert sessions" ON public.sessions FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'editor'::app_role));
CREATE POLICY "Editors and admins update sessions" ON public.sessions FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'editor'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'editor'::app_role));
CREATE POLICY "Admins delete sessions" ON public.sessions FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role));

CREATE TRIGGER trg_sessions_touch BEFORE UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.abstracts (
  id text PRIMARY KEY,
  session_id text NOT NULL,
  title text NOT NULL,
  authors text[] NOT NULL DEFAULT '{}'::text[],
  institution text NOT NULL DEFAULT '',
  abstract_number text NOT NULL DEFAULT '',
  seeded_from_mock boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_abstracts_session_id ON public.abstracts(session_id);

ALTER TABLE public.abstracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read abstracts" ON public.abstracts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Editors and admins insert abstracts" ON public.abstracts FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'editor'::app_role));
CREATE POLICY "Editors and admins update abstracts" ON public.abstracts FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'editor'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'editor'::app_role));
CREATE POLICY "Admins delete abstracts" ON public.abstracts FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role));

CREATE TRIGGER trg_abstracts_touch BEFORE UPDATE ON public.abstracts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.summaries (
  id text PRIMARY KEY,
  target_type text NOT NULL CHECK (target_type IN ('session','abstract','congress')),
  target_id text NOT NULL,
  bullet_points text[] NOT NULL DEFAULT '{}'::text[],
  key_quotes jsonb NOT NULL DEFAULT '[]'::jsonb,
  sentiment text NOT NULL DEFAULT 'neutral',
  controversies text[] NOT NULL DEFAULT '{}'::text[],
  takeaways text[] NOT NULL DEFAULT '{}'::text[],
  tweet_count integer NOT NULL DEFAULT 0,
  generated_at timestamptz NOT NULL DEFAULT now(),
  model_used text NOT NULL DEFAULT '',
  seeded_from_mock boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_summaries_target ON public.summaries(target_type, target_id);

ALTER TABLE public.summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read summaries" ON public.summaries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert summaries" ON public.summaries FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update summaries" ON public.summaries FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins delete summaries" ON public.summaries FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'::app_role));

CREATE TRIGGER trg_summaries_touch BEFORE UPDATE ON public.summaries
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.tweets
  ADD COLUMN IF NOT EXISTS classification_attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS match_method text CHECK (match_method IN ('hashtag','time_window','llm','manual'));

CREATE INDEX IF NOT EXISTS idx_tweets_unclassified
  ON public.tweets(created_at DESC)
  WHERE session_id IS NULL AND classification_attempted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tweets_session_id ON public.tweets(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tweets_created_at ON public.tweets(created_at DESC);

CREATE TABLE IF NOT EXISTS public.tweet_match_run_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  tweets_considered integer NOT NULL DEFAULT 0,
  hashtag_matches integer NOT NULL DEFAULT 0,
  time_window_matches integer NOT NULL DEFAULT 0,
  llm_matches integer NOT NULL DEFAULT 0,
  llm_calls integer NOT NULL DEFAULT 0,
  llm_tokens_used integer NOT NULL DEFAULT 0,
  notes text
);
ALTER TABLE public.tweet_match_run_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read match run log" ON public.tweet_match_run_log FOR SELECT TO authenticated USING (true);
