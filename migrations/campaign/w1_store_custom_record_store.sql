-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- allows: revoke custom
--
-- W1-STORE — schema `custom`, the record store, the first revoke and the one write door.
--
-- WHAT THIS FILE IS
-- -----------------
-- The campaign's FIRST DDL. It creates the schema every later `custom` lane builds in,
-- the store itself, the privilege posture that makes §6's OFF switch true, and the single
-- write-door entry point — so that no later writing lane ever has a bypass to lose.
--
-- WHY THE TABLE IS HAND-WRITTEN AND NOT `platform.create_entity_table`
-- -------------------------------------------------------------------
-- Chair ruling, BUILD-LOG 2026-09-17, recorded before this file's first statement. Read
-- from production's own `pg_get_functiondef` on 2026-09-17, the live provisioner emits
-- `id uuid PRIMARY KEY`, contains ZERO occurrences of `PARTITION` and ZERO of
-- `custom_fields`. It therefore cannot express REC-N-6's `(organization_id, id)` key,
-- REC-41's sixteen hash partitions or REC-60's base contract. Teaching the provisioner is
-- `W1-REG`'s work (REC-57); `custom.record` is the kernel object the provisioner is later
-- taught, not its first customer.
--
-- WHY SIXTEEN PARTITIONS
-- ----------------------
-- REC-41, measured on the rehearsal branch 2026-09-17 over 2,000,000 rows and 500
-- organizations: the point read is indistinguishable at 1 / 16 / 64, the list read is
-- ~2.5x faster at the median partitioned, and the cross-organization maintenance read's
-- unpartitioned worst case is 13x the partitioned worst case. Sixteen is chosen over
-- sixty-four because it matches or beats it on both user-facing reads for a quarter of
-- the child tables.
--
-- WHY THE REVOKES ARE HERE AND NOT LATER
-- --------------------------------------
-- §6.3's fact two, and DOOR-N-1's law. The revoke lands in the campaign's FIRST migration
-- so that `authenticated` never holds a direct INSERT/UPDATE/DELETE grant on `custom.*`
-- at any point in the campaign's life — there is no window in which a later lane could
-- come to depend on a bypass. The bounded route is `-- allows: revoke custom`, which both
-- runners refuse without, refuse when any REVOKE names another schema, and PRINT when
-- used.
--
-- WHAT IS NOT HERE, AND WHERE IT IS
-- ---------------------------------
--   · the eight kernel Table rows          → `w1_store_kernel_tables.sql`
--   · `platform.entity_types` registration → `w1_store_branch_registration.sql`, BRANCH ONLY
--     and certification (REC-56)              (production's registry gains no `custom:`
--                                              token before the switch checklist)
--   · `platform._metadata_guard` on `crm.party` (REC-59) → NOT this lane's; it is a
--     live-path change on a 1,879-row table and needs a guard-reading wrapper and an
--     answer-identity test of its own. Named in the build log for REC-59's owner.
--
-- THE `crm.party` COLUMN
-- ----------------------
-- REC-40's first retrofit. `crm.party` is named by the chair, not chosen by a builder:
-- a standard Entity (`rls_variant = 'entity'`), real rows to prove against (1,879,
-- measured 2026-09-17), NOT in the `supabase_realtime` publication, and our own CRM
-- organization's data. A column cannot be hidden by a knob — PostgREST `select('*')`
-- returns it the instant it lands — so `custom/entity_custom_fields_guard` holds its
-- MEANING off and the OFF proof is ANSWER IDENTITY: every existing read returns the same
-- values it returned against the go-signal capture, with one extra key whose value is
-- `null` for every live row. The column is therefore NULLABLE with NO DEFAULT; REC-40's
-- `NOT NULL DEFAULT '{}'` is the switch checklist's to add when the guard comes on, and
-- the divergence is recorded in the build log rather than resolved quietly.
--
-- THE INVERSE: `migrations/inverse/w1_store_custom_record_store_down.sql` (§4.13).

set lock_timeout = '5s';
set statement_timeout = '120s';

-- ── the schema, and the posture that makes it unreachable ──────────────────────
create schema if not exists custom;

revoke all on schema custom from public;
revoke all on schema custom from anon;
revoke all on schema custom from authenticated;
revoke all on schema custom from service_role;

alter default privileges in schema custom revoke all on tables from public, anon, authenticated, service_role;
alter default privileges in schema custom revoke all on functions from public, anon, authenticated, service_role;
alter default privileges in schema custom revoke all on sequences from public, anon, authenticated, service_role;

comment on schema custom is
  'The unified custom-data store. Revoked from PUBLIC, anon, authenticated and service_role and absent from pgrst.db_schemas; the product switch is platform.knob_resolve(''custom'',''system_enabled'', null).';

-- ── the store ──────────────────────────────────────────────────────────────────
-- REC-60's base contract in order at the front: id, the table's own domain columns,
-- organization_id NOT NULL, created_by, updated_by, created_at, updated_at, deleted_at,
-- version, metadata, custom_fields, visibility.
create table if not exists custom.record (
  id              uuid        not null default gen_random_uuid(),
  table_id        uuid,
  data_class      text        not null default 'record',
  data            jsonb       not null default '{}'::jsonb,
  organization_id uuid        not null references iam.organizations(id),
  created_by      uuid        references auth.users(id),
  updated_by      uuid        references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  version         integer     not null default 1,
  metadata        jsonb       not null default '{}'::jsonb,
  custom_fields   jsonb       not null default '{}'::jsonb,
  visibility      platform.visibility not null default 'internal',
  constraint record_pkey primary key (organization_id, id)
) partition by hash (organization_id);

comment on table custom.record is
  'REC-36: one jsonb document per record, never one row per value. REC-N-6: the primary key is (organization_id, id), never id alone. REC-41: HASH PARTITIONED BY organization_id into sixteen partitions.';
comment on column custom.record.metadata is
  'REC-59: system-only, never user-facing. It never mixes with custom_fields.';
comment on column custom.record.custom_fields is
  'FLD-N-3: the one field-value column. User-facing, never system.';

create table if not exists custom.record_p00 partition of custom.record for values with (modulus 16, remainder 0);
create table if not exists custom.record_p01 partition of custom.record for values with (modulus 16, remainder 1);
create table if not exists custom.record_p02 partition of custom.record for values with (modulus 16, remainder 2);
create table if not exists custom.record_p03 partition of custom.record for values with (modulus 16, remainder 3);
create table if not exists custom.record_p04 partition of custom.record for values with (modulus 16, remainder 4);
create table if not exists custom.record_p05 partition of custom.record for values with (modulus 16, remainder 5);
create table if not exists custom.record_p06 partition of custom.record for values with (modulus 16, remainder 6);
create table if not exists custom.record_p07 partition of custom.record for values with (modulus 16, remainder 7);
create table if not exists custom.record_p08 partition of custom.record for values with (modulus 16, remainder 8);
create table if not exists custom.record_p09 partition of custom.record for values with (modulus 16, remainder 9);
create table if not exists custom.record_p10 partition of custom.record for values with (modulus 16, remainder 10);
create table if not exists custom.record_p11 partition of custom.record for values with (modulus 16, remainder 11);
create table if not exists custom.record_p12 partition of custom.record for values with (modulus 16, remainder 12);
create table if not exists custom.record_p13 partition of custom.record for values with (modulus 16, remainder 13);
create table if not exists custom.record_p14 partition of custom.record for values with (modulus 16, remainder 14);
create table if not exists custom.record_p15 partition of custom.record for values with (modulus 16, remainder 15);

-- The organization-leading index REC-41 measured the list read against.
create index if not exists record_org_table_created_idx
  on custom.record (organization_id, table_id, created_at desc);

-- RLS on the parent AND on every partition: a policy on the parent is not consulted when
-- a partition is addressed directly, and "unreachable" must not depend on which relation
-- name a caller happens to type.
alter table custom.record enable row level security;
alter table custom.record_p00 enable row level security;
alter table custom.record_p01 enable row level security;
alter table custom.record_p02 enable row level security;
alter table custom.record_p03 enable row level security;
alter table custom.record_p04 enable row level security;
alter table custom.record_p05 enable row level security;
alter table custom.record_p06 enable row level security;
alter table custom.record_p07 enable row level security;
alter table custom.record_p08 enable row level security;
alter table custom.record_p09 enable row level security;
alter table custom.record_p10 enable row level security;
alter table custom.record_p11 enable row level security;
alter table custom.record_p12 enable row level security;
alter table custom.record_p13 enable row level security;
alter table custom.record_p14 enable row level security;
alter table custom.record_p15 enable row level security;

-- REC-60's machinery. `_version_capture` is deliberately NOT attached: the registry will
-- carry `is_versioned = false` for this token, `history.row_versions` is held OFF by
-- `custom/row_versions_guard`, and the certifier SKIPs the check for an unversioned row.
create trigger _stamp_actor before insert or update on custom.record
  for each row execute function platform._stamp_actor();
create trigger _touch_row before insert or update on custom.record
  for each row execute function platform._touch_row();

-- ── the one write door ─────────────────────────────────────────────────────────
-- DOOR-N-1: `authenticated` holds no direct INSERT, UPDATE or DELETE grant on `custom.*`,
-- and this is the entry point every later writing lane goes through. It is created with
-- NO grant at all — `ALTER DEFAULT PRIVILEGES` above already revoked EXECUTE from every
-- client role, and the grant is switch-checklist work, not a lane's.
create or replace function custom.record_write(
  p_organization_id uuid,
  p_table_id        uuid,
  p_data            jsonb
) returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_id uuid;
begin
  if p_organization_id is null then
    raise exception 'custom.record_write: organization_id is required — the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;
  insert into custom.record (organization_id, table_id, data)
  values (p_organization_id, p_table_id, coalesce(p_data, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$fn$;

comment on function custom.record_write(uuid, uuid, jsonb) is
  'DOOR-N-1: the one write door into custom.record. authenticated holds no direct INSERT/UPDATE/DELETE on custom.*; every writing lane goes through here.';

-- ── the revoke the door's law depends on ───────────────────────────────────────
revoke all on all tables in schema custom from public, anon, service_role;
revoke insert, update, delete on all tables in schema custom from authenticated;
revoke all on all tables in schema custom from authenticated;
revoke all on all functions in schema custom from public, anon, authenticated, service_role;

-- ── REC-40's first retrofit, on the table the chair named ──────────────────────
-- Guarded by `custom/entity_custom_fields_guard`, which holds the column's MEANING off.
-- The column itself is visible to `select('*')` the instant it lands, so the OFF proof is
-- answer identity, not byte identity.
alter table crm.party add column if not exists custom_fields jsonb;

comment on column crm.party.custom_fields is
  'REC-40, the campaign''s first retrofit. Its MEANING is held off by custom/entity_custom_fields_guard; nothing reads it while that knob resolves false. Nullable with no default on purpose: the OFF proof is that every existing read returns the same values with one extra key whose value is null.';
