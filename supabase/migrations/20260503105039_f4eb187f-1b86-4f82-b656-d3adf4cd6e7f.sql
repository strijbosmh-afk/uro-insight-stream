CREATE OR REPLACE FUNCTION public.sync_cron_job_secret(_secret text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  sid uuid;
BEGIN
  IF _secret IS NULL OR length(_secret) < 32 THEN
    RAISE EXCEPTION 'invalid cron secret';
  END IF;

  SELECT id INTO sid
  FROM vault.secrets
  WHERE name = 'X_JOB_SECRET'
  LIMIT 1;

  IF sid IS NULL THEN
    PERFORM vault.create_secret(_secret, 'X_JOB_SECRET', 'Cron job shared auth secret');
  ELSE
    PERFORM vault.update_secret(sid, _secret, 'X_JOB_SECRET', 'Cron job shared auth secret');
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_cron_job_secret(text) FROM PUBLIC, anon, authenticated;