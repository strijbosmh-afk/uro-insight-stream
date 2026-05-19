CREATE TABLE IF NOT EXISTS public.app_secrets (
  key_name TEXT PRIMARY KEY,
  value TEXT NOT NULL CHECK (length(value) BETWEEN 8 AND 8192),
  prefix TEXT NOT NULL,
  last_four TEXT NOT NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.app_secrets IS
  'Workspace-wide credentials managed by super admin. Service-role access only.';
COMMENT ON COLUMN public.app_secrets.value IS
  'Raw secret value. Never expose to clients.';
COMMENT ON COLUMN public.app_secrets.prefix IS
  'First ~7 chars of the secret for UI display (e.g. "sk-ant-").';
COMMENT ON COLUMN public.app_secrets.last_four IS
  'Last 4 chars of the secret for UI display.';