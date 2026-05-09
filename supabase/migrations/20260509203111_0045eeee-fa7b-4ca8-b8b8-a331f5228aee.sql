ALTER TABLE public.digest_subscriptions
  ADD COLUMN IF NOT EXISTS specialty_id text NULL REFERENCES public.urology_specialties(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS congress_id text NULL REFERENCES public.congresses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hashtags text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_digest_subs_specialty ON public.digest_subscriptions(specialty_id) WHERE specialty_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_digest_subs_congress  ON public.digest_subscriptions(congress_id)  WHERE congress_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_digest_subs_hashtags  ON public.digest_subscriptions USING GIN (hashtags);