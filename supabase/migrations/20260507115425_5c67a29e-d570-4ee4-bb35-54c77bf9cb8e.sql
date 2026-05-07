CREATE TABLE public.brainstorm_read_state (
  user_id uuid NOT NULL PRIMARY KEY,
  user_display_name text NOT NULL,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.brainstorm_read_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read all brainstorm read state"
  ON public.brainstorm_read_state FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins upsert own brainstorm read state insert"
  ON public.brainstorm_read_state FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND user_id = auth.uid());

CREATE POLICY "Admins upsert own brainstorm read state update"
  ON public.brainstorm_read_state FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND user_id = auth.uid())
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.brainstorm_read_state;