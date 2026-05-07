CREATE OR REPLACE FUNCTION public.get_active_user_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT COUNT(DISTINCT user_id)::int
  FROM auth.sessions
  WHERE (not_after IS NULL OR not_after > now())
    AND (updated_at IS NULL OR updated_at > now() - interval '30 minutes');
$$;

GRANT EXECUTE ON FUNCTION public.get_active_user_count() TO anon, authenticated, service_role;