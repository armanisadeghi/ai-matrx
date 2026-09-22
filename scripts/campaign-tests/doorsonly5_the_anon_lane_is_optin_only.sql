-- DOORS-ONLY-5 + ANON-LANES — THE OPT-IN ANONYMOUS LANE IS THE ONLY WAY A TABLE SERVES A
-- SIGNED-OUT READER, AND THIS PROVES IT ACROSS THE WHOLE REGISTRY, IN BOTH DIRECTIONS.
--
-- Teaching a lane to a CLASS is the kind of change that is easy to get quietly wrong: the class
-- is asked for every one of ~1,000 registered tokens, on every generation, by the R12 refusal,
-- by the `pub_read` emitter, and by `iam.verify_canonical.class_lanes_match_policy`. A change
-- that widened the lane by one token more than intended would hand anonymous readers a table
-- nobody meant to publish, and nothing in a single-table test would see it.
--
-- So this is the whole-registry diff lane RLS-REFERENCE used for its own variant work: ask every
-- active token for its lane set, compare that answer to what the rule was BEFORE the opt-in
-- existed, and assert the difference is EXACTLY the set of tokens that declared it.
--
--   psql -f scripts/campaign-tests/doorsonly5_the_anon_lane_is_optin_only.sql
--
-- It writes nothing: the outermost transaction rolls back.

\set ON_ERROR_STOP on
begin;

do $suite$
declare
  v_tokens int;
  v_with_lane int;
  v_declared int;
  v_public_class int;
  v_unexpected text;
  v_missing text;
  v_passes int := 0;
  v_dead int;
  v_pending int;
  v_red boolean := false;
begin
  select count(*) into v_tokens from platform.entity_types where is_active;
  select count(*) into v_declared
    from platform.entity_types
   where is_active and coalesce(client_anonymous_public_read, false);
  select count(*) into v_public_class
    from platform.entity_types where is_active and data_class = 'public';

  -- ═══ 1. THE LANE IS THE OLD RULE, PLUS THE DECLARED SET, AND NOTHING ELSE ═══
  -- The rule before this change was exactly `data_class = 'public'` (component tokens resolve
  -- their class from their parents, which `iam.class_lanes` still does — so this asks the
  -- FUNCTION, not the column, and the component walk is included by construction).
  select string_agg(token, ', ') into v_unexpected
    from platform.entity_types et
   where et.is_active
     and (iam.class_lanes(et.token)).anon_lane
     and (iam.class_lanes(et.token)).resolved_class <> 'public'
     and not coalesce(et.client_anonymous_public_read, false);
  if v_unexpected is not null then
    raise exception '1: token(s) % carry an anonymous lane with neither a public class NOR a declaration. The opt-in widened something nobody asked for.', v_unexpected;
  end if;
  v_passes := v_passes + 1;
  raise notice '  PASS 1  across % active token(s): every anonymous lane belongs either to a token whose class resolves `public` or to one that DECLARED the opt-in. Nothing else gained a lane.', v_tokens;

  -- ═══ 2. EVERY DECLARED TOKEN ACTUALLY GETS THE LANE ═════════════════════════
  -- The other direction: a declaration that did not take effect would be a flag that reads as a
  -- decision and answers nothing — the "door with no key" shape DD-249 measured on 223 tables.
  select string_agg(token, ', ') into v_missing
    from platform.entity_types et
   where et.is_active
     and coalesce(et.client_anonymous_public_read, false)
     and not (iam.class_lanes(et.token)).anon_lane;
  if v_missing is not null then
    raise exception '2: token(s) % DECLARE the opt-in and do not get the lane. A flag that answers nothing is worse than no flag.', v_missing;
  end if;
  v_passes := v_passes + 1;
  raise notice '  PASS 2  all % declared token(s) resolve an anonymous lane', v_declared;

  -- ═══ 3. THE DECLARED SET IS EXACTLY THE ONE THIS CAMPAIGN RULED ════════════
  -- DOORS-ONLY-5 declared ONE token (platform.categories) and said out loud that the four other
  -- live anonymous lanes DD-249 measured were left uncensused. Lane ANON-LANES censused them,
  -- found a named signed-out reader for each, and declared them -- plus canvas.canvas_items, the
  -- fifth of the same shape, which was not in its brief but would otherwise have been disarmed by
  -- the withdrawal arm. The set is enumerated here rather than counted, because a COUNT would
  -- pass for any six tokens and this suite's job is to say which.
  select string_agg(schema_name || '.' || table_name, ', ' order by schema_name, table_name)
    into v_unexpected
    from platform.entity_types
   where is_active and coalesce(client_anonymous_public_read, false)
     and (schema_name, table_name) not in (
       ('platform','categories'), ('app','definition'), ('education','learn_doc'),
       ('agent','message_template'), ('workbench','notes'), ('canvas','canvas_items'));
  if v_unexpected is not null then
    raise exception '3: % declare(s) the anonymous opt-in and this suite has not read its census. A lane arrived from somewhere nobody reviewed.', v_unexpected;
  end if;
  select string_agg(s || '.' || t, ', ') into v_missing
    from (values ('platform','categories'),('app','definition'),('education','learn_doc'),
                 ('agent','message_template'),('workbench','notes'),('canvas','canvas_items')) x(s,t)
   where not exists (select 1 from platform.entity_types et
                      where et.is_active and coalesce(et.client_anonymous_public_read,false)
                        and et.schema_name = x.s and et.table_name = x.t);
  if v_missing is not null then
    raise exception '3: % lost its anonymous-lane declaration. A signed-out page reads each of these.', v_missing;
  end if;
  v_passes := v_passes + 1;
  raise notice '  PASS 3  the declared set is EXACTLY the six censused tokens (the CHECK constraint already refuses a declaration with no reason)';

  -- ═══ 4. EVERY DECLARED TABLE CARRIES THE visibility COLUMN THE LANE IS GATED ON ═══
  -- The emitter's gate is `if v_has_vis then`, so a declared token on a table WITHOUT that column
  -- would silently get no lane -- a declaration that reads as a decision and answers nothing.
  select string_agg(et.schema_name || '.' || et.table_name, ', ') into v_missing
    from platform.entity_types et
   where et.is_active and coalesce(et.client_anonymous_public_read, false)
     and not exists (select 1 from information_schema.columns c
                      where c.table_schema = et.schema_name and c.table_name = et.table_name
                        and c.column_name = 'visibility');
  if v_missing is not null then
    raise exception '4: % declare(s) the anonymous lane but ha(s/ve) no visibility column — the emitter would skip it and the flag would answer nothing.', v_missing;
  end if;
  v_passes := v_passes + 1;
  raise notice '  PASS 4  every declared table carries the `visibility` column the lane is gated on';

  -- ═══ 5. EVERY DECLARED TABLE'S pub_read ADMITS ONLY PUBLIC, NON-DELETED ROWS ═══
  select string_agg(et.schema_name || '.' || et.table_name, ', ') into v_missing
    from platform.entity_types et
   where et.is_active and coalesce(et.client_anonymous_public_read, false)
     and not exists (
       select 1 from pg_policy p
        where p.polrelid = format('%I.%I', et.schema_name, et.table_name)::regclass
          and p.polname = 'pub_read' and p.polcmd = 'r'
          and pg_get_expr(p.polqual, p.polrelid) like '%visibility = ''public''%'
          and pg_get_expr(p.polqual, p.polrelid) like '%deleted_at IS NULL%');
  if v_missing is not null then
    raise exception '5: pub_read on % is not the public-and-not-deleted predicate the ruling names. Read it before trusting the lane.', v_missing;
  end if;
  v_passes := v_passes + 1;
  raise notice '  PASS 5  every declared table`s pub_read admits only rows that are public AND not deleted — the predicate the ruling names, emitted by the generator';

  -- ═══ 6. THE GRANT IS THE GENERATOR'S, AND IT WITHHOLDS WHAT IT DECLARED ═════
  select string_agg(x.rel, ', ') into v_unexpected from (
    select et.schema_name || '.' || et.table_name as rel
      from platform.entity_types et
     where et.is_active and coalesce(et.client_anonymous_public_read, false)
       and exists (
         select 1 from unnest(coalesce(et.client_anonymous_excluded_columns, '{}'::text[])) c
          join pg_attribute a
            on a.attrelid = format('%I.%I', et.schema_name, et.table_name)::regclass
           and a.attname = c
         where has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT'))) x;
  if v_unexpected is not null then
    raise exception '6: `anon` holds SELECT on a column % DECLARED excluded. The generator widened the lane.', v_unexpected;
  end if;
  select string_agg(x.rel, ', ') into v_missing from (
    select et.schema_name || '.' || et.table_name as rel
      from platform.entity_types et
     where et.is_active and coalesce(et.client_anonymous_public_read, false)
       and not has_any_column_privilege('anon', format('%I.%I', et.schema_name, et.table_name)::regclass, 'SELECT')) x;
  if v_missing is not null then
    raise exception '6: `anon` reads NO column of % — the declared lane is not live.', v_missing;
  end if;
  v_passes := v_passes + 1;
  raise notice '  PASS 6  every declared table`s `anon` reads the lane`s columns and NONE of its declared excluded ones';

  -- ═══ 7. NO REGISTERED TABLE CARRIES AN ANONYMOUS LANE IT NEVER DECLARED ═════
  -- 🚨 THE SYMMETRIC HALF, ASSERTED. Until 2026-09-21 the flag could only GRANT, so it said
  -- nothing about a table that did not declare -- which is where every hole lives. An `anon`
  -- SELECT grant on a registered table is now the generator's output or it is not there:
  --   · a LIVE lane (a permissive SELECT-capable policy reaches `anon`) must be DECLARED, or
  --     carry an explicit pending-withdrawal reason saying who owns the ruling;
  --   · a DEAD key (no such policy) is legal only because iam.apply_table_grants revokes it the
  --     moment the table is regenerated -- it can never return a row -- and assertion 7b counts
  --     them so the residual is visible rather than invisible.
  select string_agg(et.schema_name || '.' || et.table_name, ', ') into v_unexpected
    from platform.entity_types et
   where et.is_active
     and not coalesce(et.client_anonymous_public_read, false)
     and et.anon_lane_pending_withdrawal_reason is null
     and to_regclass(format('%I.%I', et.schema_name, et.table_name)) is not null
     and not (iam.class_lanes(et.token)).anon_lane
     and (has_table_privilege('anon', format('%I.%I', et.schema_name, et.table_name)::regclass, 'SELECT')
          or has_any_column_privilege('anon', format('%I.%I', et.schema_name, et.table_name)::regclass, 'SELECT'))
     and exists (
       select 1 from pg_policy p
        where p.polrelid = format('%I.%I', et.schema_name, et.table_name)::regclass
          and p.polpermissive and p.polcmd in ('r','*')
          and (p.polroles = '{0}'::oid[]
               or 'anon' = any(select pg_get_userbyid(x) from unnest(p.polroles) x)));
  if v_unexpected is not null then
    raise exception '7: % carr(ies/y) a LIVE anonymous read lane -- `anon` holds SELECT and a permissive SELECT policy reaches it -- with no declaration and no pending-withdrawal reason. Census it: declare the lane, or close it.', v_unexpected;
  end if;
  v_passes := v_passes + 1;
  select count(*) into v_dead
    from platform.entity_types et
   where et.is_active
     and not coalesce(et.client_anonymous_public_read, false)
     and to_regclass(format('%I.%I', et.schema_name, et.table_name)) is not null
     and not (iam.class_lanes(et.token)).anon_lane
     and (has_table_privilege('anon', format('%I.%I', et.schema_name, et.table_name)::regclass, 'SELECT')
          or has_any_column_privilege('anon', format('%I.%I', et.schema_name, et.table_name)::regclass, 'SELECT'));
  select count(*) into v_pending
    from platform.entity_types et
   where et.is_active and et.anon_lane_pending_withdrawal_reason is not null;
  raise notice '  PASS 7  no registered table carries a LIVE anonymous lane it never declared (% dead key(s) awaiting the generator, % pending-withdrawal row(s))', v_dead, v_pending;

  -- ═══ 8. THE RED TWIN — THE GENERATOR ACTUALLY REFUSES ONE ═══════════════════
  -- Assertion 7 reads the world as it is. It would pass just as happily if the withdrawal arm
  -- had never been installed, because nothing in the catalogue says a generator would object.
  -- So this plants the failure: it UNDECLARES a live declared lane inside this transaction and
  -- asserts iam.apply_table_grants REFUSES (42501) rather than silently deleting a public page,
  -- then re-declares it and asserts the same call passes. RED then GREEN, in one run, rolled back.
  begin
    update platform.entity_types set client_anonymous_public_read = false,
           client_anonymous_public_read_reason = null
     where schema_name = 'agent' and table_name = 'message_template' and is_active;
    begin
      perform iam.apply_table_grants('agent', 'message_template', 'entity');
      raise exception '8: the generator ACCEPTED agent.message_template with a live anonymous lane and no declaration. The withdrawal arm is not installed, or it does not fire.';
    exception when insufficient_privilege then
      v_red := true;
    end;
    if not v_red then
      raise exception '8: no refusal was raised';
    end if;
    raise notice '  PASS 8a (RED) undeclaring a live anonymous lane makes iam.apply_table_grants refuse 42501 instead of deleting a public page';
    update platform.entity_types set client_anonymous_public_read = true,
           client_anonymous_public_read_reason =
             'Re-declared inside the ANON-LANES suite transaction to prove the GREEN half; this row never commits.'
     where schema_name = 'agent' and table_name = 'message_template' and is_active;
    perform iam.apply_table_grants('agent', 'message_template', 'entity');
    v_passes := v_passes + 1;
    raise notice '  PASS 8b (GREEN) re-declaring it makes the same call succeed — the refusal tracks the declaration, not the table';
  end;

  raise notice '';
  raise notice '  %/8 assertions green (registry: % active tokens, % resolving class `public`, % declared opt-in)',
    v_passes, v_tokens, v_public_class, v_declared;
  if v_passes <> 8 then
    raise exception 'suite: % assertions passed, not 8', v_passes;
  end if;
end;
$suite$;

rollback;
