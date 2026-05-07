-- Allow multiple X accounts per user with one active at a time
ALTER TABLE public.user_x_credentials DROP CONSTRAINT user_x_credentials_pkey;

ALTER TABLE public.user_x_credentials
  ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN is_active boolean NOT NULL DEFAULT true;

ALTER TABLE public.user_x_credentials ADD PRIMARY KEY (id);

-- One row per (user, x account)
CREATE UNIQUE INDEX user_x_credentials_user_x_user_id_unique
  ON public.user_x_credentials (user_id, x_user_id)
  WHERE x_user_id IS NOT NULL;

-- At most one active, non-revoked account per user
CREATE UNIQUE INDEX user_x_credentials_one_active_per_user
  ON public.user_x_credentials (user_id)
  WHERE is_active = true AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS user_x_credentials_user_idx
  ON public.user_x_credentials (user_id);
