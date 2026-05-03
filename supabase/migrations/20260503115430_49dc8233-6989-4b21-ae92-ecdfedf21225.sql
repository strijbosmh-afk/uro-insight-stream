-- Backfill tweet_count and last_seen_at from existing tweets
UPDATE public.sources s
SET
  tweet_count = COALESCE(t.cnt, 0),
  last_seen_at = t.last_at
FROM (
  SELECT source_id, COUNT(*)::int AS cnt, MAX(created_at) AS last_at
  FROM public.tweets
  WHERE source_id IS NOT NULL
  GROUP BY source_id
) t
WHERE s.id = t.source_id;

-- Trigger function: keep sources.tweet_count and last_seen_at in sync.
CREATE OR REPLACE FUNCTION public.sync_source_tweet_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.source_id IS NOT NULL THEN
      UPDATE public.sources
      SET tweet_count = tweet_count + 1,
          last_seen_at = GREATEST(COALESCE(last_seen_at, NEW.created_at), NEW.created_at)
      WHERE id = NEW.source_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.source_id IS NOT NULL THEN
      UPDATE public.sources s
      SET tweet_count = GREATEST(tweet_count - 1, 0),
          last_seen_at = (SELECT MAX(created_at) FROM public.tweets WHERE source_id = OLD.source_id)
      WHERE s.id = OLD.source_id;
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.source_id IS DISTINCT FROM OLD.source_id THEN
      IF OLD.source_id IS NOT NULL THEN
        UPDATE public.sources s
        SET tweet_count = GREATEST(tweet_count - 1, 0),
            last_seen_at = (SELECT MAX(created_at) FROM public.tweets WHERE source_id = OLD.source_id)
        WHERE s.id = OLD.source_id;
      END IF;
      IF NEW.source_id IS NOT NULL THEN
        UPDATE public.sources
        SET tweet_count = tweet_count + 1,
            last_seen_at = GREATEST(COALESCE(last_seen_at, NEW.created_at), NEW.created_at)
        WHERE id = NEW.source_id;
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_source_tweet_stats ON public.tweets;
CREATE TRIGGER trg_sync_source_tweet_stats
AFTER INSERT OR UPDATE OR DELETE ON public.tweets
FOR EACH ROW EXECUTE FUNCTION public.sync_source_tweet_stats();