ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS quick_start_dismissed boolean NOT NULL DEFAULT false;