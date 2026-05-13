
-- B10: atomic per-user daily X-posting reservation. Returns true if a slot
-- was reserved (counter incremented), false if cap reached. Resets the 24h
-- window when expired. Caller is responsible for releasing on non-rate-limit
-- failures (see release_x_post_slot below).
CREATE OR REPLACE FUNCTION public.try_reserve_x_post_slot(_user_id uuid, _cap integer, _window_seconds integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rows_affected integer;
BEGIN
  WITH src AS (
    SELECT id, post_count_today, post_count_window_start
      FROM public.user_x_credentials
     WHERE user_id = _user_id
     LIMIT 1
  )
  UPDATE public.user_x_credentials u
     SET post_count_today =
           CASE
             WHEN src.post_count_window_start IS NULL
                  OR src.post_count_window_start < now() - make_interval(secs => _window_seconds)
               THEN 1
             ELSE src.post_count_today + 1
           END,
         post_count_window_start =
           CASE
             WHEN src.post_count_window_start IS NULL
                  OR src.post_count_window_start < now() - make_interval(secs => _window_seconds)
               THEN now()
             ELSE src.post_count_window_start
           END
    FROM src
   WHERE u.id = src.id
     AND (
       src.post_count_window_start IS NULL
       OR src.post_count_window_start < now() - make_interval(secs => _window_seconds)
       OR src.post_count_today < _cap
     );

  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RETURN rows_affected > 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.try_reserve_x_post_slot(uuid, integer, integer) FROM public, anon, authenticated;

-- Releases a previously reserved slot (used after a failed post that should
-- not consume the daily cap).
CREATE OR REPLACE FUNCTION public.release_x_post_slot(_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.user_x_credentials
     SET post_count_today = GREATEST(post_count_today - 1, 0)
   WHERE user_id = _user_id;
$$;

REVOKE EXECUTE ON FUNCTION public.release_x_post_slot(uuid) FROM public, anon, authenticated;

-- B11/B12: atomic per-user, per-day LLM quota counter for both classifications
-- and the new expensive_calls bucket. Returns the resulting counter value for
-- the requested kind (caller decides whether the cap is exceeded).
CREATE OR REPLACE FUNCTION public.bump_user_llm_quota(
  _user_id uuid,
  _day date,
  _kind text,
  _n integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_classifications integer;
  v_expensive integer;
BEGIN
  IF _kind NOT IN ('classifications', 'expensive_calls') THEN
    RAISE EXCEPTION 'invalid quota kind: %', _kind;
  END IF;

  INSERT INTO public.user_llm_quota (user_id, day, classifications, expensive_calls, updated_at)
  VALUES (
    _user_id,
    _day,
    CASE WHEN _kind = 'classifications' THEN _n ELSE 0 END,
    CASE WHEN _kind = 'expensive_calls' THEN _n ELSE 0 END,
    now()
  )
  ON CONFLICT (user_id, day) DO UPDATE
    SET classifications = public.user_llm_quota.classifications +
          CASE WHEN _kind = 'classifications' THEN EXCLUDED.classifications ELSE 0 END,
        expensive_calls = public.user_llm_quota.expensive_calls +
          CASE WHEN _kind = 'expensive_calls' THEN EXCLUDED.expensive_calls ELSE 0 END,
        updated_at = now()
  RETURNING classifications, expensive_calls
  INTO v_classifications, v_expensive;

  RETURN CASE WHEN _kind = 'classifications' THEN v_classifications ELSE v_expensive END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bump_user_llm_quota(uuid, date, text, integer) FROM public, anon, authenticated;
