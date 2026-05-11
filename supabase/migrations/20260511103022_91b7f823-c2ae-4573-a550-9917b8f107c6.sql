
CREATE TABLE public.user_watchlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  target_kind text NOT NULL CHECK (target_kind IN ('source', 'group')),
  target_source_id text NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  target_group_id uuid NULL REFERENCES public.source_groups(id) ON DELETE CASCADE,
  email_enabled boolean NOT NULL DEFAULT false,
  quiet_hours_start smallint NOT NULL DEFAULT 22 CHECK (quiet_hours_start BETWEEN 0 AND 23),
  quiet_hours_end smallint NOT NULL DEFAULT 8 CHECK (quiet_hours_end BETWEEN 0 AND 23),
  max_emails_per_day integer NOT NULL DEFAULT 10 CHECK (max_emails_per_day BETWEEN 1 AND 100),
  is_active boolean NOT NULL DEFAULT true,
  muted_until timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_watchlists_target_xor
    CHECK ((target_source_id IS NOT NULL) <> (target_group_id IS NOT NULL))
);
CREATE INDEX idx_user_watchlists_user ON public.user_watchlists(user_id);
CREATE INDEX idx_user_watchlists_source ON public.user_watchlists(target_source_id) WHERE target_source_id IS NOT NULL;
CREATE INDEX idx_user_watchlists_group ON public.user_watchlists(target_group_id) WHERE target_group_id IS NOT NULL;
CREATE INDEX idx_user_watchlists_active ON public.user_watchlists(is_active) WHERE is_active = true;
ALTER TABLE public.user_watchlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own watchlists" ON public.user_watchlists FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own watchlists" ON public.user_watchlists FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own watchlists" ON public.user_watchlists FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own watchlists" ON public.user_watchlists FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER trg_user_watchlists_updated_at BEFORE UPDATE ON public.user_watchlists FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.user_watchlist_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_id uuid NOT NULL REFERENCES public.user_watchlists(id) ON DELETE CASCADE,
  topic text NOT NULL CHECK (length(topic) BETWEEN 2 AND 80),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_uwt_watchlist ON public.user_watchlist_topics(watchlist_id);
CREATE UNIQUE INDEX uq_uwt_lower_topic ON public.user_watchlist_topics(watchlist_id, lower(topic));
ALTER TABLE public.user_watchlist_topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own topics" ON public.user_watchlist_topics FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.user_watchlists w WHERE w.id = watchlist_id AND w.user_id = auth.uid()));
CREATE POLICY "Users insert own topics" ON public.user_watchlist_topics FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.user_watchlists w WHERE w.id = watchlist_id AND w.user_id = auth.uid()));
CREATE POLICY "Users update own topics" ON public.user_watchlist_topics FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.user_watchlists w WHERE w.id = watchlist_id AND w.user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.user_watchlists w WHERE w.id = watchlist_id AND w.user_id = auth.uid()));
CREATE POLICY "Users delete own topics" ON public.user_watchlist_topics FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.user_watchlists w WHERE w.id = watchlist_id AND w.user_id = auth.uid()));

CREATE TABLE public.user_watchlist_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_id uuid NOT NULL REFERENCES public.user_watchlists(id) ON DELETE CASCADE,
  tweet_id text NOT NULL,
  matched_topic text NOT NULL,
  match_reason jsonb NOT NULL DEFAULT '{}'::jsonb,
  classified_at timestamptz NOT NULL DEFAULT now(),
  delivered_via text[] NOT NULL DEFAULT ARRAY['in_app']::text[],
  dismissed_at timestamptz NULL,
  UNIQUE (watchlist_id, tweet_id, matched_topic)
);
CREATE INDEX idx_uwm_watchlist_classified ON public.user_watchlist_matches(watchlist_id, classified_at DESC);
CREATE INDEX idx_uwm_tweet ON public.user_watchlist_matches(tweet_id);
CREATE INDEX idx_uwm_undismissed ON public.user_watchlist_matches(watchlist_id) WHERE dismissed_at IS NULL;
ALTER TABLE public.user_watchlist_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own matches" ON public.user_watchlist_matches FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.user_watchlists w WHERE w.id = watchlist_id AND w.user_id = auth.uid()));
CREATE POLICY "Users update own matches" ON public.user_watchlist_matches FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.user_watchlists w WHERE w.id = watchlist_id AND w.user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.user_watchlists w WHERE w.id = watchlist_id AND w.user_id = auth.uid()));

CREATE TABLE public.watchlist_match_cache (
  tweet_id text NOT NULL,
  topic_set_hash text NOT NULL,
  matches jsonb NOT NULL DEFAULT '[]'::jsonb,
  classified_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tweet_id, topic_set_hash)
);
CREATE INDEX idx_wmc_classified ON public.watchlist_match_cache(classified_at DESC);
ALTER TABLE public.watchlist_match_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read match cache" ON public.watchlist_match_cache FOR SELECT TO authenticated USING (true);

CREATE TABLE public.user_llm_quota (
  user_id uuid NOT NULL,
  day date NOT NULL,
  classifications integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);
ALTER TABLE public.user_llm_quota ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own quota" ON public.user_llm_quota FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.watchlist_email_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  watchlist_id uuid NOT NULL REFERENCES public.user_watchlists(id) ON DELETE CASCADE,
  sent_at timestamptz NOT NULL DEFAULT now(),
  match_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[]
);
CREATE INDEX idx_wes_user_sent ON public.watchlist_email_sends(user_id, sent_at DESC);
CREATE INDEX idx_wes_watchlist_sent ON public.watchlist_email_sends(watchlist_id, sent_at DESC);
ALTER TABLE public.watchlist_email_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own email sends" ON public.watchlist_email_sends FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.watchlist_mute_tokens (
  token text PRIMARY KEY,
  watchlist_id uuid NOT NULL REFERENCES public.user_watchlists(id) ON DELETE CASCADE,
  hours integer NOT NULL DEFAULT 24 CHECK (hours BETWEEN 1 AND 168),
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz NULL
);
ALTER TABLE public.watchlist_mute_tokens ENABLE ROW LEVEL SECURITY;

ALTER PUBLICATION supabase_realtime ADD TABLE public.user_watchlist_matches;
