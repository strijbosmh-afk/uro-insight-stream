
alter table public.profiles
  add column if not exists follows_import_nudge_dismissed_count integer not null default 0,
  add column if not exists follows_import_nudge_last_dismissed_at timestamptz,
  add column if not exists legacy_user_import_prompt_seen_at timestamptz;
