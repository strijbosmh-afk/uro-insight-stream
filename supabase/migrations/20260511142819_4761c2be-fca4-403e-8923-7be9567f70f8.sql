
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS low_source_count_nudge_dismissed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS dormant_reminder_last_sent_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS dormant_reminder_disabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.user_x_credentials
  ADD COLUMN IF NOT EXISTS follows_new_since_last_import int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS follows_diff_last_checked_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS follows_diff_dismissed_at timestamptz NULL;

ALTER TABLE public.user_x_follows_cache
  ADD COLUMN IF NOT EXISTS previous_handles text[] NULL;
