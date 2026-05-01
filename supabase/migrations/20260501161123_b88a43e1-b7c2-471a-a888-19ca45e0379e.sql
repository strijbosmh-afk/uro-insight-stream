CREATE TABLE public.user_ai_settings (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  model TEXT NOT NULL DEFAULT 'google/gemini-3-flash-preview',
  prompt_template TEXT,
  tone TEXT NOT NULL DEFAULT 'clinical',
  language TEXT NOT NULL DEFAULT 'English',
  max_bullets INTEGER NOT NULL DEFAULT 5 CHECK (max_bullets BETWEEN 1 AND 12),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_ai_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own AI settings"
  ON public.user_ai_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own AI settings"
  ON public.user_ai_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own AI settings"
  ON public.user_ai_settings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own AI settings"
  ON public.user_ai_settings FOR DELETE
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_user_ai_settings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_ai_settings_set_updated_at
  BEFORE UPDATE ON public.user_ai_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_user_ai_settings_updated_at();