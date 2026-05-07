-- BYOK X (Twitter) credentials & post log

CREATE TABLE public.user_x_credentials (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  auth_mode text NOT NULL DEFAULT 'oauth1_byok' CHECK (auth_mode IN ('oauth1_byok')),
  consumer_key text,
  consumer_secret_encrypted bytea,
  access_token text,
  access_token_secret_encrypted bytea,
  x_user_id text,
  x_username text,
  scope_write boolean NOT NULL DEFAULT false,
  last_verified_at timestamptz,
  last_post_at timestamptz,
  post_count_today int NOT NULL DEFAULT 0,
  post_count_window_start timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_x_credentials ENABLE ROW LEVEL SECURITY;

-- Block ALL client access to the raw table (including reads of encrypted columns).
-- Reads happen via the user_x_connection_status view; writes happen via supabaseAdmin.
-- (No policies = no access for non-service roles.)

CREATE TABLE public.user_x_post_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  posted_tweet_id text,
  in_reply_to_tweet_id text,
  quoted_tweet_id text,
  text text NOT NULL,
  status text NOT NULL CHECK (status IN ('sent','failed','rate_limited')),
  error_code text,
  error_message text,
  posted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX user_x_post_log_user_idx ON public.user_x_post_log(user_id, posted_at DESC);

ALTER TABLE public.user_x_post_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own post log"
  ON public.user_x_post_log FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins read all post logs"
  ON public.user_x_post_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- No INSERT/UPDATE/DELETE policies: only supabaseAdmin (service role) can write.

-- updated_at trigger
CREATE TRIGGER touch_user_x_credentials_updated_at
  BEFORE UPDATE ON public.user_x_credentials
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Safe view: only the columns the client is allowed to see.
CREATE VIEW public.user_x_connection_status
WITH (security_invoker = true)
AS
SELECT
  user_id,
  auth_mode,
  x_user_id,
  x_username,
  scope_write,
  last_verified_at,
  last_post_at,
  post_count_today,
  post_count_window_start,
  revoked_at,
  created_at,
  updated_at
FROM public.user_x_credentials
WHERE user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role);

GRANT SELECT ON public.user_x_connection_status TO authenticated;