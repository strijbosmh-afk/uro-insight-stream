DO $$
BEGIN
  PERFORM cron.unschedule('watchlist-flush-deltas');
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

SELECT cron.schedule(
  'watchlist-flush-deltas',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--b4982a9a-484b-4e14-9df5-1bcc313546ed.lovable.app/api/public/hooks/watchlist-flush',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.get_cron_job_secret()
    ),
    body := '{}'::jsonb
  );
  $$
);