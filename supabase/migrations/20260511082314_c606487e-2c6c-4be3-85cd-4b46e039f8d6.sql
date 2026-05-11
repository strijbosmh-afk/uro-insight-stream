-- Add per-source enrichment columns so the rules engine can score directly
-- off `sources` instead of joining to source_candidates by handle.
ALTER TABLE public.sources
  ADD COLUMN IF NOT EXISTS bio text NULL,
  ADD COLUMN IF NOT EXISTS followers_count integer NULL,
  ADD COLUMN IF NOT EXISTS enriched_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS last_enrichment_attempt_at timestamptz NULL;

-- Index for the cron eligibility query (NULL or stale).
CREATE INDEX IF NOT EXISTS idx_sources_enriched_at
  ON public.sources (enriched_at NULLS FIRST);

-- One-shot backfill: copy whatever overlap already exists in source_candidates.
UPDATE public.sources s
SET bio = sc.bio,
    followers_count = sc.followers_count,
    verified = COALESCE(sc.verified, s.verified),
    enriched_at = COALESCE(sc.enrichment_attempted_at, now())
FROM public.source_candidates sc
WHERE lower(sc.handle) = lower(s.handle)
  AND sc.enrichment_status = 'enriched'
  AND s.enriched_at IS NULL;