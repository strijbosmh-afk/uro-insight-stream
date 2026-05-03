-- Shared pool of candidate handles to suggest as sources
CREATE TABLE public.source_candidates (
  handle text PRIMARY KEY,
  display_name text,
  avatar_url text,
  verified boolean NOT NULL DEFAULT false,
  followers_count integer,
  bio text,
  external_user_id text,
  enrichment_status text NOT NULL DEFAULT 'pending', -- pending | enriched | failed | not_found
  enrichment_attempted_at timestamptz,
  enrichment_error text,
  -- Activity signals (refreshed by aggregator)
  mention_count integer NOT NULL DEFAULT 0,
  reply_count integer NOT NULL DEFAULT 0,
  total_signal integer NOT NULL DEFAULT 0,
  last_seen_at timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_source_candidates_signal ON public.source_candidates (total_signal DESC);
CREATE INDEX idx_source_candidates_enrichment ON public.source_candidates (enrichment_status, enrichment_attempted_at);

ALTER TABLE public.source_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read source candidates"
  ON public.source_candidates FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage source candidates"
  ON public.source_candidates FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER touch_source_candidates_updated_at
  BEFORE UPDATE ON public.source_candidates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Per-user dismissals: hide a candidate from suggestions
CREATE TABLE public.source_candidate_dismissals (
  user_id uuid NOT NULL,
  handle text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, handle)
);

ALTER TABLE public.source_candidate_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own dismissals"
  ON public.source_candidate_dismissals FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own dismissals"
  ON public.source_candidate_dismissals FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own dismissals"
  ON public.source_candidate_dismissals FOR DELETE TO authenticated
  USING (auth.uid() = user_id);