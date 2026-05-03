ALTER TABLE public.source_candidates
  ADD COLUMN IF NOT EXISTS signal_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS quote_count integer NOT NULL DEFAULT 0;