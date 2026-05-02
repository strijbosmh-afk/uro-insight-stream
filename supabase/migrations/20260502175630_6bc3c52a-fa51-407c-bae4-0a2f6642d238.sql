CREATE OR REPLACE FUNCTION public.try_ingest_queue_lock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_try_advisory_lock(8421771);
$$;

CREATE OR REPLACE FUNCTION public.release_ingest_queue_lock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_advisory_unlock(8421771);
$$;

REVOKE ALL ON FUNCTION public.try_ingest_queue_lock() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_ingest_queue_lock() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_ingest_queue_lock() TO service_role;
GRANT EXECUTE ON FUNCTION public.release_ingest_queue_lock() TO service_role;