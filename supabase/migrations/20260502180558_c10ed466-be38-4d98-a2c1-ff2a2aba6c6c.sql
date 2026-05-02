DROP POLICY IF EXISTS "Authenticated insert summaries" ON public.summaries;
DROP POLICY IF EXISTS "Authenticated update summaries" ON public.summaries;

CREATE POLICY "Editors and admins insert summaries" ON public.summaries FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'editor'::app_role));
CREATE POLICY "Editors and admins update summaries" ON public.summaries FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'editor'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'editor'::app_role));
