CREATE INDEX IF NOT EXISTS idx_sessions_entities
  ON public.sessions USING GIN (entities);

ALTER TABLE public.tweets DROP CONSTRAINT IF EXISTS tweets_match_method_check;
ALTER TABLE public.tweets
  ADD CONSTRAINT tweets_match_method_check
  CHECK (match_method IS NULL OR match_method IN (
    'hashtag','abstract_number','speaker','entity',
    'time_window','llm','thread_propagation','manual'
  ));

CREATE INDEX IF NOT EXISTS idx_abstracts_number_session
  ON public.abstracts (abstract_number, session_id)
  WHERE abstract_number <> '';