
CREATE TABLE IF NOT EXISTS public.congress_suggestion_cache (
  query_normalized text PRIMARY KEY,
  response_json jsonb NOT NULL,
  hits int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.congress_suggestion_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cache_read_auth" ON public.congress_suggestion_cache
  FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.rate_limit_congress_suggest (
  user_id uuid NOT NULL,
  window_start timestamptz NOT NULL,
  count int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, window_start)
);
CREATE INDEX IF NOT EXISTS idx_rate_limit_congress_suggest_window
  ON public.rate_limit_congress_suggest (window_start DESC);
ALTER TABLE public.rate_limit_congress_suggest ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rl_suggest_read_own" ON public.rate_limit_congress_suggest
  FOR SELECT TO authenticated USING (user_id = auth.uid());
