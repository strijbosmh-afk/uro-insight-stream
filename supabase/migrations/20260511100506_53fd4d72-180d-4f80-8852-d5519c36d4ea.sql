CREATE TABLE public.tweet_reply_suggestions (
  tweet_id text PRIMARY KEY REFERENCES public.tweets(id) ON DELETE CASCADE,
  drafts jsonb NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  model text NOT NULL
);

ALTER TABLE public.tweet_reply_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read reply suggestions"
  ON public.tweet_reply_suggestions
  FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX idx_tweet_reply_suggestions_expires ON public.tweet_reply_suggestions(expires_at);