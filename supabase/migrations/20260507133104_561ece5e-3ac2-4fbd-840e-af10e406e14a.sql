-- Phase 3d: rate-limit access_requests submissions
-- 1) Remove the always-true INSERT policy (replaced by server-side gate)
DROP POLICY IF EXISTS "Anyone can submit an access request" ON public.access_requests;

-- 2) Revoke direct INSERT from anon (server uses service role)
REVOKE INSERT ON public.access_requests FROM anon;
REVOKE INSERT ON public.access_requests FROM authenticated;

-- 3) Rate-limit state table (fixed hourly bucket; service-role only)
CREATE TABLE public.rate_limit_access_requests (
  ip_hash TEXT NOT NULL,
  bucket_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ip_hash, bucket_start)
);

CREATE INDEX idx_rate_limit_access_requests_bucket
  ON public.rate_limit_access_requests(bucket_start);

ALTER TABLE public.rate_limit_access_requests ENABLE ROW LEVEL SECURITY;
-- No policies: service role bypasses RLS; all other roles get no access.

COMMENT ON TABLE public.rate_limit_access_requests IS
  'Fixed hourly bucket counters for /api/public/access-request rate limiting. Service-role only.';