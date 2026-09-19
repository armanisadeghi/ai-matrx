-- chair-step: custom.migrate_purge is the store's HARD delete - the one verb past retention that removes rows rather than marking them - so its body contains a `delete from custom.record`, which the additive allow-list refuses by name. This file REPLACES that function; it deletes nothing itself. What changes is the header (SECURITY DEFINER, so a client reaches it at all) and three lines at the top: the organization wall, then ADMIN on the Table on the one ladder, before the existing switch check that was already there. The `delete` statement below is the one that was already live, byte for byte, and it still only runs past the Table's own retention window and only when custom/system_enabled is on for that organization. Its default is a DRY RUN.
--
-- REACH - THE PURGE VERB IS REACHABLE, AND IT ASKS FOR ADMIN.
--
-- An organization that asks for something to be really deleted must be able to
-- finish that themselves. Until now custom.migrate_purge was the one verb of the
-- ten that no client could call, so "we deleted it for good" needed somebody with a
-- database connection. It now takes ADMIN on the Table on the one ladder
-- (custom.has_visibility), on top of the store's switch, and it still defaults to
-- p_dry_run = true, which reports what it WOULD remove and removes nothing.
--
-- THE INVERSE: migrations/inverse/reach_the_purge_verb_is_reachable_down.sql.

-- based-on: custom.migrate_purge(uuid, uuid, boolean) 5bddf7d9260e5c0cbb234d318a4d6fabe3a499269f8a4352a528f28b8e63e7db

set lock_timeout = '5s';
set statement_timeout = '600s';

CREATE OR REPLACE FUNCTION custom.migrate_purge(p_organization_id uuid, p_table_id uuid DEFAULT NULL::uuid, p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_days   integer;
  v_cutoff timestamptz;
  v_count  bigint := 0;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.migrate_purge');
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.migrate_purge', 'admin'::public.permission_level, 'table');
  perform custom.assert_store_door(p_organization_id, 'custom.migrate_purge');

  -- THE GUARD, NAMED AND READ IN THE BODY (§6b.2), and this is the one verb in the file that
  -- earns it: every other verb here is reversible from History, and this one is the hard
  -- delete. While `custom/system_enabled` resolves false the store belongs to the campaign
  -- that owns it, and nothing outside that campaign destroys a row in it.
  if not coalesce((platform.knob_resolve('custom', 'system_enabled', p_organization_id) #>> '{}')::boolean, false)
     and not pg_has_role(custom.caller_role(),
                         (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass),
                         'member') then
    raise exception 'The custom data store is switched off, so nothing was purged.'
      using errcode = '42501',
            hint = 'custom/system_enabled resolves false and this caller does not own custom.record. Nothing was destroyed. The switch checklist turns the knob on; a caller never does.';
  end if;

  if p_organization_id is null then
    raise exception 'custom.migrate_purge: which organization''s deleted records?'
      using errcode = '22004',
            hint = 'REC-23: retention is resolved per organization, so a purge that spanned organizations would apply one organization''s window to another''s data.';
  end if;

  -- The window is the TABLE'S retention, read through W3-HIST's one reader, which never
  -- answers below the organization's floor. A deleted record is reversible for exactly as
  -- long as its Table says, and this function is the only thing that ends that.
  v_days := case when p_table_id is null
                 then history.retention_floor_days(p_organization_id)
                 else history.retention_days(p_organization_id, p_table_id) end;
  v_cutoff := now() - make_interval(days => v_days);

  with doomed as (
    select r.id
      from custom.record r
     where r.organization_id = p_organization_id
       and r.deleted_at is not null
       and r.deleted_at < v_cutoff
       and (p_table_id is null or r.table_id = p_table_id)
       -- REC-21: an id that resolves to a surviving record is never purged, whatever its age.
       -- Hard-deleting a merge loser would break "the losing id resolves to the winner
       -- forever" sixty days after the merge, silently, which is the worst time for it.
       and not exists (select 1 from custom.record_alias a
                        where a.organization_id = r.organization_id and a.old_id = r.id)
  ),
  gone as (
    delete from custom.record c
     using doomed d
     where not p_dry_run and c.organization_id = p_organization_id and c.id = d.id
    returning 1
  )
  select case when p_dry_run then (select count(*) from doomed)
              else (select count(*) from gone) end
    into v_count;

  return jsonb_build_object(
    'function', 'custom.migrate_purge',
    'organization_id', p_organization_id, 'table_id', p_table_id,
    'retention_days', v_days, 'cutoff', v_cutoff,
    'policy', 'a soft-deleted record is destroyed only after its Table''s retention, and never while an id still resolves to it (REC-21)',
    'dry_run', p_dry_run, 'rows_purged', v_count, 'at', now());
end;
$function$;


-- ── THE DOORS, DECLARED IN THE SAME TRANSACTION AS THE BODIES ────────────────
-- Schema `custom` never issues a raw GRANT. A function becomes reachable by
-- declaring a row in `platform.client_callable_door` that says who may knock and
-- why, and then asking `custom.reopen_declared_doors()` to make the catalogue
-- match the declaration; the grant is a consequence of the row, never a decision
-- of its own. The declaration is in THIS transaction because it has to be:
-- `provision_shape_guard` refuses to let a SECURITY DEFINER function reach COMMIT
-- with no access decision declared in data, and `door_body_must_decide` refuses a
-- row whose function's body does not actually decide. The two guards meet here.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, declared_by, reason)
select 'custom',
       p.proname,
       pg_get_function_identity_arguments(p.oid),
       platform.door_argtypes(p.proargtypes),
       true,
       false,
       'migrations/campaign/reach_the_purge_verb_is_reachable.sql (lane REACH)',
       v.reason
  from (values
  ('migrate_purge', 'The hard delete past retention. It is reachable so that an organization can actually finish a deletion it asked for, and it takes ADMIN on the Table plus the store''s own switch, and it defaults to a dry run that only reports what it would remove.')
  ) as v(fname, reason)
  join pg_proc p
    on p.pronamespace = 'custom'::regnamespace
   and p.proname = v.fname
on conflict (schema_name, function_name, identity_argtypes) do nothing;

-- The grant follows from the declaration, and only from the declaration.
select custom.reopen_declared_doors();
