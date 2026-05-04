
-- Extend congresses
ALTER TABLE public.congresses
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS community_hashtags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- congress_cancer_areas junction
CREATE TABLE IF NOT EXISTS public.congress_cancer_areas (
  congress_id text NOT NULL REFERENCES public.congresses(id) ON DELETE CASCADE,
  cancer_area_id uuid NOT NULL REFERENCES public.cancer_areas(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (congress_id, cancer_area_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS congress_cancer_areas_one_primary
  ON public.congress_cancer_areas(congress_id) WHERE is_primary;
CREATE INDEX IF NOT EXISTS congress_cancer_areas_area_idx
  ON public.congress_cancer_areas(cancer_area_id);

ALTER TABLE public.congress_cancer_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cca_read_auth" ON public.congress_cancer_areas
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "cca_write_editor_admin" ON public.congress_cancer_areas
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'editor'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'editor'::app_role));

-- congress_featured_sources junction
CREATE TABLE IF NOT EXISTS public.congress_featured_sources (
  congress_id text NOT NULL REFERENCES public.congresses(id) ON DELETE CASCADE,
  source_id text NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  role text,
  display_order integer NOT NULL DEFAULT 0,
  added_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (congress_id, source_id)
);
CREATE INDEX IF NOT EXISTS congress_featured_sources_congress_idx
  ON public.congress_featured_sources(congress_id, display_order);

ALTER TABLE public.congress_featured_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cfs_read_auth" ON public.congress_featured_sources
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "cfs_write_editor_admin" ON public.congress_featured_sources
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'editor'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'editor'::app_role));

-- Lookup cache
CREATE TABLE IF NOT EXISTS public.congress_lookup_cache (
  query_hash text PRIMARY KEY,
  query_raw text NOT NULL,
  result jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);
CREATE INDEX IF NOT EXISTS congress_lookup_cache_expires_idx
  ON public.congress_lookup_cache(expires_at);

ALTER TABLE public.congress_lookup_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clc_read_auth" ON public.congress_lookup_cache
  FOR SELECT TO authenticated USING (true);
-- Writes only via service role (server functions / supabaseAdmin)

-- Backfill: tag every existing congress with Urological as primary
INSERT INTO public.congress_cancer_areas (congress_id, cancer_area_id, is_primary)
SELECT c.id, ca.id, true
FROM public.congresses c
CROSS JOIN public.cancer_areas ca
WHERE ca.slug = 'urological'
ON CONFLICT (congress_id, cancer_area_id) DO NOTHING;
