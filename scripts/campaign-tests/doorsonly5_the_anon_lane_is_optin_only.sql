-- DOORS-ONLY-5 — THE OPT-IN ANONYMOUS LANE CHANGES EXACTLY ONE TOKEN, AND THIS PROVES IT
-- ACROSS THE WHOLE REGISTRY.
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

  -- ═══ 3. THE DECLARATION IS RARE, AND IT CARRIES ITS REASON ══════════════════
  if v_declared <> 1 then
    raise exception '3: % tokens declare the opt-in. This lane declared exactly ONE (platform.categories); anything else arrived from somewhere this suite has not read.', v_declared;
  end if;
  if not exists (
    select 1 from platform.entity_types
     where is_active and coalesce(client_anonymous_public_read, false)
       and schema_name = 'platform' and table_name = 'categories') then
    raise exception '3: the one declared token is not platform.categories';
  end if;
  v_passes := v_passes + 1;
  raise notice '  PASS 3  exactly ONE token declares the opt-in, and it is platform.categories (the CHECK constraint already refuses a declaration with no reason)';

  -- ═══ 4. THE LANE IS STILL GATED ON A visibility COLUMN ══════════════════════
  -- The ruling is specific: the lane exists only when the table has a `visibility` column, and
  -- admits only rows where it is 'public'. The emitter's gate is `if v_has_vis then`, so a
  -- declared token on a table WITHOUT that column would silently get no lane — which is correct
  -- but would be a declaration that reads as a decision and answers nothing. Assert the one
  -- declared table has the column, so the flag and the shape agree.
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'platform' and table_name = 'categories' and column_name = 'visibility') then
    raise exception '4: platform.categories declares the anonymous lane but has no visibility column — the emitter would skip it and the flag would answer nothing.';
  end if;
  v_passes := v_passes + 1;
  raise notice '  PASS 4  the declared table carries the `visibility` column the lane is gated on';

  -- ═══ 5. THE POLICY ON THE TABLE ADMITS ONLY PUBLIC, NON-DELETED ROWS ════════
  if not exists (
    select 1 from pg_policy p
     where p.polrelid = 'platform.categories'::regclass and p.polname = 'pub_read'
       and p.polcmd = 'r'
       and pg_get_expr(p.polqual, p.polrelid) like '%visibility = ''public''%'
       and pg_get_expr(p.polqual, p.polrelid) like '%deleted_at IS NULL%') then
    raise exception '5: pub_read on platform.categories is not the public-and-not-deleted predicate the ruling names. Read it before trusting the lane.';
  end if;
  v_passes := v_passes + 1;
  raise notice '  PASS 5  pub_read admits only rows that are public AND not deleted — the predicate the ruling names, emitted by the generator';

  -- ═══ 6. THE GRANT IS THE GENERATOR'S, AND IT WITHHOLDS WHAT IT DECLARED ═════
  if exists (
    select 1 from unnest(
      (select client_anonymous_excluded_columns from platform.entity_types
        where schema_name = 'platform' and table_name = 'categories')) c
    join pg_attribute a on a.attrelid = 'platform.categories'::regclass and a.attname = c
   where has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT')) then
    raise exception '6: `anon` holds SELECT on a column platform.categories DECLARED excluded. The generator widened the lane.';
  end if;
  if not has_column_privilege('anon', 'platform.categories'::regclass,
       (select attnum from pg_attribute where attrelid='platform.categories'::regclass and attname='name'), 'SELECT') then
    raise exception '6: `anon` lost its read of platform.categories.name — the lane is not live.';
  end if;
  v_passes := v_passes + 1;
  raise notice '  PASS 6  `anon` reads the lane`s columns and NONE of the seven declared excluded ones';

  raise notice '';
  raise notice '  %/6 assertions green (registry: % active tokens, % resolving class `public`, % declared opt-in)',
    v_passes, v_tokens, v_public_class, v_declared;
  if v_passes <> 6 then
    raise exception 'suite: % assertions passed, not 6', v_passes;
  end if;
end;
$suite$;

rollback;
