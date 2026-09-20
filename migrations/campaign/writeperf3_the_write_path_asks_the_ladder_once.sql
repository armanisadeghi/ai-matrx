-- additive: yes
--
-- chair-step: it REPLACES the live bodies of `custom.assert_store_door`,
--   `custom.assert_client_may_reach` and `custom.assert_may_know_table` — the three predicates
--   every door in the store asks before it does anything — and it CREATES the statement-level
--   triggers that empty the transaction memo when anything those three read is written.
--   Nothing is dropped, nothing is revoked, no row of anybody's data is touched. Each replaced
--   body carries a `-- based-on:` hash, so the file refuses outright if anybody has moved it.
--   The inverse is `migrations/inverse/writeperf3_the_write_path_asks_the_ladder_once_down.sql`.
--
-- based-on: custom.assert_store_door(uuid, text) 95aea3be0e8e2311f66c7399f03e602d04621641fc4a763c543382683e638f9b
-- based-on: custom.assert_client_may_reach(uuid, text) 655fc7bd3280fc215b77df4890ee114e15bc10232b47c17007638c90564c1b83
-- based-on: custom.assert_may_know_table(uuid, uuid, text) aafe0a680e59667ff6a1d6ce54ba293ee53d8752778c07284d0301fbb805542c
--
-- WRITE-PERF-3 — THE LADDER IS ASKED ONCE PER (SEAT, ORGANIZATION, TABLE), NOT ONCE PER ROW.
--
-- MEASURED ON THE MAIN DATABASE, 2026-09-20, `scripts/campaign-tests/writeperf3_profile.sql`:
-- 2,000 records written in four statements of 500 through `custom.record_write_many`, with
-- `track_functions = all`, on a throwaway organization with an Accounts Table of 10 and a Deals
-- Table of six typed columns. PER ROW WRITTEN:
--
--     custom.assert_may_know_table     11.20 calls   6.362 ms total   <- the largest single item
--     custom.applicable_fields          5.00 calls   5.889 ms total
--     custom.table_type_field           5.00 calls   4.904 ms total
--     custom.has_visibility             8.96 calls   4.864 ms total
--     custom.reaches_directly           8.96 calls   4.817 ms total
--     custom.assert_client_may_reach   22.39 calls   2.131 ms total
--     custom.assert_store_door         25.00 calls   1.660 ms total
--     custom.store_is_open             32.24 calls   1.690 ms total
--     the whole door                                23.756 ms
--
-- ELEVEN TIMES PER ROW THE WRITE PATH ASKED WHETHER THIS PERSON MAY KNOW THIS TABLE, and the
-- caller had already answered it at the door before the first row was written. Twenty-two times
-- per row it asked whether she may reach the organization. Twenty-five times per row it asked
-- whether the store is open. Not one of those answers can differ between row 1 and row 500 of
-- one statement, and none of them is about the row's own data.
--
-- WHAT THIS FILE CHANGES. The three predicates keep their bodies character for character; each
-- gains a first line that reads a YES it has already given in this transaction, and a last line
-- that records the YES it just gave. Nothing else moves.
--
-- ONLY A YES IS EVER REMEMBERED. A refusal is computed every time, from the live rows, and says
-- the same sentence about the same door it always said — so a person who is refused is refused
-- identically whether she is the first row of a batch or the five hundredth. This is not a
-- convenience: a remembered NO would be a wall that stays shut after it has been opened, and a
-- remembered YES can only ever be wrong if something REMOVES access inside one transaction,
-- which is exactly what the triggers below watch for.
--
-- WHAT EMPTIES THE MEMO, AND WHY IT IS A LIST AND A CENSUS RATHER THAN A HABIT. The three
-- predicates, and the ladder under them (`custom.has_visibility`, `custom.reaches_directly`,
-- `iam.has_access_for*`, `iam.has_org_access*`, `public.user_can_read_via_library_grant`,
-- `custom.portal_admits`), read fourteen base tables between them. EVERY ONE of those tables
-- now carries an AFTER-STATEMENT trigger that empties the memo, `platform.memo_reach_tables()`
-- declares the list, and `platform.memo_reach_unguarded()` is the census that names any table on
-- the list without the trigger. The census is 0 and a suite asserts it, so the next person who
-- teaches the ladder to read a fifteenth table is told rather than trusted.
--
-- `custom.record` IS ON THAT LIST WITH ONE DISTINCTION, AND IT IS THE WHOLE HOT PATH. An UPDATE
-- or a DELETE of a record can take access away, so those empty the memo unconditionally. An
-- INSERT cannot: a new row grants nobody anything, and a NO is never remembered — so an insert
-- empties the memo only when what it inserted was STRUCTURE (a Table, a Field or a Rule record),
-- which is the one insert that changes what the other memoised answers say. That is why five
-- thousand records arriving one INSERT at a time still ask the ladder once.
--
-- THE FENCE IS THE ONE WRITE-PERF BUILT AND IT IS NOT WIDENED. The memo is `mx_memo.v`, a single
-- transaction-local GUC set with `is_local => true`, which Postgres reverts at the end of the
-- transaction whether it commits or rolls back. The seat (role, claims, `current_user`) is part
-- of the blob and a different seat reads an empty memo. Nothing here is stored anywhere a second
-- statement, a second transaction or a second connection can see.

-- ---------------------------------------------------------------------------------------------
-- 1. THE DECLARED LIST, THE TWO TRIGGER BODIES, AND THE CENSUS.
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION platform.memo_reach_tables()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  -- EVERY BASE TABLE THE STORE'S THREE DOOR PREDICATES AND THE LADDER UNDER THEM READ. Read out
  -- of the function bodies on 2026-09-20, not remembered:
  --   custom.assert_store_door -> custom.store_is_open -> platform.knob_resolve  (knob tables
  --     already carry `platform.memo_bump`, which is why they are not repeated here)
  --   custom.assert_client_may_reach -> iam.has_org_access -> iam.memberships, iam.system_orgs
  --                                  -> custom.portal_admits -> custom.portal,
  --                                     custom.portal_principal
  --   custom.assert_may_know_table -> custom.has_visibility -> custom.reaches_directly
  --                                  -> platform.associations, platform.reachability,
  --                                     platform.entity_relationships, platform.entity_types,
  --                                     platform.rulebook, platform.entity_grants,
  --                                     iam.membership_grant, iam.org_industries,
  --                                     iam.organizations, custom.record
  select array[
    'platform.associations', 'platform.entity_grants', 'platform.entity_relationships',
    'platform.entity_types', 'platform.reachability', 'platform.rulebook',
    'iam.memberships', 'iam.membership_grant', 'iam.org_industries', 'iam.organizations',
    'iam.system_orgs', 'custom.portal', 'custom.portal_principal', 'custom.record'
  ]::text[];
$function$;

CREATE OR REPLACE FUNCTION platform.memo_clear_stmt()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  -- ONE call per STATEMENT, never one per row. Something the ladder reads has just moved, so
  -- every answer this transaction remembered about who may reach what is thrown away.
  perform platform.memo_clear();
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION platform.memo_clear_on_structure()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_hit boolean;
begin
  -- An INSERT into `custom.record` takes nothing away from anybody, and a NO is never
  -- remembered, so the ladder's answers survive it. What does NOT survive it is a Table, a
  -- Field or a Rule arriving: that changes the shape other memoised answers describe.
  select exists (select 1 from new_rows n
                  where n.table_id in (custom.table_kernel_id(),
                                       custom.field_kernel_id(),
                                       custom.rule_kernel_id()))
    into v_hit;
  if v_hit then
    perform platform.memo_clear();
  end if;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION platform.memo_reach_unguarded()
 RETURNS TABLE(relation text, what_is_missing text)
 LANGUAGE plpgsql
 STABLE
AS $function$
begin
  -- THE CENSUS. Every table `platform.memo_reach_tables()` declares must carry a statement-level
  -- trigger that empties the memo on each of insert, update and delete. `custom.record` is
  -- allowed to answer its INSERT with the structure-only trigger instead, and only that one.
  return query
  with declared as (select unnest(platform.memo_reach_tables()) as rel),
  events as (
    select d.rel, e.ev,
           exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
                    where t.tgrelid = d.rel::regclass
                      and not t.tgisinternal
                      and t.tgtype & 1 = 0                       -- statement level
                      and p.proname in ('memo_clear_stmt', 'memo_clear_on_structure')
                      and ((e.ev = 'insert' and t.tgtype & 4 = 4)
                        or (e.ev = 'delete' and t.tgtype & 8 = 8)
                        or (e.ev = 'update' and t.tgtype & 16 = 16))) as covered
      from declared d cross join (values ('insert'), ('update'), ('delete')) e(ev))
  select ev.rel, 'no statement trigger empties the memo on ' || ev.ev
    from events ev where not ev.covered
   order by 1, 2;
end;
$function$;

-- The triggers. `zz_memo_clear` sorts after the store's own guards for the same reason
-- `zz_memo_bump` does on the knob tables: emptying the memo is the last thing a statement does.
do $do$
declare
  r text;
begin
  foreach r in array platform.memo_reach_tables() loop
    if r = 'custom.record' then
      execute 'drop trigger if exists zz_memo_clear_i on ' || r;
      execute 'create trigger zz_memo_clear_i after insert on ' || r ||
              ' referencing new table as new_rows for each statement
                execute function platform.memo_clear_on_structure()';
    else
      execute 'drop trigger if exists zz_memo_clear_i on ' || r;
      execute 'create trigger zz_memo_clear_i after insert on ' || r ||
              ' for each statement execute function platform.memo_clear_stmt()';
    end if;
    execute 'drop trigger if exists zz_memo_clear_u on ' || r;
    execute 'create trigger zz_memo_clear_u after update on ' || r ||
            ' for each statement execute function platform.memo_clear_stmt()';
    execute 'drop trigger if exists zz_memo_clear_d on ' || r;
    execute 'create trigger zz_memo_clear_d after delete on ' || r ||
            ' for each statement execute function platform.memo_clear_stmt()';
  end loop;
end;
$do$;

-- ---------------------------------------------------------------------------------------------
-- 2. THE THREE PREDICATES. Bodies unchanged; each remembers the YES it gave.
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION custom.assert_store_door(p_organization_id uuid, p_door text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_owner oid;
  v_who   name;
  v_memo  text := 'w:d:' || coalesce(p_organization_id::text, '-');
begin
  -- THE SAME YES, ALREADY GIVEN IN THIS TRANSACTION, TO THIS SEAT, ABOUT THIS ORGANIZATION.
  if platform.memo_get(v_memo) = '1' then
    return;
  end if;
  v_who := custom.caller_role();

  -- The switch is a PRODUCT switch and never the security boundary (§6 fact two's REVOKEs
  -- are). While it resolves false the store belongs to the campaign that owns it, and the
  -- only legitimate writer is the role that owns custom.record.
  if custom.store_is_open(p_organization_id) then
    perform platform.memo_put(v_memo, '1');
    return;
  end if;

  -- Read the owner from the catalogue, never as a role literal (rule 15), so the door
  -- cannot drift from the table it guards.
  select c.relowner into v_owner from pg_class c where c.oid = 'custom.record'::regclass;
  if pg_has_role(v_who, v_owner, 'member') then
    perform platform.memo_put(v_memo, '1');
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
  v_who   name;
  v_memo  text := 'w:r:' || coalesce(p_organization_id::text, '-');
begin
  -- THE SAME YES, ALREADY GIVEN IN THIS TRANSACTION, TO THIS SEAT, ABOUT THIS ORGANIZATION.
  if platform.memo_get(v_memo) = '1' then
    return;
  end if;
  v_who := custom.caller_role();

  -- The campaign's own lanes run as the role that owns the store. Read the owner from the
  -- catalogue, never as a role literal (rule 15), so this cannot drift from the table.
  select c.relowner into v_owner from pg_class c where c.oid = 'custom.record'::regclass;
  if pg_has_role(v_who, v_owner, 'member') then
    perform platform.memo_put(v_memo, '1');
    return;
  end if;

  if p_organization_id is null then
    raise exception 'custom: % was called without an organization, and the store is keyed (organization_id, id).',
      coalesce(nullif(btrim(p_door), ''), 'that door')
      using errcode = '22004',
            hint = 'Name the organization you are working in. A door that took null would be a door onto every organization at once.';
  end if;

  if iam.has_org_access(p_organization_id) then
    perform platform.memo_put(v_memo, '1');
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
    perform platform.memo_put(v_memo, '1');
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
  v_memo text := 'w:k:' || coalesce(p_organization_id::text, '-') || ':' || coalesce(p_table_id::text, '-');
begin
  -- THE SAME YES, ALREADY GIVEN IN THIS TRANSACTION, TO THIS SEAT, ABOUT THIS TABLE. The wall
  -- below is part of that yes: this memo entry is only ever written after it has been passed.
  if platform.memo_get(v_memo) = '1' then
    return;
  end if;

  -- The wall first, always, and in the same order every other door asks it.
  perform custom.assert_client_may_reach(p_organization_id, p_door);

  -- WAY THROUGH 1: the Table record itself. Unchanged — this is the whole of what this
  -- function used to be, and it is still the answer under the shipped setting.
  if custom.query_is_store_owner() then
    perform platform.memo_put(v_memo, '1');
    return;
  end if;
  v_me := custom.query_principal();
  if v_me is null or p_table_id is null then
    perform platform.memo_put(v_memo, '1');
    return;
  end if;
  if custom.has_visibility(v_me, 'record', p_table_id, 'viewer'::public.permission_level) then
    perform platform.memo_put(v_memo, '1');
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
    perform platform.memo_put(v_memo, '1');
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
