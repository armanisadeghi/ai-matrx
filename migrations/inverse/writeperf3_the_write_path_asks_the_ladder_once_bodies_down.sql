-- additive: yes
--
-- chair-step: THE THREE BODIES of the inverse of
--   writeperf3_the_write_path_asks_the_ladder_once.sql, and nothing else — no trigger is
--   touched, so running this file takes no lock on any table.
--
--   IT IS A SEPARATE FILE FOR ONE MEASURED REASON. The full inverse drops three triggers on
--   each of fourteen tables, which needs ACCESS EXCLUSIVE on all fourteen; run from inside a
--   harness transaction that has already written five thousand records, that is a lock
--   UPGRADE, and against the eight other lanes landing migrations on this database tonight it
--   deadlocked on four consecutive attempts (`platform.entity_grants`,
--   `platform.entity_relationships`, `platform.entity_types` — always a peer holding one of
--   them and waiting on `platform.associations`, which the harness already held).
--   `scripts/campaign-tests/writeperf3_five_thousand.sql` reads this file instead and drops by
--   hand only the four triggers its own workload can fire — the three on `custom.record` and
--   the one on `platform.associations`. The other twelve tables are never written by that
--   workload, so their triggers never fire and leaving them changes no number.
--
--   The FULL inverse — `writeperf3_the_write_path_asks_the_ladder_once_down.sql` — reads this
--   file too, and is what `scripts/campaign-tests/writeperf3_red.sql` and
--   writeperf3_parity.sql run, because proving the triggers are gone is the whole point there.

CREATE OR REPLACE FUNCTION custom.assert_store_door(p_organization_id uuid, p_door text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_owner oid;
  v_who   name := custom.caller_role();
begin
  -- The switch is a PRODUCT switch and never the security boundary (§6 fact two's REVOKEs
  -- are). While it resolves false the store belongs to the campaign that owns it, and the
  -- only legitimate writer is the role that owns custom.record.
  if custom.store_is_open(p_organization_id) then
    return;
  end if;

  -- Read the owner from the catalogue, never as a role literal (rule 15), so the door
  -- cannot drift from the table it guards.
  select c.relowner into v_owner from pg_class c where c.oid = 'custom.record'::regclass;
  if pg_has_role(v_who, v_owner, 'member') then
    return;
  end if;

  raise exception 'The custom data store is switched off, so % is not taking writes from "%".',
    coalesce(nullif(btrim(p_door), ''), 'it'), v_who
    using errcode = '42501',
          hint = 'custom/system_enabled resolves false. While it does, this store takes writes only from the role that owns custom.record - through every door, including this one. The switch checklist turns the knob on; a lane never does. Nothing here skips a check while the switch is off: it is a closed door, not a quiet one.';
end;
$function$;

CREATE OR REPLACE FUNCTION custom.assert_client_may_reach(p_organization_id uuid, p_door text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_owner oid;
  v_who   name := custom.caller_role();
begin
  -- The campaign's own lanes run as the role that owns the store. Read the owner from the
  -- catalogue, never as a role literal (rule 15), so this cannot drift from the table.
  select c.relowner into v_owner from pg_class c where c.oid = 'custom.record'::regclass;
  if pg_has_role(v_who, v_owner, 'member') then
    return;
  end if;

  if p_organization_id is null then
    raise exception 'custom: % was called without an organization, and the store is keyed (organization_id, id).',
      coalesce(nullif(btrim(p_door), ''), 'that door')
      using errcode = '22004',
            hint = 'Name the organization you are working in. A door that took null would be a door onto every organization at once.';
  end if;

  if iam.has_org_access(p_organization_id) then
    return;
  end if;

  -- VIS-31 / PORTAL (2026-09-20). A live portal principal of THIS organization may reach its
  -- doors. Not because she is a member — she is not, and nothing here says she is — but
  -- because the organization named her, through a portal, as somebody whose own records live
  -- here. The next line of every door is the ladder, and she holds exactly one grant.
  -- THE SWITCH, NAMED HERE AS WELL AS INSIDE `custom.portal_admits`. Not belt and braces:
  -- the rule that lets this file name production requires the body it replaces to READ the
  -- knob that holds it off, and that rule is right — a switch a body never reads is a
  -- comment, not a switch. It costs nothing, because this line is only reached after
  -- membership has already said no. (`#>> '{}'`, not `#>> '{value}'`: `platform.knob_resolve`
  -- answers a BARE jsonb scalar, and the other spelling reads null forever — W2-TRUST's own
  -- defect, found by its suite before it shipped.)
  if coalesce((platform.knob_resolve('custom', 'external_principal_enabled', p_organization_id) #>> '{}')::boolean, false)
     and custom.portal_admits(p_organization_id) then
    return;
  end if;

  raise exception 'You are not a member of that organization, so % has nothing to do there.',
    coalesce(nullif(btrim(p_door), ''), 'that door')
    using errcode = '42501',
          hint = 'REC-29 / T15: organizations are hard walls, and a door decides who may reach one before it decides anything else. Switch to an organization you belong to, or ask an owner of that one to add you.';
end $function$;

CREATE OR REPLACE FUNCTION custom.assert_may_know_table(p_organization_id uuid, p_table_id uuid, p_door text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me   uuid;
  v_pred text;
  v_any  boolean := false;
begin
  -- The wall first, always, and in the same order every other door asks it.
  perform custom.assert_client_may_reach(p_organization_id, p_door);

  -- WAY THROUGH 1: the Table record itself. Unchanged — this is the whole of what this
  -- function used to be, and it is still the answer under the shipped setting.
  if custom.query_is_store_owner() then
    return;
  end if;
  v_me := custom.query_principal();
  if v_me is null or p_table_id is null then
    return;
  end if;
  if custom.has_visibility(v_me, 'record', p_table_id, 'viewer'::public.permission_level) then
    return;
  end if;

  -- WAY THROUGH 2: anything IN it that she may see. The same ladder, asked set-wise over the
  -- table's own partition and stopped at the first row.
  v_pred := custom.visible_predicate_sql(v_me, p_organization_id, p_table_id,
                                         'viewer'::public.permission_level, 'r');
  execute format(
    'select exists (select 1 from custom.record r
                     where r.organization_id = %L::uuid
                       and r.table_id = %L::uuid
                       and r.deleted_at is null
                       and (%s)
                     limit 1)', p_organization_id, p_table_id, v_pred)
    into v_any;
  if v_any then
    return;
  end if;

  -- NEITHER. T10's refusal, word for word — and it is now true when it is said: there is
  -- nothing in this table she may see, so telling her it exists would be the leak.
  raise exception 'You do not have access to this table, so % has nothing to show you.',
    coalesce(nullif(btrim(p_door), ''), 'that door')
    using errcode = '42501',
          hint = 'VIS-5 / T10: you know a table if you may open the table itself, or if anything in it has been shared with you. Ask whoever owns it to share the table, or a record in it, with you.';
end;
$function$;
