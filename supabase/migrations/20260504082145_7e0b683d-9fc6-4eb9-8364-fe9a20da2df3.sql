
-- Helper that mirrors has_role(uid,'admin') for cleaner policies
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
$$;

-- ============================================================
-- user_invitations
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL,
  role text NOT NULL CHECK (role IN ('admin','editor','viewer')),
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  token text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked','expired')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz NULL,
  accepted_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  display_name text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_invitations_email_status
  ON public.user_invitations (email, status);
CREATE INDEX IF NOT EXISTS idx_user_invitations_token
  ON public.user_invitations (token);

DROP TRIGGER IF EXISTS trg_user_invitations_touch ON public.user_invitations;
CREATE TRIGGER trg_user_invitations_touch
BEFORE UPDATE ON public.user_invitations
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read invitations"
  ON public.user_invitations FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins insert invitations"
  ON public.user_invitations FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins update invitations"
  ON public.user_invitations FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins delete invitations"
  ON public.user_invitations FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- ============================================================
-- user_profile_extras
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_profile_extras (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  deactivated_at timestamptz NULL,
  deactivated_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  display_name text NULL,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_user_profile_extras_touch ON public.user_profile_extras;
CREATE TRIGGER trg_user_profile_extras_touch
BEFORE UPDATE ON public.user_profile_extras
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.user_profile_extras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner or admin read profile extras"
  ON public.user_profile_extras FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Admins insert profile extras"
  ON public.user_profile_extras FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins update profile extras"
  ON public.user_profile_extras FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins delete profile extras"
  ON public.user_profile_extras FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- ============================================================
-- admin_audit_log
-- ============================================================
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL,
  action text NOT NULL,
  target_user_id uuid NULL,
  target_email citext NULL,
  metadata jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at
  ON public.admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_actor_created_at
  ON public.admin_audit_log (actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target
  ON public.admin_audit_log (target_user_id);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read admin audit"
  ON public.admin_audit_log FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins insert admin audit"
  ON public.admin_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) AND actor_user_id = auth.uid());

-- (no UPDATE / DELETE policies — append-only)
