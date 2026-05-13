
-- B1: Drop the SELECT policy that would expose encrypted X credentials to clients.
-- Clients must read via the user_x_connection_status view (which does not expose
-- the encrypted columns or raw consumer/access keys).
DROP POLICY IF EXISTS "Users can view own x credentials" ON public.user_x_credentials;

-- B5: Add key_id for AES-GCM key rotation. Default 1 = current X_CREDENTIALS_KEY.
ALTER TABLE public.user_x_credentials
  ADD COLUMN IF NOT EXISTS key_id smallint NOT NULL DEFAULT 1;

-- B12: Track non-classification expensive LLM calls (themes / briefings / reply drafts)
-- so we can cap cache-miss generation per user per day.
ALTER TABLE public.user_llm_quota
  ADD COLUMN IF NOT EXISTS expensive_calls integer NOT NULL DEFAULT 0;

-- B2: Repoint production crons that are still pointing at the *-dev host.
DO $$
DECLARE
  jobs text[] := ARRAY[
    'aggregate-source-candidates-every-30min',
    'match-tweets-to-sessions',
    'process-ingest-queue-every-minute',
    'send-digests-every-15min',
    'summarize-job-every-10min'
  ];
  j text;
BEGIN
  FOREACH j IN ARRAY jobs LOOP
    BEGIN
      PERFORM cron.unschedule(j);
    EXCEPTION WHEN OTHERS THEN
      -- ignore if not scheduled
      NULL;
    END;
  END LOOP;
END$$;

SELECT cron.schedule(
  'aggregate-source-candidates-every-30min',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--b4982a9a-484b-4e14-9df5-1bcc313546ed.lovable.app/api/public/hooks/aggregate-source-candidates?days=30&enrich=50',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || public.get_cron_job_secret()),
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'match-tweets-to-sessions',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--b4982a9a-484b-4e14-9df5-1bcc313546ed.lovable.app/api/public/hooks/match-tweets-to-sessions',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || public.get_cron_job_secret()),
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'process-ingest-queue-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--b4982a9a-484b-4e14-9df5-1bcc313546ed.lovable.app/api/public/hooks/process-ingest-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_cron_job_secret()
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'send-digests-every-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--b4982a9a-484b-4e14-9df5-1bcc313546ed.lovable.app/api/public/hooks/send-digests',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_cron_job_secret()
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'summarize-job-every-10min',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--b4982a9a-484b-4e14-9df5-1bcc313546ed.lovable.app/api/public/hooks/summarize-job',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || public.get_cron_job_secret()),
    body := '{}'::jsonb
  );
  $$
);
