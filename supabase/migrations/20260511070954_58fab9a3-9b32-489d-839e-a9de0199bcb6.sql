ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pending_x_connection boolean NOT NULL DEFAULT false;