CREATE POLICY "Users can view own x credentials"
  ON public.user_x_credentials FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
