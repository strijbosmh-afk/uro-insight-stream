
-- Widen status check to support the same lifecycle values as enrichment_status.
alter table public.ingest_queue drop constraint if exists ingest_queue_status_check;
alter table public.ingest_queue add constraint ingest_queue_status_check
  check (status = any (array['pending','processing','running','done','completed','failed','rate_limited']));

-- Item 1: Backfill cosmetic status column
update public.ingest_queue
   set status = 'completed'
 where status <> 'completed' and enrichment_status = 'completed';

update public.ingest_queue
   set status = 'failed'
 where status <> 'failed' and enrichment_status = 'failed';

update public.ingest_queue
   set status = 'rate_limited'
 where status <> 'rate_limited' and enrichment_status = 'rate_limited';

update public.ingest_queue
   set status = 'processing'
 where status <> 'processing' and enrichment_status = 'processing';

-- Item 2: Sync trigger
create or replace function public.sync_ingest_queue_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.enrichment_status in ('completed','failed','rate_limited','processing','pending') then
    new.status := new.enrichment_status;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_ingest_queue_status on public.ingest_queue;
create trigger trg_sync_ingest_queue_status
  before insert or update of enrichment_status on public.ingest_queue
  for each row execute function public.sync_ingest_queue_status();

-- Item 3: ops_alerts
create table public.ops_alerts (
  id uuid primary key default gen_random_uuid(),
  alert_kind text not null check (alert_kind in (
    'stale_ingest_queue',
    'llm_quota_exhausted',
    'x_rate_limit_burst',
    'watchlist_classifier_failure'
  )),
  severity text not null default 'warning' check (severity in ('info','warning','critical')),
  message text not null,
  metadata jsonb,
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index ops_alerts_unack_idx
  on public.ops_alerts (created_at desc, acknowledged_at);

alter table public.ops_alerts enable row level security;

create policy "Admins read ops alerts"
  on public.ops_alerts
  for select to authenticated
  using (is_admin(auth.uid()));

create policy "Admins acknowledge ops alerts"
  on public.ops_alerts
  for update to authenticated
  using (is_admin(auth.uid()))
  with check (is_admin(auth.uid()));
