-- Demo flag
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_is_demo
  ON public.profiles(is_demo) WHERE is_demo = true;

-- Simulated post history for demo users
CREATE TABLE IF NOT EXISTS public.demo_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text text NOT NULL,
  in_reply_to_tweet_id text NULL,
  simulated_tweet_id text NOT NULL,
  posted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_demo_posts_user_posted_at
  ON public.demo_posts(user_id, posted_at DESC);

ALTER TABLE public.demo_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own demo posts" ON public.demo_posts;
CREATE POLICY "Users see own demo posts"
  ON public.demo_posts FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Block demo accounts from being granted admin/editor roles
CREATE OR REPLACE FUNCTION public.prevent_demo_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IN ('admin'::public.app_role, 'editor'::public.app_role)
     AND EXISTS (
       SELECT 1 FROM public.profiles
        WHERE id = NEW.user_id AND is_demo = true
     ) THEN
    RAISE EXCEPTION 'demo accounts cannot be granted % role', NEW.role;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_demo_role_escalation ON public.user_roles;
CREATE TRIGGER trg_prevent_demo_role_escalation
  BEFORE INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_demo_role_escalation();