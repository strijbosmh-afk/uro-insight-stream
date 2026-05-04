-- citext for case-insensitive email storage
CREATE EXTENSION IF NOT EXISTS citext;

-- Reuse existing updated_at trigger function (already defined in project)
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Main subscriptions table
CREATE TABLE public.digest_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  frequency text NOT NULL CHECK (frequency IN ('daily','weekly','biweekly','monthly')),
  day_of_week smallint NULL CHECK (day_of_week IS NULL OR (day_of_week BETWEEN 0 AND 6)),
  send_hour smallint NOT NULL DEFAULT 8 CHECK (send_hour BETWEEN 0 AND 23),
  timezone text NOT NULL DEFAULT 'UTC',
  is_active boolean NOT NULL DEFAULT true,
  last_sent_at timestamptz NULL,
  next_send_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_digest_due ON public.digest_subscriptions (is_active, next_send_at);
CREATE INDEX idx_digest_user ON public.digest_subscriptions (user_id);

CREATE TRIGGER trg_digest_subscriptions_touch
BEFORE UPDATE ON public.digest_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.digest_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own digests"
  ON public.digest_subscriptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own digests"
  ON public.digest_subscriptions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own digests"
  ON public.digest_subscriptions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own digests"
  ON public.digest_subscriptions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Sources join
CREATE TABLE public.digest_subscription_sources (
  digest_id uuid NOT NULL REFERENCES public.digest_subscriptions(id) ON DELETE CASCADE,
  source_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (digest_id, source_id)
);

CREATE INDEX idx_digest_sources_digest ON public.digest_subscription_sources (digest_id);

ALTER TABLE public.digest_subscription_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own digest sources"
  ON public.digest_subscription_sources FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.digest_subscriptions d
    WHERE d.id = digest_id AND d.user_id = auth.uid()
  ));

CREATE POLICY "Users insert own digest sources"
  ON public.digest_subscription_sources FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.digest_subscriptions d
    WHERE d.id = digest_id AND d.user_id = auth.uid()
  ));

CREATE POLICY "Users delete own digest sources"
  ON public.digest_subscription_sources FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.digest_subscriptions d
    WHERE d.id = digest_id AND d.user_id = auth.uid()
  ));

-- Recipients
CREATE TABLE public.digest_subscription_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  digest_id uuid NOT NULL REFERENCES public.digest_subscriptions(id) ON DELETE CASCADE,
  email citext NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (digest_id, email)
);

CREATE INDEX idx_digest_recipients_digest ON public.digest_subscription_recipients (digest_id);

ALTER TABLE public.digest_subscription_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own digest recipients"
  ON public.digest_subscription_recipients FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.digest_subscriptions d
    WHERE d.id = digest_id AND d.user_id = auth.uid()
  ));

CREATE POLICY "Users insert own digest recipients"
  ON public.digest_subscription_recipients FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.digest_subscriptions d
    WHERE d.id = digest_id AND d.user_id = auth.uid()
  ));

CREATE POLICY "Users update own digest recipients"
  ON public.digest_subscription_recipients FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.digest_subscriptions d
    WHERE d.id = digest_id AND d.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.digest_subscriptions d
    WHERE d.id = digest_id AND d.user_id = auth.uid()
  ));

CREATE POLICY "Users delete own digest recipients"
  ON public.digest_subscription_recipients FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.digest_subscriptions d
    WHERE d.id = digest_id AND d.user_id = auth.uid()
  ));