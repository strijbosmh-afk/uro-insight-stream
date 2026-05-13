-- H-S1: Mute tokens must expire so leaked email archives can't replay forever.
ALTER TABLE public.watchlist_mute_tokens
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days');

-- Backfill for any pre-existing rows that defaulted to NULL before the constraint.
UPDATE public.watchlist_mute_tokens
   SET expires_at = created_at + interval '30 days'
 WHERE expires_at IS NULL;

CREATE INDEX IF NOT EXISTS watchlist_mute_tokens_expires_at_idx
  ON public.watchlist_mute_tokens (expires_at);

-- Cleanup helper: drop tokens that are either past expiry, or were used more
-- than 7 days ago. Safe to call from any code path or a cron.
CREATE OR REPLACE FUNCTION public.cleanup_watchlist_mute_tokens()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  removed integer;
BEGIN
  DELETE FROM public.watchlist_mute_tokens
   WHERE expires_at < now()
      OR (used_at IS NOT NULL AND used_at < now() - interval '7 days');
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;