
-- ============================================================================
-- Cancer areas catalog (parallel to urology_specialties; UUID pk; clean break)
-- ============================================================================
CREATE TABLE public.cancer_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  short_description text NULL,
  display_order int NOT NULL DEFAULT 0,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cancer_areas_display_order ON public.cancer_areas (display_order, name);

ALTER TABLE public.cancer_areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cancer_areas_read_auth"
  ON public.cancer_areas FOR SELECT TO authenticated USING (true);
CREATE POLICY "cancer_areas_admin_write"
  ON public.cancer_areas FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER trg_cancer_areas_updated_at
  BEFORE UPDATE ON public.cancer_areas
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seeded cancer areas
INSERT INTO public.cancer_areas (slug, name, short_description, display_order) VALUES
  ('urological',     'Urological cancer',         'Prostate, bladder, kidney, testis & penile cancers.', 10),
  ('breast',         'Breast cancer',             'All breast tumors including HER2+, TNBC, hormone-positive.', 20),
  ('gi',             'GI cancer',                 'Colorectal, gastric, pancreatic, hepatobiliary, esophageal.', 30),
  ('lung',           'Lung cancer',               'NSCLC, SCLC, mesothelioma, thymic.', 40),
  ('gynecological',  'Gynecological cancer',      'Ovarian, endometrial, cervical, vulvar, vaginal.', 50),
  ('hematological',  'Hematological malignancies','Leukemia, lymphoma, myeloma, MDS.', 60),
  ('head_neck',      'Head & neck cancer',        'HNSCC, salivary, thyroid, oropharyngeal.', 70),
  ('skin',           'Melanoma & skin cancer',    'Melanoma, Merkel cell, advanced cutaneous.', 80),
  ('neuro',          'Neuro-oncology',            'Glioma, meningioma, CNS lymphoma, brain mets.', 90),
  ('sarcoma',        'Sarcoma',                   'Soft-tissue and bone sarcomas.', 100),
  ('pediatric',      'Pediatric oncology',        'Childhood solid tumors and hematologic cancers.', 110)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- User cancer-area selections (parallel to user_specialties)
-- ============================================================================
CREATE TABLE public.user_cancer_areas (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cancer_area_id uuid NOT NULL REFERENCES public.cancer_areas(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, cancer_area_id)
);
CREATE UNIQUE INDEX user_cancer_areas_one_primary
  ON public.user_cancer_areas (user_id) WHERE is_primary;

ALTER TABLE public.user_cancer_areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "uca_select_own" ON public.user_cancer_areas
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "uca_insert_own" ON public.user_cancer_areas
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "uca_update_own" ON public.user_cancer_areas
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "uca_delete_own" ON public.user_cancer_areas
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================================================
-- Source groups
-- ============================================================================
CREATE TABLE public.source_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NULL,
  visibility text NOT NULL CHECK (visibility IN ('official','public','private')),
  created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  is_system boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  member_count int NOT NULL DEFAULT 0,
  subscriber_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_source_groups_visibility ON public.source_groups (visibility);
CREATE INDEX idx_source_groups_created_by ON public.source_groups (created_by);

ALTER TABLE public.source_groups ENABLE ROW LEVEL SECURITY;

-- Read: official + public for everyone signed in; private only owner + admin.
CREATE POLICY "groups_read_visible" ON public.source_groups
  FOR SELECT TO authenticated USING (
    visibility IN ('official','public')
    OR created_by = auth.uid()
    OR public.is_admin(auth.uid())
  );

-- Insert: any authenticated user, but cannot self-mark as official.
CREATE POLICY "groups_insert_self" ON public.source_groups
  FOR INSERT TO authenticated WITH CHECK (
    created_by = auth.uid()
    AND (visibility <> 'official' OR public.is_admin(auth.uid()))
  );

-- Update: owner or admin; only admin can flip visibility to official.
CREATE POLICY "groups_update_owner_or_admin" ON public.source_groups
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin(auth.uid()))
  WITH CHECK (
    (created_by = auth.uid() OR public.is_admin(auth.uid()))
    AND (visibility <> 'official' OR public.is_admin(auth.uid()))
  );

-- Delete: owner or admin.
CREATE POLICY "groups_delete_owner_or_admin" ON public.source_groups
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin(auth.uid()));

CREATE TRIGGER trg_source_groups_updated_at
  BEFORE UPDATE ON public.source_groups
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Group ↔ cancer areas
CREATE TABLE public.source_group_cancer_areas (
  group_id uuid NOT NULL REFERENCES public.source_groups(id) ON DELETE CASCADE,
  cancer_area_id uuid NOT NULL REFERENCES public.cancer_areas(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, cancer_area_id)
);
CREATE INDEX idx_sgca_area ON public.source_group_cancer_areas (cancer_area_id);

ALTER TABLE public.source_group_cancer_areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sgca_read_inherits" ON public.source_group_cancer_areas
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.source_groups g
      WHERE g.id = group_id
        AND (g.visibility IN ('official','public')
             OR g.created_by = auth.uid()
             OR public.is_admin(auth.uid()))
    )
  );
CREATE POLICY "sgca_write_owner_or_admin" ON public.source_group_cancer_areas
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.source_groups g
            WHERE g.id = group_id
              AND (g.created_by = auth.uid() OR public.is_admin(auth.uid())))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.source_groups g
            WHERE g.id = group_id
              AND (g.created_by = auth.uid() OR public.is_admin(auth.uid())))
  );

-- Group ↔ source members
CREATE TABLE public.source_group_members (
  group_id uuid NOT NULL REFERENCES public.source_groups(id) ON DELETE CASCADE,
  source_id text NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  added_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, source_id)
);
CREATE INDEX idx_sgm_source ON public.source_group_members (source_id);

ALTER TABLE public.source_group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sgm_read_inherits" ON public.source_group_members
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.source_groups g
      WHERE g.id = group_id
        AND (g.visibility IN ('official','public')
             OR g.created_by = auth.uid()
             OR public.is_admin(auth.uid()))
    )
  );
CREATE POLICY "sgm_write_owner_or_admin" ON public.source_group_members
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.source_groups g
            WHERE g.id = group_id
              AND (g.created_by = auth.uid() OR public.is_admin(auth.uid())))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.source_groups g
            WHERE g.id = group_id
              AND (g.created_by = auth.uid() OR public.is_admin(auth.uid())))
  );

-- User ↔ subscribed groups
CREATE TABLE public.user_subscribed_groups (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.source_groups(id) ON DELETE CASCADE,
  subscribed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, group_id)
);
CREATE INDEX idx_usg_group ON public.user_subscribed_groups (group_id);

ALTER TABLE public.user_subscribed_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "usg_select_own" ON public.user_subscribed_groups
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "usg_insert_own" ON public.user_subscribed_groups
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.source_groups g
      WHERE g.id = group_id
        AND g.is_archived = false
        AND (g.visibility IN ('official','public')
             OR g.created_by = auth.uid()
             OR public.is_admin(auth.uid()))
    )
  );
CREATE POLICY "usg_delete_own" ON public.user_subscribed_groups
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================================================
-- Counter triggers
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sync_source_group_member_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.source_groups SET member_count = member_count + 1
      WHERE id = NEW.group_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.source_groups SET member_count = GREATEST(member_count - 1, 0)
      WHERE id = OLD.group_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER trg_sgm_count
  AFTER INSERT OR DELETE ON public.source_group_members
  FOR EACH ROW EXECUTE FUNCTION public.sync_source_group_member_count();

CREATE OR REPLACE FUNCTION public.sync_source_group_subscriber_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.source_groups SET subscriber_count = subscriber_count + 1
      WHERE id = NEW.group_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.source_groups SET subscriber_count = GREATEST(subscriber_count - 1, 0)
      WHERE id = OLD.group_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER trg_usg_count
  AFTER INSERT OR DELETE ON public.user_subscribed_groups
  FOR EACH ROW EXECUTE FUNCTION public.sync_source_group_subscriber_count();

-- ============================================================================
-- Effective sources view (direct + via subscribed groups)
-- ============================================================================
CREATE OR REPLACE VIEW public.user_effective_sources
WITH (security_invoker = true) AS
SELECT user_id, source_id, 'direct'::text AS via, NULL::uuid AS group_id
  FROM public.user_subscribed_sources
UNION
SELECT usg.user_id, sgm.source_id, 'group'::text AS via, usg.group_id
  FROM public.user_subscribed_groups usg
  JOIN public.source_group_members sgm ON sgm.group_id = usg.group_id;

GRANT SELECT ON public.user_effective_sources TO authenticated;

-- ============================================================================
-- Seed starter official groups (system-owned so they don't appear under any
-- admin's "Created by me" tab). Empty member lists initially.
-- ============================================================================
WITH areas AS (
  SELECT id, slug FROM public.cancer_areas
),
new_groups (slug, name, description, area_slug) AS (
  VALUES
    -- Urological
    ('prostate-cancer-kols',    'Prostate cancer KOLs',         'Leading voices on prostate cancer.', 'urological'),
    ('bladder-cancer-kols',     'Bladder cancer KOLs',          'Bladder cancer key opinion leaders.', 'urological'),
    ('kidney-cancer-kols',      'Kidney cancer KOLs',           'Kidney/renal cell cancer experts.', 'urological'),
    -- Breast
    ('breast-cancer-kols',      'Breast cancer KOLs',           'Top breast oncology voices.', 'breast'),
    ('her2-breast-cancer',      'HER2+ breast cancer',          'HER2-positive breast cancer experts.', 'breast'),
    ('tnbc-breast-cancer',      'Triple-negative breast cancer','TNBC research and practice.', 'breast'),
    -- GI
    ('colorectal-cancer-kols',  'Colorectal cancer KOLs',       'CRC clinicians and researchers.', 'gi'),
    ('pancreatic-cancer-kols',  'Pancreatic cancer KOLs',       'Pancreatic cancer specialists.', 'gi'),
    ('hepatobiliary-cancer',    'Hepatobiliary cancer',         'HCC and biliary tract experts.', 'gi'),
    -- Placeholders for remaining areas
    ('lung-cancer-kols',                    'Lung cancer KOLs',                    'Thoracic oncology voices.', 'lung'),
    ('gynecological-cancer-kols',           'Gynecological cancer KOLs',           'Gyn-onc clinicians.', 'gynecological'),
    ('hematological-malignancies-kols',     'Hematological malignancies KOLs',     'Hematology-oncology leaders.', 'hematological'),
    ('head-neck-cancer-kols',               'Head & neck cancer KOLs',             'HNSCC and related experts.', 'head_neck'),
    ('melanoma-skin-cancer-kols',           'Melanoma & skin cancer KOLs',         'Melanoma and cutaneous oncology.', 'skin'),
    ('neuro-oncology-kols',                 'Neuro-oncology KOLs',                 'CNS tumor experts.', 'neuro'),
    ('sarcoma-kols',                        'Sarcoma KOLs',                        'Soft-tissue and bone sarcoma experts.', 'sarcoma'),
    ('pediatric-oncology-kols',             'Pediatric oncology KOLs',             'Pediatric cancer specialists.', 'pediatric')
),
inserted AS (
  INSERT INTO public.source_groups (slug, name, description, visibility, is_system, created_by)
  SELECT ng.slug, ng.name, ng.description, 'official', true, NULL
  FROM new_groups ng
  WHERE NOT EXISTS (SELECT 1 FROM public.source_groups sg WHERE sg.slug = ng.slug)
  RETURNING id, slug
)
INSERT INTO public.source_group_cancer_areas (group_id, cancer_area_id)
SELECT i.id, a.id
FROM inserted i
JOIN new_groups ng ON ng.slug = i.slug
JOIN areas a ON a.slug = ng.area_slug
ON CONFLICT DO NOTHING;
