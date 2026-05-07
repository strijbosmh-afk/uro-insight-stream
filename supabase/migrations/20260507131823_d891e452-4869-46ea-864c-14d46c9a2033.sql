-- Phase 3b: Revoke anon/PUBLIC EXECUTE on email queue helpers.
-- These SECURITY DEFINER functions wrap pgmq and should only be invoked
-- server-side (service role). Service role bypasses GRANT checks, so
-- revoking from anon/authenticated/PUBLIC is safe.

REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM anon, authenticated, PUBLIC;

-- Phase 3c: Restrict get_active_user_count to service role only.
-- Frontend will call via a server fn that asserts admin first.
REVOKE EXECUTE ON FUNCTION public.get_active_user_count() FROM anon, authenticated, PUBLIC;

-- Verification (results visible in migration logs):
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.proname,
           array_agg(DISTINCT a.rolname ORDER BY a.rolname) AS grantees
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    LEFT JOIN LATERAL aclexplode(p.proacl) ac ON true
    LEFT JOIN pg_authid a ON a.oid = ac.grantee
    WHERE n.nspname = 'public'
      AND p.proname IN ('enqueue_email','delete_email','move_to_dlq','read_email_batch','get_active_user_count')
    GROUP BY p.proname
  LOOP
    RAISE NOTICE 'fn=% grantees=%', r.proname, r.grantees;
  END LOOP;
END $$;
