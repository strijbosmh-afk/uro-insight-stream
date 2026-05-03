-- Add FK from tweets.source_id to sources.id with cascade delete.
ALTER TABLE public.tweets
  ADD CONSTRAINT tweets_source_id_fkey
  FOREIGN KEY (source_id)
  REFERENCES public.sources(id)
  ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS tweets_source_id_idx ON public.tweets(source_id);