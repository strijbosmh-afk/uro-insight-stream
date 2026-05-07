-- Phase 2: dedicated reactions table to fix lost-update race condition.

CREATE TABLE public.brainstorm_message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.brainstorm_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  emoji text NOT NULL CHECK (emoji IN ('👍','❤️','😂','😮','😢','🎉','🚀','💡')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX brainstorm_message_reactions_message_id_idx
  ON public.brainstorm_message_reactions (message_id);

ALTER TABLE public.brainstorm_message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read brainstorm reactions"
  ON public.brainstorm_message_reactions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins insert own brainstorm reactions"
  ON public.brainstorm_message_reactions FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND user_id = auth.uid()
  );

CREATE POLICY "Admins delete own brainstorm reactions"
  ON public.brainstorm_message_reactions FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND user_id = auth.uid()
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.brainstorm_message_reactions;
ALTER TABLE public.brainstorm_message_reactions REPLICA IDENTITY FULL;

-- Backfill from existing jsonb column. Rows look like { "👍": ["uuid", ...], ... }
INSERT INTO public.brainstorm_message_reactions (message_id, user_id, emoji)
SELECT m.id, (uid)::uuid, k.emoji
FROM public.brainstorm_messages m,
     jsonb_each(COALESCE(m.reactions, '{}'::jsonb)) AS k(emoji, ids),
     jsonb_array_elements_text(k.ids) AS uid
WHERE m.reactions IS NOT NULL
  AND k.emoji IN ('👍','❤️','😂','😮','😢','🎉','🚀','💡')
ON CONFLICT (message_id, user_id, emoji) DO NOTHING;

ALTER TABLE public.brainstorm_messages DROP COLUMN reactions;