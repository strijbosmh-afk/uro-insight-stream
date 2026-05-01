REVOKE EXECUTE ON FUNCTION public.get_cron_job_secret() FROM PUBLIC, anon, authenticated;
-- Postgres role (which pg_cron runs as) retains EXECUTE by default as the owner.