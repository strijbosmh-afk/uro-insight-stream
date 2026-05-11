
-- 1. Extend user_x_credentials
ALTER TABLE public.user_x_credentials
  ADD COLUMN IF NOT EXISTS tier text NULL,
  ADD COLUMN IF NOT EXISTS scope_read boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS read_count_window_start timestamptz NULL,
  ADD COLUMN IF NOT EXISTS read_count_today integer NOT NULL DEFAULT 0;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_x_credentials_tier_check'
  ) THEN
    ALTER TABLE public.user_x_credentials
      ADD CONSTRAINT user_x_credentials_tier_check
      CHECK (tier IS NULL OR tier IN ('free','basic','pro','enterprise'));
  END IF;
END $$;

-- 2. Setup-progress table
CREATE TABLE IF NOT EXISTS public.user_x_setup_progress (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_step smallint NOT NULL DEFAULT 1,
  completed_steps smallint[] NOT NULL DEFAULT '{}',
  tier_chosen text NULL,
  notes text NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_x_setup_progress ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_x_setup_progress' AND policyname='owner_select') THEN
    CREATE POLICY "owner_select" ON public.user_x_setup_progress FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_x_setup_progress' AND policyname='owner_insert') THEN
    CREATE POLICY "owner_insert" ON public.user_x_setup_progress FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_x_setup_progress' AND policyname='owner_update') THEN
    CREATE POLICY "owner_update" ON public.user_x_setup_progress FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_x_setup_progress' AND policyname='owner_delete') THEN
    CREATE POLICY "owner_delete" ON public.user_x_setup_progress FOR DELETE TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;

DROP TRIGGER IF EXISTS touch_user_x_setup_progress_updated_at ON public.user_x_setup_progress;
CREATE TRIGGER touch_user_x_setup_progress_updated_at
  BEFORE UPDATE ON public.user_x_setup_progress
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. Per-user X grace deadline
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS x_grace_until timestamptz NULL;

UPDATE public.profiles
   SET x_grace_until = created_at + interval '14 days'
 WHERE x_grace_until IS NULL;
