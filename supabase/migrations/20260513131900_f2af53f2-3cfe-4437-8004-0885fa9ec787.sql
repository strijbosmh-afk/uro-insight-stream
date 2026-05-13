
-- Atomic role replacement with last-admin guard. Idempotent: caller passes
-- the new role and we collapse user_roles to exactly one row in a single
-- transaction. Acquires SHARE ROW EXCLUSIVE on user_roles to serialize
-- concurrent demotions and prevent the "two demotions both pass" race.
CREATE OR REPLACE FUNCTION public.admin_set_user_role(
  _target_user_id uuid,
  _new_role public.app_role,
  _granted_by uuid
)
RETURNS public.app_role[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prev_roles public.app_role[];
  was_admin boolean;
  admin_count integer;
BEGIN
  LOCK TABLE public.user_roles IN SHARE ROW EXCLUSIVE MODE;

  SELECT COALESCE(array_agg(role), ARRAY[]::public.app_role[])
    INTO prev_roles
  FROM public.user_roles
  WHERE user_id = _target_user_id;

  was_admin := 'admin'::public.app_role = ANY(prev_roles);

  IF was_admin AND _new_role <> 'admin'::public.app_role THEN
    SELECT count(*)::int INTO admin_count
      FROM public.user_roles
     WHERE role = 'admin'::public.app_role;
    IF admin_count <= 1 THEN
      RAISE EXCEPTION 'last_admin' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Replace all roles with the single target role atomically.
  DELETE FROM public.user_roles WHERE user_id = _target_user_id;
  INSERT INTO public.user_roles (user_id, role, granted_by)
  VALUES (_target_user_id, _new_role, _granted_by);

  RETURN prev_roles;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_user_role(uuid, public.app_role, uuid) FROM public, anon, authenticated;

-- Atomic invitation claim: returns the row only if status was pending and
-- not expired, otherwise returns nothing and caller treats as error.
CREATE OR REPLACE FUNCTION public.claim_user_invitation(
  _token text,
  _user_id uuid
)
RETURNS TABLE (
  id uuid,
  email citext,
  role text,
  invited_by uuid,
  display_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.user_invitations inv
     SET status = 'accepted',
         accepted_at = now(),
         accepted_user_id = _user_id
   WHERE inv.token = _token
     AND inv.status = 'pending'
     AND inv.expires_at > now()
  RETURNING inv.id, inv.email, inv.role, inv.invited_by, inv.display_name;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_user_invitation(text, uuid) FROM public, anon, authenticated;

-- Race-fix the open-coalescing-window lookup. At most one open window per
-- watchlist; insert collisions become upsert/no-op so concurrent matchers
-- can't both create fresh email_sends rows.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_wes_open_window_per_watchlist
  ON public.watchlist_email_sends (watchlist_id)
  WHERE delta_sent_at IS NULL;
