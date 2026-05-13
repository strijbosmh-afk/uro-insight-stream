-- digest_preview_cache: memoise weekly digest previews keyed by fingerprint of inputs
CREATE TABLE IF NOT EXISTS public.digest_preview_cache (
  fingerprint text PRIMARY KEY,
  rendered jsonb NOT NULL,
  tweet_count integer NOT NULL,
  llm_tokens_used integer NOT NULL DEFAULT 0,
  hit_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_digest_preview_cache_age
  ON public.digest_preview_cache(created_at);

ALTER TABLE public.digest_preview_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read digest preview cache"
  ON public.digest_preview_cache
  FOR SELECT
  TO authenticated
  USING (is_admin(auth.uid()));

-- rate_limit_preview: per-user sliding window (mirrors rate_limit_lookups shape)
CREATE TABLE IF NOT EXISTS public.rate_limit_preview (
  user_id uuid NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, window_start)
);

ALTER TABLE public.rate_limit_preview ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own preview rate limit"
  ON public.rate_limit_preview
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins read all preview rate limits"
  ON public.rate_limit_preview
  FOR SELECT
  TO authenticated
  USING (is_admin(auth.uid()));

-- Daily cleanup of stale preview cache rows
SELECT cron.schedule(
  'cleanup-digest-preview-cache',
  '17 3 * * *',
  $cron$
  DELETE FROM public.digest_preview_cache WHERE created_at < now() - interval '7 days';
  $cron$
);
