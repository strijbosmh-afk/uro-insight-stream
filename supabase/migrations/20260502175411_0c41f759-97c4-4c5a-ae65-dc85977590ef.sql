-- 1. Extend ingest_queue
ALTER TABLE public.ingest_queue
  ADD COLUMN IF NOT EXISTS enrichment_status text NOT NULL DEFAULT 'pending'
    CHECK (enrichment_status IN ('pending','processing','completed','failed','rate_limited')),
  ADD COLUMN IF NOT EXISTS last_processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS rate_limited_until timestamptz,
  ADD COLUMN IF NOT EXISTS job_payload jsonb;

CREATE INDEX IF NOT EXISTS idx_ingest_queue_worker_poll
  ON public.ingest_queue (enrichment_status, priority DESC, requested_at)
  WHERE enrichment_status = 'pending';

-- 2. Per-user lookup rate limit (fixed-bucket per minute)
CREATE TABLE IF NOT EXISTS public.rate_limit_lookups (
  user_id uuid NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, window_start)
);
CREATE INDEX IF NOT EXISTS idx_rate_limit_lookups_window
  ON public.rate_limit_lookups (window_start DESC);

ALTER TABLE public.rate_limit_lookups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own lookup usage"
  ON public.rate_limit_lookups FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Admins read all lookup usage"
  ON public.rate_limit_lookups FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3. Global lookup rate limit (single sliding-window counter)
CREATE TABLE IF NOT EXISTS public.rate_limit_global_lookups (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  window_start timestamptz NOT NULL DEFAULT now(),
  count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.rate_limit_global_lookups (id, window_start, count)
  VALUES (1, now(), 0) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.rate_limit_global_lookups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read global lookup usage"
  ON public.rate_limit_global_lookups FOR SELECT TO authenticated
  USING (true);

-- 4. Worker run log
CREATE TABLE IF NOT EXISTS public.ingest_queue_run_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  jobs_picked integer NOT NULL DEFAULT 0,
  jobs_completed integer NOT NULL DEFAULT 0,
  jobs_failed integer NOT NULL DEFAULT 0,
  jobs_rate_limited integer NOT NULL DEFAULT 0,
  x_api_calls integer NOT NULL DEFAULT 0,
  notes text
);
CREATE INDEX IF NOT EXISTS idx_ingest_queue_run_log_started
  ON public.ingest_queue_run_log (started_at DESC);

ALTER TABLE public.ingest_queue_run_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read run log"
  ON public.ingest_queue_run_log FOR SELECT TO authenticated
  USING (true);

-- 5. Congresses catalog
CREATE TABLE IF NOT EXISTS public.congresses (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name text NOT NULL,
  short_code text NOT NULL UNIQUE,
  city text,
  country text,
  start_date date,
  end_date date,
  status text NOT NULL DEFAULT 'upcoming'
    CHECK (status IN ('upcoming','live','archived')),
  primary_hashtags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_congresses_status ON public.congresses (status);

ALTER TABLE public.congresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read congresses"
  ON public.congresses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Editors and admins insert congresses"
  ON public.congresses FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'));
CREATE POLICY "Editors and admins update congresses"
  ON public.congresses FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'));
CREATE POLICY "Admins delete congresses"
  ON public.congresses FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER touch_congresses_updated_at
  BEFORE UPDATE ON public.congresses
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();