-- Phase 1.5: Linter quick-wins (search_path + intent comments).

-- 1) Pin search_path on email queue helpers.
ALTER FUNCTION public.enqueue_email(queue_name text, payload jsonb)
  SET search_path = public, pgmq;
ALTER FUNCTION public.delete_email(queue_name text, message_id bigint)
  SET search_path = public, pgmq;
ALTER FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
  SET search_path = public, pgmq;
ALTER FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
  SET search_path = public, pgmq;

-- 2) Document intentionally-open INSERT policy on access_requests.
COMMENT ON POLICY "Anyone can submit an access request" ON public.access_requests IS
  'Intentional: powers the unauthenticated public access-request form. '
  'Abuse is mitigated by server-side validation and per-IP rate limiting (see Phase 3d).';

-- 3) Document service-role-only intent for user_x_credentials.
COMMENT ON TABLE public.user_x_credentials IS
  'Stores encrypted X/Twitter OAuth credentials. Intentionally has RLS enabled with no '
  'policies so only service_role (server code via supabaseAdmin) can read or write. '
  'Access is funneled through src/server/x-credentials.server.ts.';