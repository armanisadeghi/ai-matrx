-- chair-step: it calls `platform.reopen_declared_doors('custom')` so the four doors it declares actually reach a
--   signed-in caller — a GRANT, which the additive allow-list refuses by name. Everything else is five NEW
--   functions and four rows in platform.client_callable_door; no existing function is replaced and no rule about
--   retention or pruning moves — every one of them stays in schema history, which stays closed.
-- guard: custom/system_enabled
--
-- STORE-REL 6 — T14. THE PRUNING HALF, ASKABLE.
--
-- THE DEFECT. T14 is *"a light Table at the retention floor of thirty days; an organization
-- attempting to set retention to ten days is refused; merge two of its records; sixty days
-- later, undo the merge — it works, and the pruned value history is the only thing missing."*
-- The rules are all built and all correct. NONE of them could be ASKED from a client seat:
-- `history.prune`, `history.retention_set`, `history.retention_floor_raise`,
-- `history.retention_days` and `history.retention_floor_days` are all in schema `history`,
-- which is declared closed, and none of them decides a caller. The fourth pass recorded the
-- test as *"half PASS, half unaskable"* for exactly that.
--
-- THE DOORS, at the organization rung. Retention is not an edit to a record: it decides how
-- long EVERY record in a Table keeps its past, and pruning destroys history. Both are an
-- organization's decision, so both ask for an owner or an admin of the organization — the
-- same sentence and the same helper `custom.visibility_as_of` already uses for the audit
-- question. Reading what retention IS asks only that the caller may know the Table exists.
--
-- Schema `history` stays closed. These are the declared reach into it, which is what its own
-- exposure row already says: *"Every client reach into it is through a declared door in
-- schema custom."*
--
-- NOTHING ABOUT THE RULES MOVES. The thirty-day floor, the refusal wording, the two-most-
-- recent-versions policy, HIS-4's refusal to prune the Migration log and the guard that a
-- row a Migration names is never a prune candidate are all untouched — they live in
-- `history.prune` and `history.retention_set`, and these doors call them.
--
-- INVERSE: migrations/inverse/storerel_pruning_can_be_asked_for_down.sql

set lock_timeout = '3s';
set statement_timeout = '2min';

create or replace function custom.assert_organization_admin(p_organization_id uuid, p_door text, p_what text)
returns void
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  v_me uuid := custom.query_principal();
begin
  perform custom.assert_client_may_reach(p_organization_id, p_door);
  if custom.query_is_store_owner() then
    return;
  end if;
  if v_me is not null and public.is_org_admin_for(v_me, p_organization_id) then
    return;
  end if;
  raise exception 'Only an owner or admin of this organization can %.', p_what
    using errcode = '42501',
          hint = 'VIS-20 / HIS-3: this is an organization-wide decision, not an edit to one record - it changes what every record in this organization keeps, or destroys what they have kept. Being able to edit the records is not the same permission. Ask an owner or an admin of this organization.';
end;
$function$;

comment on function custom.assert_organization_admin(uuid, text, text) is
  'VIS-20. The organization rung of the one ladder, for decisions that are the organization''s rather than a record''s.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- READ: what this store keeps, and for how long
-- ─────────────────────────────────────────────────────────────────────────────────────────
create or replace function custom.history_retention(p_organization_id uuid, p_table_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_floor integer;
  v_days  integer;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.history_retention');
  if p_table_id is not null then
    perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.history_retention');
  end if;

  v_floor := history.retention_floor_days(p_organization_id);
  if p_table_id is not null then
    v_days := history.retention_days(p_organization_id, p_table_id);
  end if;

  return jsonb_build_object(
    'organization_id', p_organization_id,
    'table_id',        p_table_id,
    'floor_days',      v_floor,
    'table_days',      v_days,
    'says', case when p_table_id is null
                 then format('History here is kept for at least %s days.', v_floor)
                 else format('This table keeps its history for %s days, and the floor for this organization is %s.', v_days, v_floor)
            end);
end;
$function$;

comment on function custom.history_retention(uuid, uuid) is
  'HIS-3 / T14. What this organization''s history floor is, and what one Table keeps.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- SET: a Table's retention, and the organization's floor
-- ─────────────────────────────────────────────────────────────────────────────────────────
create or replace function custom.history_retention_set(p_organization_id uuid, p_table_id uuid, p_days integer)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
begin
  perform custom.assert_organization_admin(p_organization_id, 'custom.history_retention_set',
                                           'change how long a table keeps its history');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.history_retention_set');
  perform custom.assert_store_door(p_organization_id, 'custom.history_retention_set');
  -- The refusal T14 names - "History here is kept for at least 30 days, so this table cannot
  -- keep only 10" - is `history.retention_set`'s own sentence, unchanged. This door only
  -- decides who may ask.
  return history.retention_set(p_organization_id, p_table_id, p_days);
end;
$function$;

create or replace function custom.history_retention_floor_raise(p_organization_id uuid, p_days integer)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
begin
  perform custom.assert_organization_admin(p_organization_id, 'custom.history_retention_floor_raise',
                                           'raise how long this organization keeps its history');
  perform custom.assert_store_door(p_organization_id, 'custom.history_retention_floor_raise');
  -- HIS-3: thirty is the platform minimum and an organization may only ever RAISE it. That
  -- rule lives in history.retention_floor_raise and is untouched here.
  return history.retention_floor_raise(p_organization_id, p_days);
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- PRUNE: the half T14 could not ask at all
-- ─────────────────────────────────────────────────────────────────────────────────────────
create or replace function custom.history_prune(
  p_organization_id uuid,
  p_scope           text    default 'values',
  p_table_id        uuid    default null,
  p_dry_run         boolean default true)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
begin
  perform custom.assert_organization_admin(p_organization_id, 'custom.history_prune',
                                           'prune this organization''s history');
  if p_table_id is not null then
    perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.history_prune');
  end if;
  perform custom.assert_store_door(p_organization_id, 'custom.history_prune');
  -- EVERY RULE STAYS WHERE IT IS. HIS-4's refusal to prune the Migration log, the
  -- two-most-recent-versions policy, the retention cutoff and the guard over any row the
  -- Migration log names are all `history.prune`'s, and it answers with what it would take
  -- when p_dry_run is true - which is the shape T14's sixty-days-later clause needs.
  return history.prune(p_organization_id, p_scope, p_table_id, p_dry_run);
end;
$function$;

comment on function custom.history_prune(uuid, text, uuid, boolean) is
  'HIS-3 / HIS-4 / T14. Pruning value or structure history, at the organization rung, with the dry run that says what it would take.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   signed_in_callers, anonymous_callers)
values
  ('custom', 'history_retention', 'p_organization_id uuid, p_table_id uuid',
   array['uuid'::regtype, 'uuid'::regtype]::oid[],
   'A person cannot be told "History here is kept for at least 30 days" by a refusal and then have no way to ask what it actually is. p_organization_id is never NULL; when p_table_id is given it is decided at viewer through custom.has_visibility, so a Table the caller may not know exists answers nothing about itself.',
   'migrations/campaign/storerel_pruning_can_be_asked_for.sql',
   true, false),
  ('custom', 'history_retention_set', 'p_organization_id uuid, p_table_id uuid, p_days integer',
   array['uuid'::regtype, 'uuid'::regtype, 'integer'::regtype]::oid[],
   'T14 opens with an organization attempting to set retention to ten days and being refused, and that attempt could not be made from a client seat at all. p_organization_id is never NULL and the caller must be an owner or admin of it; p_table_id is decided at viewer through custom.has_visibility. The thirty-day floor and its refusal are history.retention_set''s own and are unchanged.',
   'migrations/campaign/storerel_pruning_can_be_asked_for.sql',
   true, false),
  ('custom', 'history_retention_floor_raise', 'p_organization_id uuid, p_days integer',
   array['uuid'::regtype, 'integer'::regtype]::oid[],
   'Raising the floor is the one direction HIS-3 allows, and it was reachable only by the database owner. p_organization_id is never NULL and the caller must be an owner or admin of it.',
   'migrations/campaign/storerel_pruning_can_be_asked_for.sql',
   true, false),
  ('custom', 'history_prune', 'p_organization_id uuid, p_scope text, p_table_id uuid, p_dry_run boolean',
   array['uuid'::regtype, 'text'::regtype, 'uuid'::regtype, 'boolean'::regtype]::oid[],
   'T14''s second half - sixty days later, what has been pruned and what can still be undone - could not be asked from a client seat at all. p_organization_id is never NULL and the caller must be an owner or admin of it, because pruning destroys history for every record in the table; p_table_id, when given, is decided at viewer through custom.has_visibility. HIS-4 (the Migration log is never pruned) and the two-most-recent-versions policy are history.prune''s own rules and are unchanged.',
   'migrations/campaign/storerel_pruning_can_be_asked_for.sql',
   true, false)
on conflict (schema_name, function_name, identity_argtypes) do nothing;

select * from platform.reopen_declared_doors('custom');
