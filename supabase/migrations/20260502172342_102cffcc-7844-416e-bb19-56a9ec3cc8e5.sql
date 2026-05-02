
-- =========================================
-- 1. Reference: urology_specialties (seeded)
-- =========================================
CREATE TABLE public.urology_specialties (
  id text PRIMARY KEY,
  label text NOT NULL,
  description text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.urology_specialties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read urology specialties"
  ON public.urology_specialties FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert urology specialties"
  ON public.urology_specialties FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update urology specialties"
  ON public.urology_specialties FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete urology specialties"
  ON public.urology_specialties FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

INSERT INTO public.urology_specialties (id, label, description, sort_order) VALUES
  ('onco_prostate',       'Prostate cancer',         'Localized & advanced prostate cancer, hormone therapy, PSMA imaging.', 10),
  ('onco_bladder',        'Bladder cancer',          'NMIBC, MIBC, BCG, immunotherapy, cystectomy & bladder preservation.',   20),
  ('onco_kidney',         'Kidney cancer',           'RCC, partial vs radical nephrectomy, IO/TKI systemic therapy.',         30),
  ('onco_testis_penile',  'Testis & penile cancer',  'Germ cell tumors, RPLND, organ-sparing penile surgery.',                40),
  ('andrology',           'Andrology',               'Male sexual & reproductive health, infertility, hypogonadism.',         50),
  ('functional',          'Functional urology',      'Incontinence, OAB, neurogenic bladder, urodynamics.',                   60),
  ('endourology',         'Endourology & stones',    'Stone disease, PCNL, ureteroscopy, laser lithotripsy.',                 70),
  ('reconstructive',      'Reconstructive urology',  'Urethral & ureteral reconstruction, fistula repair, trauma.',           80),
  ('pediatric',           'Pediatric urology',       'Hypospadias, VUR, congenital anomalies, robotic peds surgery.',         90),
  ('female_pelvic',       'Female & pelvic',         'Female urology, prolapse, FPMRS, mesh & sling surgery.',               100),
  ('robotics',            'Robotics & technology',   'Robotic platforms, single-port, AI-assisted surgery, training.',       110),
  ('imaging_pathology',   'Imaging & pathology',     'mpMRI, PSMA-PET, AI pathology, biomarkers.',                           120);

-- =========================================
-- 2. Recommendation tables (admin-curated)
-- =========================================
CREATE TABLE public.recommended_sources_by_specialty (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  specialty_id text NOT NULL REFERENCES public.urology_specialties(id) ON DELETE CASCADE,
  source_id text NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  weight integer NOT NULL DEFAULT 50 CHECK (weight BETWEEN 0 AND 100),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (specialty_id, source_id)
);

ALTER TABLE public.recommended_sources_by_specialty ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read recommended sources"
  ON public.recommended_sources_by_specialty FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert recommended sources"
  ON public.recommended_sources_by_specialty FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins can update recommended sources"
  ON public.recommended_sources_by_specialty FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins can delete recommended sources"
  ON public.recommended_sources_by_specialty FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_rec_sources_updated_at BEFORE UPDATE
  ON public.recommended_sources_by_specialty
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.recommended_congresses_by_specialty (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  specialty_id text NOT NULL REFERENCES public.urology_specialties(id) ON DELETE CASCADE,
  congress_id text NOT NULL,
  weight integer NOT NULL DEFAULT 50 CHECK (weight BETWEEN 0 AND 100),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (specialty_id, congress_id)
);

ALTER TABLE public.recommended_congresses_by_specialty ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read recommended congresses"
  ON public.recommended_congresses_by_specialty FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert recommended congresses"
  ON public.recommended_congresses_by_specialty FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins can update recommended congresses"
  ON public.recommended_congresses_by_specialty FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins can delete recommended congresses"
  ON public.recommended_congresses_by_specialty FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_rec_congresses_updated_at BEFORE UPDATE
  ON public.recommended_congresses_by_specialty
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.recommended_hashtags_by_specialty (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  specialty_id text NOT NULL REFERENCES public.urology_specialties(id) ON DELETE CASCADE,
  hashtag_id text NOT NULL REFERENCES public.hashtags(id) ON DELETE CASCADE,
  weight integer NOT NULL DEFAULT 50 CHECK (weight BETWEEN 0 AND 100),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (specialty_id, hashtag_id)
);

ALTER TABLE public.recommended_hashtags_by_specialty ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read recommended hashtags"
  ON public.recommended_hashtags_by_specialty FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert recommended hashtags"
  ON public.recommended_hashtags_by_specialty FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins can update recommended hashtags"
  ON public.recommended_hashtags_by_specialty FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins can delete recommended hashtags"
  ON public.recommended_hashtags_by_specialty FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_rec_hashtags_updated_at BEFORE UPDATE
  ON public.recommended_hashtags_by_specialty
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================
-- 3. Per-user tables
-- =========================================
CREATE TABLE public.user_specialties (
  user_id uuid NOT NULL,
  specialty_id text NOT NULL REFERENCES public.urology_specialties(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, specialty_id)
);
CREATE UNIQUE INDEX user_specialties_one_primary
  ON public.user_specialties (user_id) WHERE is_primary;

ALTER TABLE public.user_specialties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users select own specialties"
  ON public.user_specialties FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own specialties"
  ON public.user_specialties FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own specialties"
  ON public.user_specialties FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own specialties"
  ON public.user_specialties FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.user_subscribed_sources (
  user_id uuid NOT NULL,
  source_id text NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, source_id)
);
ALTER TABLE public.user_subscribed_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users select own source subs"
  ON public.user_subscribed_sources FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own source subs"
  ON public.user_subscribed_sources FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own source subs"
  ON public.user_subscribed_sources FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.user_subscribed_hashtags (
  user_id uuid NOT NULL,
  hashtag_id text NOT NULL REFERENCES public.hashtags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, hashtag_id)
);
ALTER TABLE public.user_subscribed_hashtags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users select own hashtag subs"
  ON public.user_subscribed_hashtags FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own hashtag subs"
  ON public.user_subscribed_hashtags FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own hashtag subs"
  ON public.user_subscribed_hashtags FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.user_subscribed_congresses (
  user_id uuid NOT NULL,
  congress_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, congress_id)
);
ALTER TABLE public.user_subscribed_congresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users select own congress subs"
  ON public.user_subscribed_congresses FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own congress subs"
  ON public.user_subscribed_congresses FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own congress subs"
  ON public.user_subscribed_congresses FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.user_onboarding_state (
  user_id uuid PRIMARY KEY,
  current_step integer NOT NULL DEFAULT 1,
  completed_at timestamptz,
  skipped_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_onboarding_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users select own onboarding"
  ON public.user_onboarding_state FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own onboarding"
  ON public.user_onboarding_state FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own onboarding"
  ON public.user_onboarding_state FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_user_onboarding_state_updated_at BEFORE UPDATE
  ON public.user_onboarding_state
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================
-- 4. Ingest queue
-- =========================================
CREATE TABLE public.ingest_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id text NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  job_type text NOT NULL DEFAULT 'initial_ingest',
  priority integer NOT NULL DEFAULT 50 CHECK (priority BETWEEN 0 AND 100),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  since timestamptz NOT NULL DEFAULT (now() - interval '72 hours'),
  requested_by uuid,
  error_message text,
  attempts integer NOT NULL DEFAULT 0
);
CREATE INDEX ingest_queue_status_priority_idx
  ON public.ingest_queue (status, priority DESC, requested_at);

ALTER TABLE public.ingest_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read ingest queue"
  ON public.ingest_queue FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can enqueue ingest jobs"
  ON public.ingest_queue FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = requested_by);
CREATE POLICY "Admins can update ingest queue"
  ON public.ingest_queue FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins can delete ingest queue"
  ON public.ingest_queue FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
