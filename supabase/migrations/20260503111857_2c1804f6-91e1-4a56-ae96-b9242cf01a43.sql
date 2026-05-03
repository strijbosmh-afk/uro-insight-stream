ALTER TABLE public.user_preferences
  ALTER COLUMN theme_density SET DEFAULT 'comfortable';

ALTER TABLE public.user_preferences
  DROP CONSTRAINT IF EXISTS user_preferences_theme_density_check;

ALTER TABLE public.user_preferences
  ADD CONSTRAINT user_preferences_theme_density_check
  CHECK (theme_density IN ('compact','comfortable','spacious'));