-- Access Gate — `iam.access_requests`, the ask-the-owner ledger.
--
-- Before this table there was no way for a blocked user to do the one thing
-- they actually want: ask. Every access-denied dead end in the app terminated
-- in a red box. A request row is that ask, made durable: who wants what, at
-- which level, with what message, and what the owner decided.
--
-- WHY RLS IS DELIBERATELY NARROW HERE. The requester owns their row and can
-- read/withdraw it. The DECIDER's inbox is not expressible as a cheap row
-- predicate — "rows whose target resource I administer" would mean a recursive
-- access-resolver call per row, the exact per-row shape the 2026-08-08
-- component-access precedent bans. So the inbox is served by the SECURITY
-- DEFINER `access_request_list('inbox')` RPC, which authorizes one resource at
-- a time over a set that is small by construction. Same posture as
-- `iam.org_member_controls`.

create table if not exists iam.access_requests (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references iam.organizations(id),
  created_by       uuid not null references auth.users(id),
  updated_by       uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  version          integer not null default 1,
  metadata         jsonb not null default '{}'::jsonb,
  visibility       platform.visibility not null default 'personal',

  -- What is being asked for.
  resource_type    text not null,
  resource_id      uuid not null,
  requested_level  text not null default 'viewer'
                     check (requested_level in ('viewer', 'editor')),
  message          text,

  -- What happened to the ask.
  status           text not null default 'pending'
                     check (status in ('pending', 'granted', 'declined',
                                       'withdrawn', 'reported')),
  decided_by       uuid references auth.users(id),
  decided_at       timestamptz,
  decision_note    text
);

comment on table iam.access_requests is
  'A user''s request for access to a specific record they cannot open. Written by '
  'access_request_create; decided by access_request_decide. The requester''s own '
  'rows are RLS-visible to them; the decider''s inbox is served by '
  'access_request_list(''inbox'') so no per-row access resolution is needed.';

-- ONE open ask per person per record — a second click must not queue a second
-- request, and the owner must never see the same ask twice.
create unique index if not exists access_requests_one_pending
  on iam.access_requests (resource_type, resource_id, created_by)
  where status = 'pending' and deleted_at is null;

create index if not exists access_requests_resource
  on iam.access_requests (resource_type, resource_id)
  where deleted_at is null;
create index if not exists access_requests_requester
  on iam.access_requests (created_by, created_at desc)
  where deleted_at is null;

-- Per-entity disclosure kill switch, consumed by access_denied_context. ONE
-- place decides how much a denied user may be told about a kind of record;
-- there is no second policy system.
alter table platform.entity_types
  add column if not exists allow_preview boolean not null default true;

comment on column platform.entity_types.allow_preview is
  'When TRUE (default), access_denied_context may tell a signed-in user who cannot '
  'open a row its title, owner and organization. When FALSE, only the entity KIND '
  'is revealed. Flip it with admin_set_entity_type_preview.';

-- Register the entity so the registry and access resolver can speak about it
-- by token like every other first-class row.
insert into platform.entity_types
  (token, schema_name, table_name, label, is_active, is_listed, is_component,
   has_soft_delete, is_versioned, default_visibility, title_column,
   content_role, category, allow_preview)
values
  ('access_request', 'iam', 'access_requests', 'Access Request', true, false,
   false, true, false, 'personal', null, 'utility', 'System', false)
on conflict (token) do update
  set schema_name = excluded.schema_name,
      table_name  = excluded.table_name,
      label       = excluded.label,
      is_active   = excluded.is_active;

-- ── RLS: the requester's own rows, nothing else ─────────────────────────────
alter table iam.access_requests enable row level security;

drop policy if exists ar_svc_all on iam.access_requests;
create policy ar_svc_all on iam.access_requests
  to service_role using (true) with check (true);

drop policy if exists ar_own_select on iam.access_requests;
create policy ar_own_select on iam.access_requests
  for select to authenticated
  using (created_by = (select auth.uid()) and deleted_at is null);

-- Writes go through the RPC family only: a request must resolve recipients and
-- enforce the "you already have access" / "you already asked" rules, and a
-- decision must be authorized against the TARGET resource, not against this row.
drop policy if exists ar_own_insert on iam.access_requests;
drop policy if exists ar_own_update on iam.access_requests;
drop policy if exists ar_own_delete on iam.access_requests;

grant select on iam.access_requests to authenticated;

-- The canonical base-column triggers, exactly as every other entity table
-- carries them: actor stamping, updated_at/version touch, org default.
drop trigger if exists _stamp_actor on iam.access_requests;
create trigger _stamp_actor
  before insert or update on iam.access_requests
  for each row execute function platform._stamp_actor();

drop trigger if exists _touch_row on iam.access_requests;
create trigger _touch_row
  before insert or update on iam.access_requests
  for each row execute function platform._touch_row();

drop trigger if exists _stamp_org_default on iam.access_requests;
create trigger _stamp_org_default
  before insert on iam.access_requests
  for each row execute function public._stamp_org_default();
