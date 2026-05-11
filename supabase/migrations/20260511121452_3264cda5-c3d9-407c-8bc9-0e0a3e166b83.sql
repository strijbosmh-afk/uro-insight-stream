CREATE TABLE public.source_briefings (
  source_id text NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  briefing jsonb NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  model text NOT NULL,
  PRIMARY KEY (source_id, week_start)
);

ALTER TABLE public.source_briefings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read source briefings"
  ON public.source_briefings
  FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies: writes only via service role (supabaseAdmin).
CREATE INDEX idx_source_briefings_expires_at ON public.source_briefings(expires_at);