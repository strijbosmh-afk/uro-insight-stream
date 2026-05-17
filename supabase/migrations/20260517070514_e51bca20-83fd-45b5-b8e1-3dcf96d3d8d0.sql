ALTER TABLE public.digest_subscriptions
ADD COLUMN IF NOT EXISTS include_sources_summary boolean NOT NULL DEFAULT false;