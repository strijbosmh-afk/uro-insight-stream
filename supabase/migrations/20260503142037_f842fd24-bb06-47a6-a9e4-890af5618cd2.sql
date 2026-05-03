-- Backfill: strip '#' and lowercase
UPDATE public.congresses
SET primary_hashtags = ARRAY(
  SELECT regexp_replace(lower(h), '^#', '', 'g')
  FROM unnest(primary_hashtags) AS h
)
WHERE EXISTS (
  SELECT 1 FROM unnest(primary_hashtags) AS h
  WHERE h LIKE '#%' OR h <> lower(h)
);

UPDATE public.hashtags
SET tag = regexp_replace(lower(tag), '^#', '', 'g')
WHERE tag LIKE '#%' OR tag <> lower(tag);

-- Normalization triggers
CREATE OR REPLACE FUNCTION public.normalize_congress_hashtags()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.primary_hashtags IS NOT NULL THEN
    NEW.primary_hashtags := ARRAY(
      SELECT regexp_replace(lower(h), '^#', '', 'g')
      FROM unnest(NEW.primary_hashtags) AS h
      WHERE h IS NOT NULL AND length(trim(h)) > 0
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_congress_hashtags ON public.congresses;
CREATE TRIGGER trg_normalize_congress_hashtags
BEFORE INSERT OR UPDATE OF primary_hashtags ON public.congresses
FOR EACH ROW EXECUTE FUNCTION public.normalize_congress_hashtags();

CREATE OR REPLACE FUNCTION public.normalize_hashtag_tag()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.tag IS NOT NULL THEN
    NEW.tag := regexp_replace(lower(NEW.tag), '^#', '', 'g');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_hashtag_tag ON public.hashtags;
CREATE TRIGGER trg_normalize_hashtag_tag
BEFORE INSERT OR UPDATE OF tag ON public.hashtags
FOR EACH ROW EXECUTE FUNCTION public.normalize_hashtag_tag();

-- Reset classification_attempted_at for any unmatched APCCC26 tweets so the
-- matcher reconsiders them with the corrected hashtag + new congress_id rule.
UPDATE public.tweets
SET classification_attempted_at = NULL
WHERE session_id IS NULL
  AND created_at > now() - interval '30 days'
  AND EXISTS (
    SELECT 1 FROM unnest(hashtags) h
    WHERE lower(h) IN ('apccc26','apccc')
  );