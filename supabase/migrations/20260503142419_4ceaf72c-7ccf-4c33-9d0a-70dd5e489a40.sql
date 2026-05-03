ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS entities text[] NOT NULL DEFAULT '{}'::text[];