DELETE FROM public.congress_lookup_cache
WHERE query_raw ILIKE '%esmo%2026%'
   OR query_hash = encode(digest('v2-official-page-verify:esmo 2026', 'sha256'), 'hex');