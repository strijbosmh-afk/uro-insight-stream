
-- Advisory lock helpers for the tweet matcher (separate key from ingest)
CREATE OR REPLACE FUNCTION public.try_tweet_matcher_lock()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ SELECT pg_try_advisory_lock(8421772); $$;

CREATE OR REPLACE FUNCTION public.release_tweet_matcher_lock()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ SELECT pg_advisory_unlock(8421772); $$;

-- Trigger: when a session is inserted or has its hashtag/window updated, mark
-- unmatched tweets in the congress's recent 7-day window for re-classification.
CREATE OR REPLACE FUNCTION public.requeue_session_classification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Reset classification flag so the matcher reconsiders these tweets.
  -- Only touch tweets without a session_id; never re-process matched tweets.
  UPDATE public.tweets t
     SET classification_attempted_at = NULL
   WHERE t.session_id IS NULL
     AND t.created_at >= now() - interval '7 days'
     AND (
       NEW.session_hashtag IS NOT NULL
       OR EXISTS (
         SELECT 1 FROM public.congresses c
          WHERE c.id = NEW.congress_id
            AND array_length(c.primary_hashtags, 1) > 0
       )
     );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_requeue_session_classification ON public.sessions;
CREATE TRIGGER trg_requeue_session_classification
AFTER INSERT OR UPDATE OF session_hashtag, start_time, end_time, congress_id
ON public.sessions
FOR EACH ROW EXECUTE FUNCTION public.requeue_session_classification();

-- Schedule the matcher endpoint every 5 minutes
DO $$
DECLARE
  v_secret text;
BEGIN
  -- unschedule existing job if present (idempotent)
  PERFORM cron.unschedule('match-tweets-to-sessions');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'match-tweets-to-sessions',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--b4982a9a-484b-4e14-9df5-1bcc313546ed.lovable.app/api/public/hooks/match-tweets-to-sessions',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_cron_job_secret()
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $cron$
);
