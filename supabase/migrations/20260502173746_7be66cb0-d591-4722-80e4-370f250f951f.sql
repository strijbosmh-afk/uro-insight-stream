-- Access request submissions from the login page
CREATE TABLE public.access_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by UUID,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  review_note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_access_requests_status_created ON public.access_requests(status, created_at DESC);
CREATE INDEX idx_access_requests_email ON public.access_requests(lower(email));

ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;

-- Anyone (including unauthenticated visitors) can submit a request
CREATE POLICY "Anyone can submit an access request"
  ON public.access_requests FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Only admins can read / triage
CREATE POLICY "Admins can read access requests"
  ON public.access_requests FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update access requests"
  ON public.access_requests FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete access requests"
  ON public.access_requests FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_access_requests_updated_at
  BEFORE UPDATE ON public.access_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();