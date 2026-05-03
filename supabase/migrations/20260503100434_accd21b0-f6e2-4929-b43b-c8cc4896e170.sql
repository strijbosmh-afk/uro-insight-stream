INSERT INTO public.sources (id, handle, display_name, role, active, verified, specialty, list_ids)
SELECT * FROM (VALUES
  ('src_uroweb',         'Uroweb',         'European Association of Urology', 'society', true, true, ARRAY[]::text[], ARRAY[]::text[]),
  ('src_amerurological', 'AmerUrological', 'American Urological Association', 'society', true, true, ARRAY[]::text[], ARRAY[]::text[]),
  ('src_jurology',       'JUrology',       'The Journal of Urology',          'journal', true, true, ARRAY[]::text[], ARRAY[]::text[])
) AS v(id, handle, display_name, role, active, verified, specialty, list_ids)
WHERE NOT EXISTS (
  SELECT 1 FROM public.sources s WHERE lower(s.handle) = lower(v.handle)
);