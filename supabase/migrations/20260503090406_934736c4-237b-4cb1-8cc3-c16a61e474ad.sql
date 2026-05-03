-- Delete mock-seeded summaries
DELETE FROM public.summaries WHERE seeded_from_mock = true;

-- Delete mock-seeded abstracts
DELETE FROM public.abstracts WHERE seeded_from_mock = true;

-- Delete mock-seeded sessions
DELETE FROM public.sessions WHERE seeded_from_mock = true;

-- Delete recommendations and subscriptions tied to mock congresses
DELETE FROM public.recommended_congresses_by_specialty
 WHERE congress_id IN (SELECT id FROM public.congresses WHERE seeded_from_mock = true);
DELETE FROM public.user_subscribed_congresses
 WHERE congress_id IN (SELECT id FROM public.congresses WHERE seeded_from_mock = true);

-- Delete mock-seeded congresses
DELETE FROM public.congresses WHERE seeded_from_mock = true;

-- Delete mock-seeded sources (handles starting with mock-style ids)
DELETE FROM public.recommended_sources_by_specialty
 WHERE source_id IN (SELECT id FROM public.sources WHERE id LIKE 'src_%' OR handle ILIKE 'mock%');
DELETE FROM public.user_subscribed_sources
 WHERE source_id IN (SELECT id FROM public.sources WHERE id LIKE 'src_%' OR handle ILIKE 'mock%');
DELETE FROM public.sources WHERE id LIKE 'src_%' OR handle ILIKE 'mock%';
