ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS digest_default_frequency text NOT NULL DEFAULT 'weekly',
  ADD COLUMN IF NOT EXISTS digest_default_send_hour smallint NOT NULL DEFAULT 9,
  ADD COLUMN IF NOT EXISTS digest_default_timezone text NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS digests_active_by_default boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS digests_master_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_new_summary boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_new_tweet_followed_source boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_weekly_recap boolean NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_preferences_digest_frequency_check'
  ) THEN
    ALTER TABLE public.user_preferences
      ADD CONSTRAINT user_preferences_digest_frequency_check
      CHECK (digest_default_frequency IN ('daily','weekly','biweekly','monthly'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_preferences_digest_send_hour_check'
  ) THEN
    ALTER TABLE public.user_preferences
      ADD CONSTRAINT user_preferences_digest_send_hour_check
      CHECK (digest_default_send_hour BETWEEN 0 AND 23);
  END IF;
END$$;