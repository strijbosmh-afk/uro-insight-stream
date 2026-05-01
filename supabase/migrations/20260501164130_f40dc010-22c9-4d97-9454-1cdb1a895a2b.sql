
-- Tweets storage (global, read-all for authenticated; writes only via service role)
CREATE TABLE public.tweets (
  id TEXT PRIMARY KEY, -- upstream tweet id
  source_id TEXT, -- handle or internal source id
  author_handle TEXT NOT NULL,
  author_display_name TEXT,
  text TEXT NOT NULL,
  lang TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  like_count INT NOT NULL DEFAULT 0,
  retweet_count INT NOT NULL DEFAULT 0,
  reply_count INT NOT NULL DEFAULT 0,
  media_urls TEXT[] NOT NULL DEFAULT '{}',
  hashtags TEXT[] NOT NULL DEFAULT '{}',
  session_id TEXT,
  abstract_id TEXT,
  congress_id TEXT,
  raw JSONB,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tweets_created_at ON public.tweets (created_at DESC);
CREATE INDEX idx_tweets_source_id ON public.tweets (source_id);
CREATE INDEX idx_tweets_hashtags ON public.tweets USING GIN (hashtags);
CREATE INDEX idx_tweets_text_fts ON public.tweets USING GIN (to_tsvector('simple', text));
CREATE INDEX idx_tweets_session ON public.tweets (session_id) WHERE session_id IS NOT NULL;
CREATE INDEX idx_tweets_congress ON public.tweets (congress_id) WHERE congress_id IS NOT NULL;

ALTER TABLE public.tweets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read tweets"
  ON public.tweets FOR SELECT TO authenticated USING (true);

-- Ingestion config (single row, admin-managed)
CREATE TABLE public.ingestion_config (
  id INT PRIMARY KEY DEFAULT 1,
  adapter TEXT NOT NULL DEFAULT 'x_api_v2',     -- x_api_v2 | socialdata | twitterapi_io | mock
  enabled BOOLEAN NOT NULL DEFAULT true,
  poll_interval_minutes INT NOT NULL DEFAULT 10,
  rate_limit_per_15min INT NOT NULL DEFAULT 450,
  default_lookback_minutes INT NOT NULL DEFAULT 60,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  CONSTRAINT ingestion_config_singleton CHECK (id = 1)
);
INSERT INTO public.ingestion_config (id) VALUES (1) ON CONFLICT DO NOTHING;
ALTER TABLE public.ingestion_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read ingestion config"
  ON public.ingestion_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can update ingestion config"
  ON public.ingestion_config FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Ingestion runs (per-source/hashtag run history)
CREATE TABLE public.ingestion_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type TEXT NOT NULL,   -- 'handle' | 'hashtag'
  target TEXT NOT NULL,        -- handle string or tag
  adapter TEXT NOT NULL,
  status TEXT NOT NULL,        -- 'success' | 'error' | 'rate_limited' | 'running'
  tweets_fetched INT NOT NULL DEFAULT 0,
  tweets_inserted INT NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  triggered_by UUID
);
CREATE INDEX idx_ingestion_runs_target ON public.ingestion_runs (target_type, target, started_at DESC);
CREATE INDEX idx_ingestion_runs_started ON public.ingestion_runs (started_at DESC);
ALTER TABLE public.ingestion_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read ingestion runs"
  ON public.ingestion_runs FOR SELECT TO authenticated USING (true);
