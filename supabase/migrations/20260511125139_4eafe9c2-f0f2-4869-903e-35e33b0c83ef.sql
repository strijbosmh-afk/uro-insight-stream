
ALTER TABLE public.user_x_credentials
  ADD COLUMN IF NOT EXISTS follows_imported_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS follows_count_at_import int NULL;

CREATE TABLE IF NOT EXISTS public.user_x_follows_cache (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  follows jsonb NOT NULL,
  total_count int NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days'
);

ALTER TABLE public.user_x_follows_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own follows cache"
  ON public.user_x_follows_cache
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own follows cache"
  ON public.user_x_follows_cache
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
