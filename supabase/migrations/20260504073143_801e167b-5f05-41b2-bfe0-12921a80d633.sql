DO $$
BEGIN
  PERFORM cron.unschedule('send-digests-every-15min');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'send-digests-every-15min',
  '*/15 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--b4982a9a-484b-4e14-9df5-1bcc313546ed-dev.lovable.app/api/public/hooks/send-digests',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_cron_job_secret()
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $cron$
);