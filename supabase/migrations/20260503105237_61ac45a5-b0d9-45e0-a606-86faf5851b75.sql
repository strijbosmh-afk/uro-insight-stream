CREATE OR REPLACE FUNCTION public.get_ingestion_cron_health()
RETURNS TABLE (
  jobname text,
  schedule text,
  expected_interval_seconds integer,
  last_success_at timestamptz,
  age_seconds integer,
  is_stale boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, cron, net
AS $$
  WITH targets AS (
    SELECT * FROM (VALUES
      ('process-ingest-queue-every-minute'::text, 60::integer, '%"ok":true%'::text, '%"processed"%'::text),
      ('tweet-ingest-every-10min'::text, 600::integer, '%"ok":true%'::text, '%"adapter"%'::text),
      ('summarize-job-every-10min'::text, 600::integer, '%"ok":true%'::text, '%"summaries"%'::text),
      ('match-tweets-to-sessions'::text, 300::integer, '%"ok":true%'::text, '%"considered"%'::text)
    ) AS t(jobname, expected_interval_seconds, ok_pattern, body_pattern)
  )
  SELECT
    j.jobname::text,
    j.schedule::text,
    t.expected_interval_seconds,
    latest.created AS last_success_at,
    CASE
      WHEN latest.created IS NULL THEN NULL
      ELSE floor(extract(epoch FROM (now() - latest.created)))::integer
    END AS age_seconds,
    latest.created IS NULL
      OR latest.created < now() - make_interval(secs => t.expected_interval_seconds * 2) AS is_stale
  FROM targets t
  JOIN cron.job j ON j.jobname = t.jobname
  LEFT JOIN LATERAL (
    SELECT r.created
    FROM net._http_response r
    WHERE r.status_code BETWEEN 200 AND 299
      AND r.content::text ILIKE t.ok_pattern
      AND r.content::text ILIKE t.body_pattern
    ORDER BY r.created DESC
    LIMIT 1
  ) latest ON true
  ORDER BY j.jobname;
$$;

REVOKE ALL ON FUNCTION public.get_ingestion_cron_health() FROM PUBLIC, anon, authenticated;