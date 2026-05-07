-- Phase 1: Tighten SELECT policies on operational/admin tables to admins only.
-- Previous policies used USING (true) which exposed these tables to every authenticated user.

-- audit_log
DROP POLICY IF EXISTS "Authenticated users can read audit log" ON public.audit_log;
CREATE POLICY "Admins can read audit log"
  ON public.audit_log FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- ingest_queue
DROP POLICY IF EXISTS "Authenticated can read ingest queue" ON public.ingest_queue;
CREATE POLICY "Admins can read ingest queue"
  ON public.ingest_queue FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- ingestion_runs
DROP POLICY IF EXISTS "Authenticated can read ingestion runs" ON public.ingestion_runs;
CREATE POLICY "Admins can read ingestion runs"
  ON public.ingestion_runs FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- ingest_queue_run_log
DROP POLICY IF EXISTS "Authenticated read run log" ON public.ingest_queue_run_log;
CREATE POLICY "Admins read ingest queue run log"
  ON public.ingest_queue_run_log FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- tweet_match_run_log
DROP POLICY IF EXISTS "Authenticated read tweet match run log" ON public.tweet_match_run_log;
DROP POLICY IF EXISTS "Authenticated can read tweet match run log" ON public.tweet_match_run_log;
CREATE POLICY "Admins read tweet match run log"
  ON public.tweet_match_run_log FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- rate_limit_global_lookups
DROP POLICY IF EXISTS "Authenticated read global lookup usage" ON public.rate_limit_global_lookups;
CREATE POLICY "Admins read global lookup usage"
  ON public.rate_limit_global_lookups FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));