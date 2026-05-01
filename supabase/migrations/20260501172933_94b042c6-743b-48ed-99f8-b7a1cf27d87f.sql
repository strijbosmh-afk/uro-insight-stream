-- Helper function: read the cron auth secret from Vault.
-- Returns NULL if vault has no row named 'X_JOB_SECRET' yet (jobs will 401 until configured).
CREATE OR REPLACE FUNCTION public.get_cron_job_secret()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'X_JOB_SECRET' LIMIT 1
$$;

-- Schedule tweet-ingest every 10 minutes
SELECT cron.schedule(
  'tweet-ingest-every-10min',
  '*/10 * * * *',
  $cron$
    SELECT net.http_post(
      url:='https://project--b4982a9a-484b-4e14-9df5-1bcc313546ed.lovable.app/api/public/hooks/tweet-ingest',
      headers:=jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(public.get_cron_job_secret(), '')
      ),
      body:='{}'::jsonb
    );
  $cron$
);

-- Schedule summarize-job every 10 minutes
SELECT cron.schedule(
  'summarize-job-every-10min',
  '*/10 * * * *',
  $cron$
    SELECT net.http_post(
      url:='https://project--b4982a9a-484b-4e14-9df5-1bcc313546ed.lovable.app/api/public/hooks/summarize-job',
      headers:=jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(public.get_cron_job_secret(), '')
      ),
      body:='{}'::jsonb
    );
  $cron$
);