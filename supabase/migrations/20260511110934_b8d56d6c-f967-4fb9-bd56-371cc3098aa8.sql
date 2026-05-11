-- 1) Cache: default {} (object verdict) + documentation
ALTER TABLE public.watchlist_match_cache
  ALTER COLUMN matches SET DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.watchlist_match_cache.matches IS
  'Per-(tweet,topic_set) verdict object: { matched_topic: string|null, evidence: string }. NOT an array — name is historical.';

-- 2) Coalescing fields on watchlist_email_sends
ALTER TABLE public.watchlist_email_sends
  ADD COLUMN IF NOT EXISTS window_closes_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS pending_match_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  ADD COLUMN IF NOT EXISTS delta_sent_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_wes_pending_flush
  ON public.watchlist_email_sends(window_closes_at)
  WHERE delta_sent_at IS NULL AND array_length(pending_match_ids, 1) > 0;

-- 3) Cron: per-minute flush of pending coalesced deltas
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule('watchlist-flush-deltas');
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

SELECT cron.schedule(
  'watchlist-flush-deltas',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--b4982a9a-484b-4e14-9df5-1bcc313546ed.lovable.app/api/public/hooks/watchlist-flush',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqeGt6ZnJpbHVzZmtoYXVxYnlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NDE5NzAsImV4cCI6MjA5MzIxNzk3MH0.LWoHWNj27i_HX38WP_fE5YvQJuapP6r94Kh4ZLp_K2Y"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);