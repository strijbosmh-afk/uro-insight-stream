
-- ============================================================================
-- 1. Extend source_group_members with provenance
-- ============================================================================
ALTER TABLE public.source_group_members
  ADD COLUMN IF NOT EXISTS added_via text NOT NULL DEFAULT 'admin'
    CHECK (added_via IN ('admin','bootstrap','rule','llm','co_subscription')),
  ADD COLUMN IF NOT EXISTS added_evidence jsonb NULL;

CREATE INDEX IF NOT EXISTS idx_sgm_added_via_group
  ON public.source_group_members (added_via, group_id);

-- ============================================================================
-- 2. cancer_area_signals — per-area dictionary for the rules engine
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.cancer_area_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cancer_area_id uuid NOT NULL REFERENCES public.cancer_areas(id) ON DELETE CASCADE,
  signal_type text NOT NULL CHECK (signal_type IN ('bio_keyword','hashtag')),
  value text NOT NULL,
  weight numeric NOT NULL DEFAULT 1.0,
  is_active boolean NOT NULL DEFAULT true,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cancer_area_signals_value
  ON public.cancer_area_signals (cancer_area_id, signal_type, lower(value));

CREATE INDEX IF NOT EXISTS idx_cancer_area_signals_active
  ON public.cancer_area_signals (cancer_area_id, is_active);

ALTER TABLE public.cancer_area_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cas_read_auth ON public.cancer_area_signals;
CREATE POLICY cas_read_auth ON public.cancer_area_signals
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS cas_admin_write ON public.cancer_area_signals;
CREATE POLICY cas_admin_write ON public.cancer_area_signals
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

DROP TRIGGER IF EXISTS trg_cas_touch ON public.cancer_area_signals;
CREATE TRIGGER trg_cas_touch
  BEFORE UPDATE ON public.cancer_area_signals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================================
-- 3. source_group_member_candidates — admin review queue
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.source_group_member_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.source_groups(id) ON DELETE CASCADE,
  source_id text NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  score numeric NOT NULL DEFAULT 0,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected')),
  nominated_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid NULL,
  reviewed_at timestamptz NULL,
  review_notes text NULL,
  UNIQUE (group_id, source_id)
);

CREATE INDEX IF NOT EXISTS idx_sgmc_status_score
  ON public.source_group_member_candidates (status, score DESC);
CREATE INDEX IF NOT EXISTS idx_sgmc_group_status
  ON public.source_group_member_candidates (group_id, status);

ALTER TABLE public.source_group_member_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sgmc_read ON public.source_group_member_candidates;
CREATE POLICY sgmc_read ON public.source_group_member_candidates
  FOR SELECT TO authenticated
  USING (
    is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.source_groups g
       WHERE g.id = source_group_member_candidates.group_id
         AND g.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS sgmc_update ON public.source_group_member_candidates;
CREATE POLICY sgmc_update ON public.source_group_member_candidates
  FOR UPDATE TO authenticated
  USING (
    is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.source_groups g
       WHERE g.id = source_group_member_candidates.group_id
         AND g.created_by = auth.uid()
    )
  )
  WITH CHECK (
    is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.source_groups g
       WHERE g.id = source_group_member_candidates.group_id
         AND g.created_by = auth.uid()
    )
  );
-- INSERT/DELETE intentionally not granted: only the cron (service role) writes.

-- ============================================================================
-- 4. Seed cancer_area_signals for all 11 cancer areas
-- ============================================================================
WITH areas AS (
  SELECT id, slug FROM public.cancer_areas
),
seed(slug, signal_type, value) AS (
  VALUES
  -- Urological
  ('urological','bio_keyword','prostate cancer'),
  ('urological','bio_keyword','bladder cancer'),
  ('urological','bio_keyword','kidney cancer'),
  ('urological','bio_keyword','urologic oncology'),
  ('urological','bio_keyword','GU oncology'),
  ('urological','bio_keyword','urology'),
  ('urological','hashtag','prostatecancer'),
  ('urological','hashtag','bladdercancer'),
  ('urological','hashtag','kidneycancer'),
  ('urological','hashtag','gucancer'),
  -- Breast
  ('breast','bio_keyword','breast cancer'),
  ('breast','bio_keyword','breast oncology'),
  ('breast','bio_keyword','BCSM'),
  ('breast','bio_keyword','HER2'),
  ('breast','bio_keyword','triple negative'),
  ('breast','bio_keyword','mammography'),
  ('breast','hashtag','bcsm'),
  ('breast','hashtag','breastcancer'),
  ('breast','hashtag','her2'),
  ('breast','hashtag','tnbc'),
  -- GI
  ('gi','bio_keyword','colorectal cancer'),
  ('gi','bio_keyword','pancreatic cancer'),
  ('gi','bio_keyword','hepatobiliary'),
  ('gi','bio_keyword','gastric cancer'),
  ('gi','bio_keyword','GI oncology'),
  ('gi','bio_keyword','esophageal cancer'),
  ('gi','hashtag','crcsm'),
  ('gi','hashtag','gicancer'),
  ('gi','hashtag','pancsm'),
  ('gi','hashtag','colorectalcancer'),
  -- Lung
  ('lung','bio_keyword','lung cancer'),
  ('lung','bio_keyword','thoracic oncology'),
  ('lung','bio_keyword','NSCLC'),
  ('lung','bio_keyword','SCLC'),
  ('lung','bio_keyword','mesothelioma'),
  ('lung','bio_keyword','pulmonology'),
  ('lung','hashtag','lcsm'),
  ('lung','hashtag','lungcancer'),
  ('lung','hashtag','nsclc'),
  ('lung','hashtag','sclc'),
  -- Gynecological
  ('gynecological','bio_keyword','gynecologic oncology'),
  ('gynecological','bio_keyword','ovarian cancer'),
  ('gynecological','bio_keyword','cervical cancer'),
  ('gynecological','bio_keyword','endometrial cancer'),
  ('gynecological','bio_keyword','uterine cancer'),
  ('gynecological','bio_keyword','gyn onc'),
  ('gynecological','hashtag','gyncsm'),
  ('gynecological','hashtag','ovariancancer'),
  ('gynecological','hashtag','cervicalcancer'),
  ('gynecological','hashtag','endometrialcancer'),
  -- Hematological
  ('hematological','bio_keyword','hematology'),
  ('hematological','bio_keyword','leukemia'),
  ('hematological','bio_keyword','lymphoma'),
  ('hematological','bio_keyword','myeloma'),
  ('hematological','bio_keyword','MDS'),
  ('hematological','bio_keyword','CAR-T'),
  ('hematological','hashtag','leusm'),
  ('hematological','hashtag','lymsm'),
  ('hematological','hashtag','mmsm'),
  ('hematological','hashtag','hemonc'),
  -- Head & neck
  ('head_neck','bio_keyword','head and neck cancer'),
  ('head_neck','bio_keyword','head & neck'),
  ('head_neck','bio_keyword','HNSCC'),
  ('head_neck','bio_keyword','oropharyngeal'),
  ('head_neck','bio_keyword','laryngeal cancer'),
  ('head_neck','bio_keyword','otolaryngology'),
  ('head_neck','hashtag','hncsm'),
  ('head_neck','hashtag','hnscc'),
  ('head_neck','hashtag','headandneckcancer'),
  ('head_neck','hashtag','otolaryngology'),
  -- Skin / melanoma
  ('skin','bio_keyword','melanoma'),
  ('skin','bio_keyword','skin cancer'),
  ('skin','bio_keyword','dermatologic oncology'),
  ('skin','bio_keyword','cutaneous oncology'),
  ('skin','bio_keyword','dermatology'),
  ('skin','bio_keyword','BCC'),
  ('skin','hashtag','melanoma'),
  ('skin','hashtag','skincancer'),
  ('skin','hashtag','dermtwitter'),
  ('skin','hashtag','melanomasm'),
  -- Neuro-oncology
  ('neuro','bio_keyword','neuro-oncology'),
  ('neuro','bio_keyword','neuro oncology'),
  ('neuro','bio_keyword','glioblastoma'),
  ('neuro','bio_keyword','glioma'),
  ('neuro','bio_keyword','brain tumor'),
  ('neuro','bio_keyword','brain cancer'),
  ('neuro','hashtag','btsm'),
  ('neuro','hashtag','neurooncology'),
  ('neuro','hashtag','glioblastoma'),
  ('neuro','hashtag','braincancer'),
  -- Sarcoma
  ('sarcoma','bio_keyword','sarcoma'),
  ('sarcoma','bio_keyword','soft tissue sarcoma'),
  ('sarcoma','bio_keyword','osteosarcoma'),
  ('sarcoma','bio_keyword','GIST'),
  ('sarcoma','bio_keyword','Ewing'),
  ('sarcoma','bio_keyword','musculoskeletal oncology'),
  ('sarcoma','hashtag','sarcoma'),
  ('sarcoma','hashtag','sarcomasm'),
  ('sarcoma','hashtag','gist'),
  ('sarcoma','hashtag','osteosarcoma'),
  -- Pediatric
  ('pediatric','bio_keyword','pediatric oncology'),
  ('pediatric','bio_keyword','childhood cancer'),
  ('pediatric','bio_keyword','pediatric hematology'),
  ('pediatric','bio_keyword','neuroblastoma'),
  ('pediatric','bio_keyword','rhabdomyosarcoma'),
  ('pediatric','bio_keyword','pediatric cancer'),
  ('pediatric','hashtag','pedsonc'),
  ('pediatric','hashtag','pedcsm'),
  ('pediatric','hashtag','childhoodcancer'),
  ('pediatric','hashtag','neuroblastoma')
)
INSERT INTO public.cancer_area_signals (cancer_area_id, signal_type, value, weight, is_active)
SELECT a.id, s.signal_type, s.value, 1.0, true
FROM seed s
JOIN areas a ON a.slug = s.slug
ON CONFLICT (cancer_area_id, signal_type, lower(value)) DO NOTHING;

-- ============================================================================
-- 5. Bootstrap urology curated → cancer-area KOL groups
--    (no-op today since recommended_sources_by_specialty is empty, but the
--     one-shot CTE is in place for whenever curation is added.)
-- ============================================================================
WITH mapping(specialty_id, group_slug) AS (VALUES
  ('onco_prostate', 'prostate-cancer-kols'),
  ('onco_bladder',  'bladder-cancer-kols'),
  ('onco_kidney',   'kidney-cancer-kols')
),
src AS (
  SELECT rsbs.source_id, m.group_slug
  FROM public.recommended_sources_by_specialty rsbs
  JOIN mapping m ON m.specialty_id = rsbs.specialty_id
)
INSERT INTO public.source_group_members (group_id, source_id, added_by, added_via, added_evidence)
SELECT sg.id, src.source_id, NULL, 'bootstrap',
       jsonb_build_object('source','recommended_sources_by_specialty')
FROM src
JOIN public.source_groups sg ON sg.slug = src.group_slug
ON CONFLICT (group_id, source_id) DO NOTHING;
