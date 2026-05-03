DO $$
BEGIN
  PERFORM cron.unschedule('process-ingest-queue-every-minute');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'process-ingest-queue-every-minute',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--b4982a9a-484b-4e14-9df5-1bcc313546ed-dev.lovable.app/api/public/hooks/process-ingest-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_cron_job_secret()
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $cron$
);