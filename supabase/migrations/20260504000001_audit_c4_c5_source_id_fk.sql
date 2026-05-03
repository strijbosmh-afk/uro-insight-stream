-- Audit fix C4/C5/M5/M12: enforce sources.id = lower(handle), reconcile
-- orphaned tweets, then add FK from tweets.source_id to sources.id.
--
-- Without this, sources added via the admin Sources page get random IDs
-- that never match incoming tweets — they appear in the list but show zero
-- ingested tweets forever. This migration heals existing data and prevents
-- recurrence.

-- 1. Reconcile orphaned tweets: any tweet whose source_id doesn't match an
--    existing sources.id (because the source was never inserted, or was
--    inserted with a random id like 'src_xxx' and never linked) gets a
--    minimal sources row created from its author_handle. This keeps the
--    tweet visible in feeds with proper attribution.

INSERT INTO public.sources (id, handle, display_name, role, active, verified)
SELECT DISTINCT
  lower(t.author_handle) AS id,
  lower(t.author_handle) AS handle,
  COALESCE(t.author_display_name, t.author_handle) AS display_name,
  'other' AS role,
  true AS active,
  false AS verified
FROM public.tweets t
WHERE t.source_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.sources s WHERE s.id = t.source_id)
  AND t.author_handle IS NOT NULL
  AND t.author_handle ~ '^[A-Za-z0-9_]{1,15}$'
ON CONFLICT (id) DO NOTHING;

-- Then point any remaining orphan tweets at the correct source row by
-- handle. Adapter writes lower(username) as source_id so this is a no-op
-- for new data; only catches the case where the linkage was previously
-- broken (e.g. by a UI-added source with a random id).
UPDATE public.tweets t
SET source_id = lower(t.author_handle)
WHERE t.source_id IS NOT NULL
  AND t.author_handle IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.sources s WHERE s.id = t.source_id)
  AND EXISTS (SELECT 1 FROM public.sources s WHERE s.id = lower(t.author_handle));

-- 2. Drop any sources rows where id != lower(handle) (broken random-id
--    rows from the admin Sources page). Their tweets have already been
--    repointed to the correct id by step 1.
DELETE FROM public.sources
WHERE id <> lower(handle);

-- 3. Enforce the convention going forward.
ALTER TABLE public.sources
  DROP CONSTRAINT IF EXISTS sources_id_lowercase_handle_check;
ALTER TABLE public.sources
  ADD CONSTRAINT sources_id_lowercase_handle_check
  CHECK (id = lower(handle));

-- 4. Add the missing FK with ON DELETE CASCADE so hard-deleting a source
--    cleans up its tweets atomically (matches the source-deletion design
--    discussed during audit).
ALTER TABLE public.tweets
  DROP CONSTRAINT IF EXISTS fk_tweets_source;
ALTER TABLE public.tweets
  ADD CONSTRAINT fk_tweets_source
  FOREIGN KEY (source_id)
  REFERENCES public.sources(id)
  ON DELETE CASCADE
  ON UPDATE CASCADE
  DEFERRABLE INITIALLY DEFERRED;

-- 5. Drop duplicate indexes on tweets table (M1 finding).
DROP INDEX IF EXISTS public.idx_tweets_session;
DROP INDEX IF EXISTS public.tweets_source_id_idx;

