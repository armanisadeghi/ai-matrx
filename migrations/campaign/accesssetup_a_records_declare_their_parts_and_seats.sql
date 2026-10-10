-- chair-step: it ADDS the two tables of the access-setup primitive and nothing else: iam.access_setup (machinery declaration register, no client privilege, written only by migrations; its validating trigger arrives with the functions in accesssetup_b) and iam.record_seat_change (an entity table built by platform.create_entity_table, Organization class, doors only — no client table privilege), plus the subject-column exemption for record_seat_change.user_id. No existing table, function, policy or data row is changed. Split from the functions because a new foreign key to iam.users holds a lock the auth-lock watchdog cancels after a few seconds.
-- lane: access-setup
-- lock: iam
--
-- Plan: common-docs/systems/platform/access/projects/access-setup/PLAN.md §2, §3 (step 1 of §8).
-- Inverse: migrations/inverse/accesssetup_a_records_declare_their_parts_and_seats_down.sql
-- Functions, the check and the door: accesssetup_b_the_seat_and_part_answers.sql

-- ── 1. the declaration table ─────────────────────────────────────────────────────────────────────
create table iam.access_setup (
  entity_type  text primary key check (btrim(entity_type) <> ''),
  setup        jsonb not null check (jsonb_typeof(setup) = 'object'),
  declared_by  text not null check (btrim(declared_by) <> ''),
  updated_at   timestamptz not null default now()
);
comment on table iam.access_setup is
  'Access setup declarations (common-docs/systems/platform/access/projects/access-setup/PLAN.md §2): one row per head token naming its parts, seats, grid, actions, recorders and member tokens. Written only by migrations; every write is validated by iam.access_setup_check. Read by iam.seats_of, iam.part_level, iam.may_act and (from step 5) the kernel arm.';
alter table iam.access_setup enable row level security;
revoke all on iam.access_setup from public, anon, authenticated, service_role;
grant select on iam.access_setup to service_role;

insert into platform.entity_types (token, schema_name, table_name, label, audit_class, audit_class_reason, table_ref)
values ('iam_access_setup', 'iam', 'access_setup', 'Access setup', 'machinery',
        'machinery: the access-setup declaration register (one row per head token) the seat and part functions and the kernel arm read; written only by migrations, no grant to any API role — a generated policy over the access system''s own input is the 42P17 loop db-rules §6d names',
        'iam.access_setup'::regclass);

-- ── 2. the per-record changes table (an entity table: organization_id NOT NULL, RLS via iam.apply_rls) ──
do $$
begin
  perform platform.create_entity_table(
    p_schema => 'iam', p_table => 'record_seat_change',
    p_token => 'iam_record_seat_change', p_label => 'Record seat change',
    p_fields => array[
      $f$entity_type text NOT NULL CHECK (btrim(entity_type) <> '')$f$,
      'record_id uuid NOT NULL',
      $f$seat_key text NOT NULL CHECK (btrim(seat_key) <> '')$f$,
      'user_id uuid NOT NULL REFERENCES iam.users(id)',
      $f$change text NOT NULL CHECK (change IN ('add','exclude'))$f$,
      'reason text',
      'changed_by uuid REFERENCES iam.users(id)',
      'changed_at timestamptz NOT NULL DEFAULT now()',
      'archived_by uuid REFERENCES iam.users(id)'
    ],
    p_variant => 'entity', p_versioned => false, p_soft_delete => true,
    p_visibility => 'none', p_category => false, p_listed => false,
    p_org_default => false, p_gin_jsonb => false, p_parents => null);
end $$;
-- archive = the base contract's deleted_at (the plan's archived_at); archived_by names who archived it
create unique index record_seat_change_one_active
  on iam.record_seat_change (entity_type, record_id, seat_key, user_id) where deleted_at is null;
create index record_seat_change_record on iam.record_seat_change (entity_type, record_id) where deleted_at is null;
create index record_seat_change_user on iam.record_seat_change (user_id, entity_type) where deleted_at is null;
-- user_id names the person the change is about, not who made it (changed_by / created_by)
insert into meta.audit_exemption (check_name, schema_name, table_name, reason, organization_id, metadata)
values ('legacy_owner_col', 'iam', 'record_seat_change',
        'subject column: user_id is the person added to or excluded from a seat; created_by/changed_by is who made the change',
        '39c38960-d30c-4840-b0c1-c9960de95582',
        jsonb_build_object('ruling', 'Arman 2026-10-06: keep user_id where it names who the row is about', 'columns', jsonb_build_array('user_id')));
comment on table iam.record_seat_change is
  'Per-record seat changes made in the access-setup panel (PLAN.md §3): add or exclude one person on one seat of one record. Archive only (deleted_at + archived_by). Written only through iam.record_seat_set.';
-- doors only (like hr.review): written through iam.record_seat_set, read through iam.seat_holders.
-- Organization class (Confidential needs Arman). The provisioner grants no client table privilege
-- (verified after apply: only postgres and service_role hold any), so no REVOKE runs here — each one
-- re-runs the whole-schema door pass while this transaction holds the iam.users FK lock.

