
-- Ask UroFeed cache
CREATE TABLE IF NOT EXISTS public.ask_query_cache (
  fingerprint text PRIMARY KEY,
  query_text text NOT NULL,
  user_id_for_scope uuid NULL,
  scope text NOT NULL,
  window_days int NOT NULL,
  answer jsonb NOT NULL,
  tweet_ids text[] NOT NULL,
  tweet_count int NOT NULL,
  llm_tokens_used int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  hit_count int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_ask_cache_age ON public.ask_query_cache(created_at);
CREATE INDEX IF NOT EXISTS idx_ask_cache_user_recent
  ON public.ask_query_cache(user_id_for_scope, created_at DESC)
  WHERE user_id_for_scope IS NOT NULL;

ALTER TABLE public.ask_query_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ask_cache_read_own_or_shared"
  ON public.ask_query_cache FOR SELECT
  TO authenticated
  USING (user_id_for_scope IS NULL OR user_id_for_scope = auth.uid());

-- Rate limit (server-side only)
CREATE TABLE IF NOT EXISTS public.rate_limit_ask (
  user_id uuid NOT NULL,
  window_start timestamptz NOT NULL,
  count int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, window_start)
);

ALTER TABLE public.rate_limit_ask ENABLE ROW LEVEL SECURITY;
-- No policies — service role only.

-- Starter prompts
CREATE TABLE IF NOT EXISTS public.ask_starter_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt text NOT NULL,
  specialty_id text NULL,
  sort_order int NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ask_starters_lookup
  ON public.ask_starter_prompts(specialty_id, is_active, sort_order);

ALTER TABLE public.ask_starter_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ask_starters_read_active"
  ON public.ask_starter_prompts FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "ask_starters_admin_write"
  ON public.ask_starter_prompts FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Seed starters
INSERT INTO public.ask_starter_prompts (prompt, specialty_id, sort_order) VALUES
  ('What''s the latest on PSMA imaging?', 'onco_prostate', 10),
  ('Who''s talking about TALAPRO-2?', 'onco_prostate', 20),
  ('What did APCCC26 say about active surveillance?', 'onco_prostate', 30),
  ('Any new mCRPC treatments discussed recently?', 'onco_prostate', 40),
  ('What''s the latest on enfortumab vedotin?', 'onco_bladder', 10),
  ('Any updates on bladder-sparing approaches?', 'onco_bladder', 20),
  ('What''s new in robotic kidney surgery?', 'onco_kidney', 10),
  ('Any new IO combinations for advanced RCC?', 'onco_kidney', 20),
  ('What are people saying about new BPH treatments?', NULL, 50),
  ('Any practice-changing trials this month?', NULL, 60),
  ('What''s trending at the latest urology congress?', NULL, 70),
  ('What''s new in urolithiasis management?', NULL, 80)
ON CONFLICT DO NOTHING;

-- Cron cleanup of stale cache (>7d)
DO $$
BEGIN
  PERFORM cron.unschedule('ask-cache-cleanup-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'ask-cache-cleanup-daily',
  '17 3 * * *',
  $$ DELETE FROM public.ask_query_cache WHERE created_at < now() - interval '7 days';
     DELETE FROM public.rate_limit_ask WHERE window_start < now() - interval '2 days'; $$
);
