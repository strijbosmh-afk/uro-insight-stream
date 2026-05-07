
-- Brainstorm chatroom messages (admin-only)
CREATE TABLE public.brainstorm_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_display_name text NOT NULL,
  content text NOT NULL CHECK (char_length(content) <= 2000 AND char_length(content) > 0),
  reply_to_id uuid REFERENCES public.brainstorm_messages(id) ON DELETE SET NULL,
  reactions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

CREATE INDEX brainstorm_messages_created_at_idx ON public.brainstorm_messages (created_at);
CREATE INDEX brainstorm_messages_reply_to_id_idx ON public.brainstorm_messages (reply_to_id);

ALTER TABLE public.brainstorm_messages ENABLE ROW LEVEL SECURITY;

-- Admins can read non-deleted messages
CREATE POLICY "Admins read brainstorm messages"
ON public.brainstorm_messages
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Admins can post; user_id must match auth.uid()
CREATE POLICY "Admins insert own brainstorm messages"
ON public.brainstorm_messages
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  AND user_id = auth.uid()
);

-- Author can update their own message; any admin may update (used for reactions)
CREATE POLICY "Admins update brainstorm messages"
ON public.brainstorm_messages
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Soft-delete is done via UPDATE; no hard DELETE from clients

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.brainstorm_messages;
ALTER TABLE public.brainstorm_messages REPLICA IDENTITY FULL;
