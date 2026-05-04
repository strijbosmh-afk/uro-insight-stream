CREATE TABLE IF NOT EXISTS public.source_lists (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_source_lists_user_id ON public.source_lists(user_id);

ALTER TABLE public.source_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own source lists"
  ON public.source_lists FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own source lists"
  ON public.source_lists FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own source lists"
  ON public.source_lists FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own source lists"
  ON public.source_lists FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_source_lists_touch
  BEFORE UPDATE ON public.source_lists
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();