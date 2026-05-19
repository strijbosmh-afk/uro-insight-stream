-- app_secrets: workspace-wide credentials managed by the super admin
-- (e.g. ANTHROPIC_API_KEY for LLM lookups). Values are written and read
-- ONLY by the server-side service role; RLS denies all access from anon
-- and authenticated roles so a compromised user session can never read
-- the raw value.

CREATE TABLE IF NOT EXISTS public.app_secrets (
  key_name TEXT PRIMARY KEY,
  -- Raw secret value. Server-side service-role access only.
  value TEXT NOT NULL CHECK (length(value) BETWEEN 8 AND 8192),
  -- Cached display fragments so the UI can confirm "the right key is set"
  -- without ever fetching the raw value.
  prefix TEXT NOT NULL,
  last_four TEXT NOT NULL,
  -- Audit metadata.
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;

-- Deliberately NO policies for anon/authenticated.
-- Service role (used by supabaseAdmin in server fns) bypasses RLS, which
-- is the ONLY path that should ever touch this table.

COMMENT ON TABLE public.app_secrets IS
  'Workspace-wide credentials managed by super admin. Service-role access only.';
COMMENT ON COLUMN public.app_secrets.value IS
  'Raw secret value. Never expose to clients.';
COMMENT ON COLUMN public.app_secrets.prefix IS
  'First ~7 chars of the secret for UI display (e.g. "sk-ant-").';
COMMENT ON COLUMN public.app_secrets.last_four IS
  'Last 4 chars of the secret for UI display.';
