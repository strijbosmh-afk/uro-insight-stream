-- Sources table
CREATE TABLE public.sources (
  id TEXT PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  avatar_url TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'other',
  specialty TEXT[] NOT NULL DEFAULT '{}',
  verified BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  list_ids TEXT[] NOT NULL DEFAULT '{}',
  last_seen_at TIMESTAMPTZ,
  tweet_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read sources" ON public.sources
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins and editors can insert sources" ON public.sources
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'editor'::public.app_role)
  );
CREATE POLICY "Admins and editors can update sources" ON public.sources
  FOR UPDATE TO authenticated USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'editor'::public.app_role)
  );
CREATE POLICY "Admins can delete sources" ON public.sources
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER sources_touch_updated_at
  BEFORE UPDATE ON public.sources
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Hashtags table
CREATE TABLE public.hashtags (
  id TEXT PRIMARY KEY,
  tag TEXT NOT NULL UNIQUE,
  congress_id TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.hashtags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read hashtags" ON public.hashtags
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins and editors can insert hashtags" ON public.hashtags
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'editor'::public.app_role)
  );
CREATE POLICY "Admins and editors can update hashtags" ON public.hashtags
  FOR UPDATE TO authenticated USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'editor'::public.app_role)
  );
CREATE POLICY "Admins can delete hashtags" ON public.hashtags
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER hashtags_touch_updated_at
  BEFORE UPDATE ON public.hashtags
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_sources_active ON public.sources(active);
CREATE INDEX idx_hashtags_active ON public.hashtags(active);
CREATE INDEX idx_hashtags_congress ON public.hashtags(congress_id);