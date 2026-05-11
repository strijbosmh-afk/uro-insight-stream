CREATE TABLE public.source_themes (
  source_id text PRIMARY KEY REFERENCES public.sources(id) ON DELETE CASCADE,
  themes jsonb NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  model text NOT NULL
);

ALTER TABLE public.source_themes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read source themes"
  ON public.source_themes
  FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies: writes only via service role (supabaseAdmin).
CREATE INDEX idx_source_themes_expires_at ON public.source_themes(expires_at);