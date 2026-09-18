-- target: branch,production
-- additive: yes
-- guard: custom/row_versions_guard
--
-- W3-HIST, part two — HIS-2, HIS-3 and HIS-4: retention is the knob, the floor is a platform
--                     setting an organization may raise and never lower, and the Migration
--                     log is the one thing no Table can prune.
--
-- WHAT WAS ALREADY TRUE, AND WHAT A SECOND KNOB WOULD HAVE COST
-- ------------------------------------------------------------
-- HIS-3's floor ALREADY EXISTS on production and on the branch, and it is not this lane's to
-- invent: `platform.feature_knob` row `extensibility` / `user_tables.history_retention_floor_days`
-- — default 30, `min_value` 30, `max_value` 3650, `overridable_by {organization}`,
-- `override_direction raise_only` (read on both databases 2026-09-18). `platform.knob_resolve`
-- walks the rungs OUTWARD and DISCARDS an organization value that loosens a `raise_only`
-- knob, and clamps anything under `min_value`. So "raisable by an organization and never
-- lowerable" is enforced by the ladder itself, in the shared layer, for every reader.
--
-- Seeding a second `history/retention_floor_days` here would have given the platform two
-- floors that could disagree — and the live trim
-- `public.udt_dataset_row_versions_trim_scoped` reads the FIRST one, so the disagreement
-- would have been invisible until somebody's history was deleted under Arman's ruled floor.
-- This file therefore adds NO new floor knob. It adds the three things that did not exist:
-- the floor as a NAMED READ over schema `history`, the refusal a person actually meets when
-- they try to lower it, and the first prune schema `history` has ever had.
--
-- PER-TABLE RETENTION IS A PROPERTY OF THE TABLE, NOT A THIRD KNOB (HIS-2, REC-1)
-- ------------------------------------------------------------------------------
-- REC-1 already says a Table declares `retention` among its properties, and a Table is a row
-- in `custom.record` with `data_class = 'table'`. So retention is written into the Table's own
-- document, through `custom.record_update` — the one write path, with its optimistic
-- concurrency — and is therefore covered by History, by Visibility and by Migration with no
-- second mechanism, exactly like every other property a Table has. A knob rung would have put
-- one of a Table's properties somewhere none of the others live.
--
-- RETENTION IS HOW LONG, NEVER WHETHER (HIS-1)
-- --------------------------------------------
-- `history.retention_set` refuses zero, refuses a negative, refuses null and refuses anything
-- below the organization's floor — each by name, each with the remedy. There is no value of
-- `retention` that means "stop recording", which is what makes HIS-1's "nothing can opt out"
-- a property of the surface rather than a promise in a comment.
--
-- THE MIGRATION LOG (HIS-4, and the storage half of HIS-8)
-- -------------------------------------------------------
-- `history.migration_log` holds one row per logged Migration with the INVERSE stored at the
-- time of the Migration — which is the only way HIS-8's "a logged Migration is undoable from
-- History" can be true, since the inverse of a retype cannot be reconstructed from a row that
-- no longer holds the old values. W3-MIG builds the nine verbs; this lane builds the storage
-- and (part three) the undo primitive they are recorded through.
--
-- It is NOT a second history mechanism: WHAT CHANGED is in `history.row_versions` like every
-- other change, and the log holds only the verb's name, its target and its inverse, pointing
-- at the row-version ids the Migration produced. `history.prune` refuses it by name.

set lock_timeout = '5s';
set statement_timeout = '300s';

-- ─────────────────────────────────────────────────────────────────────────────
-- THE FLOOR — one named read, over the knob that already exists.
-- ─────────────────────────────────────────────────────────────────────────────
create function history.retention_floor_days(p_organization_id uuid default null)
returns integer
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_days integer;
begin
  begin
    v_days := (platform.knob_resolve('extensibility', 'user_tables.history_retention_floor_days',
                                     p_organization_id) #>> '{}')::integer;
  exception when others then
    -- §6b.4b: `platform.knob_resolve` is SECURITY INVOKER and a role that merely cannot SEE
    -- the registry row raises P0001, which reads like a missing knob and is not one. A floor
    -- this reader cannot resolve is the PLATFORM floor, never no floor.
    raise warning 'history.retention_floor_days: the retention floor could not be resolved for organization % — using the platform floor of 30 days. Remedy: grant SELECT on platform.feature_knob to the role doing this read, or call this from a definer that already has it.', p_organization_id;
    v_days := 30;
  end;

  -- The same sentence the live trim already says, kept word for word so two readers of one
  -- floor cannot drift into two different remedies.
  if v_days is null or v_days < 30 then
    raise warning 'history.retention_floor_days: organization % resolved a % day history floor, below the platform floor of 30 — using 30 instead. Remedy: the floor is raise-only; clear that organization''s override of extensibility.user_tables.history_retention_floor_days, or raise the registry min_value deliberately.',
      p_organization_id, v_days;
    v_days := 30;
  end if;

  return v_days;
end;
$fn$;

comment on function history.retention_floor_days(uuid) is
  'HIS-3: the retention floor in days for one organization — the platform setting extensibility.user_tables.history_retention_floor_days, default 30, raisable by an organization and never lowerable (the knob is override_direction raise_only and min_value 30). This lane adds no second floor: two floors that can disagree is how history gets deleted under a ruled minimum.';

-- ─────────────────────────────────────────────────────────────────────────────
-- RAISING IT — and the refusal, which is the half a person actually meets.
-- ─────────────────────────────────────────────────────────────────────────────
create function history.retention_floor_raise(p_organization_id uuid, p_days integer)
returns integer
language plpgsql
volatile
set search_path to 'pg_catalog'
as $fn$
declare
  v_current integer := history.retention_floor_days(p_organization_id);
  v_result  jsonb;
begin
  if p_organization_id is null then
    raise exception 'history.retention_floor_raise: which organization''s floor is being raised?'
      using errcode = '22004';
  end if;
  if p_days is null then
    raise exception 'A retention floor has to be a number of days, and this one says nothing.'
      using errcode = '22004',
            hint = 'HIS-3: the floor is how long history is kept at the very least. It is never "off" and never "whatever".';
  end if;

  -- THE REFUSAL, BY NAME, WITH THE REMEDY (HIS-3, rule 16). The ladder would also discard a
  -- loosening value — `platform.knob_resolve` walks the rungs outward and drops one that
  -- loosens a raise_only knob — but it does that with a WARNING, after the row is written,
  -- which is a person believing they changed something they did not. The door refuses first.
  if p_days < v_current then
    raise exception 'History here is kept for at least % days, so it cannot be cut to %.', v_current, p_days
      using errcode = '23514',
            hint = format('HIS-3: the retention floor only ever goes UP. This organization is at %s days and the platform''s own minimum is 30. Raise it to anything above %s, or leave it where it is — there is no way to lower it, and that is deliberate: history somebody already relied on does not disappear because a setting was changed afterwards.', v_current, v_current);
  end if;
  if p_days = v_current then
    return v_current;
  end if;
  if p_days > 3650 then
    raise exception 'A retention floor of % days is longer than this store keeps anything (3650 days, ten years).', p_days
      using errcode = '23514',
            hint = 'HIS-3: the registry''s max_value for extensibility.user_tables.history_retention_floor_days is 3650. Ask for a longer ceiling deliberately rather than writing a number the resolver would clamp behind your back.';
  end if;

  -- THE ONE DOOR. `platform.knob_override_set` carries this ladder''s permission gate and its
  -- audit row (DD-221: a door does one thing). This function is the LAW — the refusal above —
  -- and never a second writer standing beside it.
  v_result := platform.knob_override_set('extensibility', 'user_tables.history_retention_floor_days',
                                         'organization', p_organization_id, p_organization_id,
                                         to_jsonb(p_days),
                                         'HIS-3: retention floor raised through history.retention_floor_raise');
  if not coalesce((v_result ->> 'ok')::boolean, false) then
    raise exception 'The retention floor was not changed: %', coalesce(v_result ->> 'detail', v_result ->> 'reason', 'the settings door refused it')
      using errcode = '42501',
            hint = 'HIS-3: organization configuration is owner/admin only, and the value is written through the settings ladder so the change is audited. Nothing was written.';
  end if;

  return p_days;
end;
$fn$;

comment on function history.retention_floor_raise(uuid, integer) is
  'HIS-3: raise one organization''s retention floor. A lowering is REFUSED by name with the remedy before anything is written — the ladder would merely discard it with a warning after the fact, which is a person believing they changed something they did not.';

-- ─────────────────────────────────────────────────────────────────────────────
-- PER-TABLE RETENTION — REC-1's property, in the Table's own document.
-- ─────────────────────────────────────────────────────────────────────────────
create function history.retention_days(p_organization_id uuid, p_table_id uuid)
returns integer
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_floor integer := history.retention_floor_days(p_organization_id);
  v_declared integer;
begin
  select nullif(t.data ->> 'retention', '')::integer into v_declared
    from custom.record t
   where t.organization_id = p_organization_id
     and t.id = p_table_id
     and t.data_class = 'table';

  if v_declared is null then
    return v_floor;
  end if;

  -- A Table that somehow holds a number under the floor is told about, and the floor wins.
  -- Silence here would be history deleted under a ruled minimum.
  if v_declared < v_floor then
    raise warning 'history.retention_days: table % declares % days and this organization''s floor is % — keeping % days. Remedy: history.retention_set(organization, table, days) refuses anything below the floor; this row predates that door or was written around it.',
      p_table_id, v_declared, v_floor, v_floor;
    return v_floor;
  end if;

  return v_declared;
end;
$fn$;

comment on function history.retention_days(uuid, uuid) is
  'HIS-2: how long one Table''s value history is kept — the Table''s own `retention` property (REC-1), never below the organization''s floor. Retention is the per-Table knob; existence is not.';

create function history.retention_set(p_organization_id uuid, p_table_id uuid, p_days integer)
returns integer
language plpgsql
volatile
set search_path to 'pg_catalog'
as $fn$
declare
  v_floor integer;
  v_kind  text;
begin
  if p_organization_id is null or p_table_id is null then
    raise exception 'history.retention_set: the organization and the table are both required — the store is keyed (organization_id, id).'
      using errcode = '22004';
  end if;

  select r.data_class into v_kind
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_table_id;
  if v_kind is null then
    raise exception 'There is no table % in this organization.', p_table_id
      using errcode = '02000', hint = 'Nothing was changed.';
  end if;
  if v_kind <> 'table' then
    raise exception 'Retention is set on a table, and % is a %.', p_table_id, v_kind
      using errcode = '22023',
            hint = 'HIS-2: retention is a property of a Table (REC-1), so every record of that table is kept for the same time. A single record does not keep its own history rule.';
  end if;

  -- HIS-1 / HIS-2: HOW LONG, never WHETHER. There is no number here that means "stop
  -- recording", and the refusal says so in those words rather than reporting a range error.
  if p_days is null or p_days <= 0 then
    raise exception 'History cannot be switched off for a table — % is not a length of time to keep it for.', coalesce(p_days::text, 'nothing')
      using errcode = '23514',
            hint = 'HIS-1 and HIS-2: everything that happens is recorded, always; what a table chooses is how LONG the record is kept, and the shortest that can be is this organization''s retention floor. Ask for the floor (history.retention_floor_days) and set that if you want the minimum.';
  end if;

  v_floor := history.retention_floor_days(p_organization_id);
  if p_days < v_floor then
    raise exception 'This table would keep its history for % days, and nothing here is kept for less than %.', p_days, v_floor
      using errcode = '23514',
            hint = format('HIS-2 / HIS-3: %s days is this organization''s retention floor. Set this table to %s or more. The floor itself only ever goes up (history.retention_floor_raise), so there is no way round this by lowering it first.', v_floor, v_floor);
  end if;

  -- THE ONE WRITE PATH. `custom.record_update` carries the door, the optimistic concurrency
  -- and the value envelope; a direct UPDATE here would be a second way into the store.
  perform custom.record_update(p_organization_id, p_table_id,
                               jsonb_build_object('retention', p_days));
  return p_days;
end;
$fn$;

comment on function history.retention_set(uuid, uuid, integer) is
  'HIS-2: set one Table''s retention, through custom.record_update — the one write path. Zero, a negative and anything below the organization''s floor are each refused by name with the remedy; there is no value that means "stop recording".';

-- ─────────────────────────────────────────────────────────────────────────────
-- THE MIGRATION LOG — HIS-4's un-prunable thing, and HIS-8's storage.
-- Deliberately carries NONE of the seven entity-shaped column names
-- (`platform._provision_shape_guard` refuses three or more outside the provisioner): this is
-- the history store's own ledger, not a tenant's table.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists history.migration_log (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references iam.organizations(id),
  verb            text        not null,
  target_kind     text        not null,
  target_id       uuid,
  inverse         jsonb       not null,
  row_version_lo  bigint,
  row_version_hi  bigint,
  applied_at      timestamptz not null default now(),
  applied_by      uuid,
  undone_at       timestamptz,
  undone_by       uuid,
  note            text
);

comment on table history.migration_log is
  'HIS-4 and HIS-8: one row per logged Migration, carrying the INVERSE stored at the time of the Migration — the only way a Migration can be undone from History later, since the inverse of a retype cannot be reconstructed from a row that no longer holds the old values. WHAT CHANGED lives in history.row_versions like every other change; this log adds the verb, the target and the undo. No Table can prune it.';

comment on column history.migration_log.inverse is
  'HIS-8: what to do to put it back, stored when the Migration ran. W3-MIG''s verbs write it; history.migration_undo reads it.';

create index if not exists migration_log_organization_id_idx
  on history.migration_log (organization_id);
create index if not exists migration_log_target_idx
  on history.migration_log (organization_id, target_kind, target_id, applied_at);

alter table history.migration_log enable row level security;

create policy migration_log_read on history.migration_log
  for select
  using ((select is_platform_admin())
         or (organization_id is not null and organization_id in (select iam.my_orgs())));

-- ─────────────────────────────────────────────────────────────────────────────
-- THE PRUNE — schema `history`'s first, and it refuses the Migration log BY NAME.
-- ─────────────────────────────────────────────────────────────────────────────
create function history.prune(p_organization_id uuid,
                                         p_scope text default 'values',
                                         p_table_id uuid default null,
                                         p_dry_run boolean default true)
returns jsonb
language plpgsql
volatile
set search_path to 'pg_catalog'
as $fn$
declare
  v_days     integer;
  v_cutoff   timestamptz;
  v_count    bigint := 0;
  v_started  timestamptz := clock_timestamp();
begin
  -- HIS-4, AND IT IS THE FIRST THING THIS FUNCTION DOES. No argument, no organization, no
  -- table and no privilege reaches past this line.
  if p_scope = 'migration_log' then
    raise exception 'The Migration log is never pruned — not by a table, not by an organization, not by this function.'
      using errcode = '0A000',
            hint = 'HIS-4: every structural change ever made here stays on the record permanently, which is what makes an old Migration undoable at all (HIS-8) and what lets anybody ask what this data used to look like. Value history is what retention shortens: call this with ''values'', or with ''structure'' for the definitions'' own version rows. If the log has grown beyond what this database should hold, that is a capacity decision for a person, not a prune a caller may ask for.';
  end if;

  if p_scope is null or p_scope not in ('values', 'structure') then
    raise exception 'history.prune: % is not something this store prunes.', coalesce(p_scope, 'nothing')
      using errcode = '22023',
            hint = 'The scopes are ''values'' (records'' value history) and ''structure'' (Tables'', Fields'' and Rules'' own version rows). ''migration_log'' is refused by name — HIS-4.';
  end if;

  if p_organization_id is null then
    raise exception 'history.prune: which organization''s history?'
      using errcode = '22004',
            hint = 'Retention is resolved per organization, so a prune that spans organizations would apply one organization''s floor to another''s history.';
  end if;

  -- The guard, by name, through the one predicate — a prune while the campaign is switched
  -- off would delete rows nothing can currently read.
  if not history.capture_is_open(p_organization_id) then
    raise exception 'The history store is not open here, so nothing was pruned.'
      using errcode = '42501',
            hint = 'custom/row_versions_guard resolves false and this caller does not own the store. Nothing was deleted. The switch checklist turns the knob on; a caller never does.';
  end if;

  v_days := case when p_table_id is null
                 then history.retention_floor_days(p_organization_id)
                 else history.retention_days(p_organization_id, p_table_id) end;
  v_cutoff := now() - make_interval(days => v_days);

  with candidate as (
    select v.id,
           row_number() over (partition by v.row_id order by v.occurred_at desc, v.id desc) as recency_rank
      from history.row_versions v
      join custom.record r
        on r.organization_id = v.organization_id and r.id = v.row_id
     where v.entity_type = 'custom.record'
       and v.organization_id = p_organization_id
       and v.occurred_at < v_cutoff
       and (p_table_id is null or r.table_id = p_table_id)
       and (case when p_scope = 'values' then r.data_class = 'record'
                 else r.data_class <> 'record' end)
       -- HIS-4 AGAIN, AS A PREDICATE RATHER THAN AS A PROMISE: a row-version a Migration
       -- names is part of the Migration log's evidence and is never a prune candidate, even
       -- under 'values', even past retention. An undo that finds its inverse and not the
       -- rows it describes is an undo that lies.
       and not exists (select 1 from history.migration_log m
                        where m.organization_id = v.organization_id
                          and v.id between coalesce(m.row_version_lo, v.id) and coalesce(m.row_version_hi, v.id))
  ),
  doomed as (
    -- The same policy the live trim already applies to the other store: the two most recent
    -- versions of a row survive whatever retention says, so "what did this look like before
    -- the last change" is always answerable.
    select id from candidate where recency_rank > 2
  ),
  gone as (
    delete from history.row_versions
     where not p_dry_run and id in (select id from doomed)
    returning 1
  )
  select case when p_dry_run then (select count(*) from doomed)
              else (select count(*) from gone) end
    into v_count;

  return jsonb_build_object(
    'function', 'history.prune',
    'scope', p_scope,
    'organization_id', p_organization_id,
    'table_id', p_table_id,
    'retention_days', v_days,
    'cutoff', v_cutoff,
    'policy', 'keep the two most recent versions of every row, and everything inside retention; never a row the Migration log names (HIS-4)',
    'dry_run', p_dry_run,
    'rows_pruned', v_count,
    'duration_ms', extract(millisecond from (clock_timestamp() - v_started))::int,
    'at', now());
end;
$fn$;

comment on function history.prune(uuid, text, uuid, boolean) is
  'HIS-2 and HIS-4: the first prune schema history has ever had. It shortens VALUE history down to the Table''s retention and no further, keeps the two most recent versions of every row, and REFUSES the Migration log by name before it reads anything.';
