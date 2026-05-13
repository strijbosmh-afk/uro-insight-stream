CREATE TABLE IF NOT EXISTS public.user_bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tweet_id text NOT NULL REFERENCES public.tweets(id) ON DELETE CASCADE,
  note text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tweet_id)
);

CREATE INDEX IF NOT EXISTS idx_user_bookmarks_user_created
  ON public.user_bookmarks(user_id, created_at DESC);

ALTER TABLE public.user_bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own bookmarks"
  ON public.user_bookmarks FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "users insert own bookmarks"
  ON public.user_bookmarks FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "users update own bookmarks"
  ON public.user_bookmarks FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "users delete own bookmarks"
  ON public.user_bookmarks FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER user_bookmarks_touch_updated_at
BEFORE UPDATE ON public.user_bookmarks
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();