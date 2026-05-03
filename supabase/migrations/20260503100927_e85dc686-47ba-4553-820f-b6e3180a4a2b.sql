ALTER TABLE public.tweets
  ADD COLUMN IF NOT EXISTS tweet_type text
    NOT NULL DEFAULT 'original',
  ADD COLUMN IF NOT EXISTS parent_tweet_external_id text,
  ADD COLUMN IF NOT EXISTS parent_handle text,
  ADD COLUMN IF NOT EXISTS parent_text text,
  ADD COLUMN IF NOT EXISTS parent_in_db_id text REFERENCES public.tweets(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tweets_tweet_type_check'
  ) THEN
    ALTER TABLE public.tweets
      ADD CONSTRAINT tweets_tweet_type_check
      CHECK (tweet_type IN ('original', 'reply', 'quote', 'retweet'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_tweets_tweet_type
  ON public.tweets(tweet_type) WHERE tweet_type <> 'original';
CREATE INDEX IF NOT EXISTS idx_tweets_parent_external
  ON public.tweets(parent_tweet_external_id) WHERE parent_tweet_external_id IS NOT NULL;