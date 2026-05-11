-- Reschedule tweet-ingest-every-10min with an explicit 60s pg_net timeout
-- (default is 5s, which previously timed out on the synchronous variant of
-- the hook and made the dashboard report it as "never").
SELECT cron.unschedule('tweet-ingest-every-10min');

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
      body:='{}'::jsonb,
      timeout_milliseconds:=60000
    );
  $cron$
);