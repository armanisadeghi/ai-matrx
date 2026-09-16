-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- THE OBJECT LOCK'S OBJECT — `campaign_watch.build_lock`.
--
-- WHY THIS FILE EXISTS
-- -------------------
-- BUILD-BOOK §4.7 prints this table and then makes TAKE / CHECK / RELEASE the entry
-- condition of NINETEEN lane-holds — twelve on `LOCK:custom`, four on `LOCK:platform`,
-- three on `LOCK:iam`. The table existed in no file and on no database: `campaign_watch`
-- held exactly one table (`cron_pause`, created by the cron guard's own `create schema
-- if not exists`) on the branch, and on production the SCHEMA did not exist at all
-- (measured 2026-09-16). So `W1-STORE`, the campaign's FIRST DDL lane, would have run its
-- TAKE at H+6.50 and got `relation "campaign_watch.build_lock" does not exist`; rule 17
-- forbids it guessing, rules 5 and 29 forbid it creating the table by hand outside a file
-- in `migrations/`, and a compliant fleet therefore halts at its first DDL lane.
--
-- WHY IT IS NOT AN ENTITY TABLE
-- -----------------------------
-- `platform.create_entity_table` + `iam.apply_rls` is the contract for a table that holds
-- a TENANT's rows. This holds neither: it is campaign machinery with a 59-hour life, keyed
-- by lock name, written and read only by the lanes and the chair through the same
-- privileged connection the runner uses. It carries no `organization_id`, is never exposed
-- through PostgREST (schema `campaign_watch` is not in `pgrst.db_schemas`), and is dropped
-- by its own down-migration when the campaign ends. Same shape and same reasoning as
-- `campaign_watch.cron_pause`, which the cron guard already creates.
--
-- WHY IT LANDS ON PRODUCTION TOO
-- ------------------------------
-- §4.14 puts each lane's production apply INSIDE the object lock it already holds, in the
-- same working session as the branch apply that proved it. A lock that exists on only one
-- of the two databases cannot serialise work that touches both. It is additive in the
-- strictest sense — a new schema and a new table nothing reads — and it changes no
-- existing object, no grant and no policy, so `custom/system_enabled` (the campaign's
-- master knob, seeded false on both databases by `custom_campaign_knob_register.sql`)
-- holds nothing off: there is no old path for this object to leave untouched.
--
-- IDEMPOTENT BY CONSTRUCTION — `if not exists` throughout, so rule 27 ("applies twice with
-- the same result") is demonstrable on both databases without running the inverse first.
-- The inverse is `custom_campaign_build_lock_down.sql`, in this same commit (§4.13).

create schema if not exists campaign_watch;

comment on schema campaign_watch is
  'Unified-data campaign machinery (2026-09). Lock rows and guard observations for the '
  'campaign''s own lanes; no tenant data, never exposed through PostgREST. Dropped by the '
  'campaign''s down-migrations when it ends.';

create table if not exists campaign_watch.build_lock (
  lock_name text primary key,          -- 'custom' | 'platform' | 'iam'
  held_by   text not null,             -- the lane id, e.g. 'W1-STORE'
  taken_at  timestamptz not null default now(),
  note      text
);

comment on table campaign_watch.build_lock is
  'BUILD-BOOK §4.7. One row per held object lock. TAKE is an `on conflict do nothing` '
  'insert that returns a row for exactly one lane and zero rows for every other — never a '
  'wait. RELEASE is a holder-scoped delete that returns nothing when the caller was not '
  'the holder. A lane whose TAKE returns zero rows reports NEEDS_CONTEXT with held_by and '
  'taken_at and waits (rule 17).';

comment on column campaign_watch.build_lock.lock_name is
  'The lock, not the object: custom -> everything in schema custom; platform -> '
  'platform.associations, platform.entity_types, platform.custom_field_*; iam -> '
  'iam.has_access_for_base, iam.accessible_entity_ids, iam.emergency_door_request and the '
  'grant surface. Lock order is custom -> platform -> iam and no lane holds two at once '
  '(§4.11).';

comment on column campaign_watch.build_lock.held_by is
  'The lane id. RELEASE is scoped to it so one lane can never release another''s lock.';
