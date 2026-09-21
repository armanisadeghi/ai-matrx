-- additive: yes
--
-- chair-step: it REPLACES five live function bodies on the record READ path. Nothing is
--   dropped, nothing is revoked, no row of anybody's data is touched. Three new functions
--   are created beside the old ones; `custom.record_values(uuid, uuid)` and
--   `custom.derived_values(uuid, uuid)` keep their names, arguments, return types,
--   volatility and `SET search_path` and become one-line delegations, so every one of their
--   eighteen callers keeps working unchanged. The inverse is
--   `migrations/inverse/readinline_the_page_passes_the_row_it_already_holds_down.sql` and it
--   restores all five live bodies byte for byte.
--
-- READ-INLINE — THE PAGE STOPS RE-READING THE ROW IT IS ALREADY HOLDING.
--
-- PERF-TRUTH proved `custom.record_values` has never been inlinable in ANY language: a
-- scalar SQL function is inlined only when its body is a bare expression, and that body
-- carries all three disqualifiers — `SET search_path`, a `FROM custom.record` clause, and a
-- sublink over `jsonb_each`. So flipping its language back to `sql` is not a restoration; it
-- is a trade that PERF-TRUTH measured at −10 to −13% on page reads against +16% on the
-- single-record door and 5.8x on `custom.rule_context`, and it ruled correctly against it.
--
-- THE FIX PERF-TRUTH §2.4 NAMED, BUILT HERE. Take the ROW as the argument:
--
--   * no FROM   — the caller already holds the row; `custom.read_records` has it in hand
--                 when it calls, and every other caller fetches it once instead of twice.
--   * no sublink — the `_computed` / `_derived` unwrap moves into `custom.computed_block`,
--                 a small IMMUTABLE helper, so the outer body is a bare expression.
--   * no SET    — every reference is schema-qualified (`custom.computed_block`,
--                 `custom.derived_values_of`), which is what `SET search_path` was buying.
--                 The function is SECURITY INVOKER and STABLE, so it runs as, and sees
--                 exactly what, its caller does; qualification is the whole of the safety.
--
-- That is the ONE shape PostgreSQL inlines, and it does:
--
--   explain (verbose, costs off)
--   select r.id, custom.record_values_of(r) from custom.record r
--    where r.organization_id = … and r.table_id = … and r.deleted_at is null
--    order by r.created_at desc limit 50;
--
--   Limit
--     Output: r.id, ((((((((r.data - '_computed'::text) - '_retired'::text) - '_values'::text)
--             - '_sources'::text) - '_derived'::text)
--             || custom.computed_block((r.data -> '_computed'::text)))
--             || COALESCE(custom.derived_values_of(((r.*)::custom.record)), '{}'::jsonb)))
--
-- No `custom.record_values_of(...)` call survives in the plan: the planner sees through it.
--
-- AND THE DOUBLE FETCH GOES WITH IT. `custom.record_values` fetched the row, then
-- `custom.derived_values` fetched THE SAME ROW AGAIN — two index lookups per row of every
-- page, and per call of every single-record caller. READ-PERF-2 costed the second one at
-- 0.58 ms of the 1.06 ms each row spent in `custom.derived_values`. Passing the row removes
-- it everywhere, including on the write path, which is why this is not a trade: every path
-- either wins or is unchanged.
--
-- NOTHING ABOUT THE ANSWER MOVES. Every expression below is the live body's own, character
-- for character, with the fetch removed and the two `(select jsonb_object_agg(e.key,
-- e.value -> 'value') from jsonb_each(coalesce(X, '{}'::jsonb)) e)` sublinks replaced by
-- `custom.computed_block(X)`, which IS that expression. Parity is proved end to end: the
-- 141-triple page probe (every organization × Table × member with 5+ live records, read from
-- that member's own seat) hashes identically before and after.
--
-- based-on: custom.derived_values(uuid, uuid) aa8ab14b84db65789bed16817156e29860065720c842272e098d0f83c90d68af
-- based-on: custom.record_values(uuid, uuid) 5bf1068b51762eb6df78c3acc9158110e98356e56adbf42f92bdeb9973fd5685
-- based-on: custom.read_record(uuid, uuid, boolean) 5402a13486d1888a0098f566451834b4b38ba86d3ddacff5f55207096acdc2db
-- based-on: custom.read_records(uuid, uuid, boolean, integer, integer) e7e29d17ad65e23731b4aa23cdaf23acf1a6c742c71a018819f0799a3f081ad9
-- based-on: custom.doors_not_masking_fields() 6846bd97db31c7a884ad7500f903986e8b034d9e60142b9315e2988fa08ad35b

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 1. The sublink, lifted out so the body that needs to inline has none.
--    `{key: {value: v, …}}` → `{key: v}`. IMMUTABLE: it reads nothing but its argument.
-- ─────────────────────────────────────────────────────────────────────────────────────────
create or replace function custom.computed_block(p_block jsonb)
returns jsonb
language sql
immutable
parallel safe
as $$
  select coalesce((select jsonb_object_agg(e.key, e.value -> 'value')
                     from jsonb_each(coalesce(p_block, '{}'::jsonb)) e),
                  '{}'::jsonb)
$$;

comment on function custom.computed_block(jsonb) is
  'READ-INLINE: the _computed / _derived unwrap, as a function, so custom.record_values_of '
  'is a bare expression with no sublink and therefore the one shape PostgreSQL inlines. '
  'Not a door: schema custom is closed and this carries no client grant.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 2. `custom.derived_values`, with the row passed in instead of fetched.
--    plpgsql, because it loops over the Table''s read-time formula fields. It is never
--    inlined and never was; what it stops doing is the second index lookup of the same row.
-- ─────────────────────────────────────────────────────────────────────────────────────────
create or replace function custom.derived_values_of(v_rec custom.record)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  v_out   jsonb := '{}'::jsonb;
  f       custom.record;
  v_rtype text;
  v_key   text;
  v_plain jsonb;
begin
  if v_rec.id is null or v_rec.table_id is null
     or v_rec.data_class in ('kernel', 'relation') then
    return '{}'::jsonb;
  end if;

  -- WHAT WAS STAMPED AT WRITE TIME comes back exactly as it was stamped (FLD-9: the
  -- declaration says WHEN it is worked out, and a `write` formula is a fact about the
  -- moment it was saved).
  v_out := custom.computed_block(v_rec.data -> '_derived');

  -- 🚨 THE VALUES A READ-TIME FORMULA IS EVALUATED AGAINST ARE ASSEMBLED HERE AND PASSED
  -- IN, never fetched by the evaluator. `custom.record_values` calls THIS body, so a
  -- formula that re-entered it for its own record's values would recurse until the stack
  -- ran out — a crash instead of an answer. The values are the document, plus W1-RULE's
  -- computed block, plus what was stamped at write time: everything that is knowable
  -- without asking this function again.
  v_plain := (v_rec.data - '_computed' - '_retired' - '_values' - '_sources' - '_derived')
             || custom.computed_block(v_rec.data -> '_computed')
             || v_out;

  v_key := custom.table_type_field(v_rec.organization_id, v_rec.table_id);
  if v_key is not null then
    v_rtype := v_rec.data ->> v_key;
  end if;

  -- AND WHAT IS WORKED OUT ON READ is worked out now, every time, from what is there now.
  for f in select * from custom.applicable_fields(v_rec.organization_id, v_rec.table_id, v_rtype) loop
    if custom.parity_type(f.data) in ('lookup', 'rollup', 'formula')
       and coalesce(f.data ->> 'compute_on', '') = 'read' then
      v_out := v_out || jsonb_build_object(f.data ->> 'key',
                          custom.derived_value(v_rec.organization_id, v_rec.id, f.data, v_plain));
    end if;
  end loop;
  return v_out;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 3. THE INLINABLE BODY. No SET clause, no FROM, no sublink — a bare expression.
-- ─────────────────────────────────────────────────────────────────────────────────────────
create or replace function custom.record_values_of(p_row custom.record)
returns jsonb
language sql
stable
as $$
  select (p_row.data - '_computed' - '_retired' - '_values' - '_sources' - '_derived')
         || custom.computed_block(p_row.data -> '_computed')
         || coalesce(custom.derived_values_of(p_row), '{}'::jsonb)
$$;

comment on function custom.record_values_of(custom.record) is
  'READ-INLINE: custom.record_values with the ROW passed in. No SET clause, no FROM and no '
  'sublink, which is the only shape PostgreSQL inlines — proved with EXPLAIN (VERBOSE) at '
  'the custom.read_records page call site. A RAW value source: it does NOT mask, so any door '
  'a client may execute must put custom.read_mask between it and the caller '
  '(custom.doors_not_masking_fields watches for exactly that).';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 4. The two old names keep their signatures and become delegations, so all eighteen
--    callers keep working AND each of them stops paying the second fetch.
-- ─────────────────────────────────────────────────────────────────────────────────────────
create or replace function custom.derived_values(p_organization_id uuid, p_record_id uuid)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  v_rec custom.record;
begin
  select * into v_rec from custom.record
   where organization_id = p_organization_id and id = p_record_id;
  return custom.derived_values_of(v_rec);
end;
$function$;

create or replace function custom.record_values(p_organization_id uuid, p_record_id uuid)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  v_rec custom.record;
begin
  -- READ-INLINE. ONE fetch, not two: this body used to read the row and then
  -- `custom.derived_values` read the very same row again. A caller that already holds the
  -- row should call `custom.record_values_of(row)` and get the body inlined into its own
  -- plan; this wrapper is for the callers that hold only an id.
  select * into v_rec from custom.record
   where organization_id = p_organization_id and id = p_record_id;
  if v_rec.id is null then
    return null;
  end if;
  return custom.record_values_of(v_rec);
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 5. THE PAGE CALL SITE. `custom.read_records` already holds `r`; it hands it over instead
--    of handing over an id for the function to look the row up with. Four arms, one line
--    each — every other character of this body is the live one.
-- ─────────────────────────────────────────────────────────────────────────────────────────
create or replace function custom.read_records(p_organization_id uuid, p_table_id uuid, p_by_id boolean DEFAULT false, p_limit integer DEFAULT 200, p_offset integer DEFAULT 0)
returns TABLE(id uuid, document jsonb, level permission_level)
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_me       uuid := auth.uid();
  v_rec      record;
  v_level    public.permission_level;
  v_visible  text[];
  v_declared text[];
  v_notices  jsonb;
  v_key_ids  jsonb;
  v_set      record;
begin
  if v_me is null then
    raise exception 'Nobody is signed in, so there is nothing to read.'
      using errcode = '42501',
            hint = 'DOOR-1: the read door resolves the reader from the session and takes no principal argument. Sign in, or call it from a lane that carries a person.';
  end if;
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.read_records');
  p_limit := custom.page_size(p_organization_id, 'custom.read_records', p_limit, 200);

  -- STEP 2, once per table per request: which fields this caller may see, at which level.
  -- The level used for the field question is the caller's level on the TABLE, so a page of
  -- a hundred records asks the field question once, not a hundred times (DOOR-10's shape).
  v_level := custom.effective_level(v_me, p_organization_id, p_table_id);

  select coalesce(array_agg(f.field_key), '{}'::text[])
    into v_visible
    from iam.visible_field_ids(v_me, p_organization_id, p_table_id, v_level, 'read') f;

  select coalesce(jsonb_object_agg(f.data ->> 'key', custom.hidden_field_notice(f, 'read')), '{}'::jsonb),
         coalesce(jsonb_object_agg(f.data ->> 'key', f.id::text), '{}'::jsonb),
         coalesce(array_agg(f.data ->> 'key'), '{}'::text[])
    into v_notices, v_key_ids, v_declared
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = p_table_id;

  -- Only the fields that are actually hidden get a notice.
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
    into v_notices
    from jsonb_each(v_notices) e
   where not (e.key = any (v_visible));

  -- STEP 1, ONCE: Visibility. `custom.visible_set` asks the ONE ladder a bounded number of
  -- times — once per visibility class, once per granted id, once per container — and hands back
  -- a predicate the planner can drive an index with. The comment this door used to carry is now
  -- true of the code under it (VIS-N-1; DOOR-10: filtered INSIDE the query, never post-filtered).
  v_set := custom.visible_set(v_me, p_organization_id, p_table_id, 'viewer'::public.permission_level);

  if v_set.o_fallback then
    raise notice '%', v_set.o_note;
    for v_rec in
      select r.id, custom.record_values_of(r) as doc
        from custom.record r
       where custom.has_visibility(v_me, 'record', r.id, 'viewer')
         and r.organization_id = p_organization_id
         and r.table_id = p_table_id
         and r.deleted_at is null
       order by r.created_at desc
       limit p_limit offset p_offset
    loop
      id := v_rec.id;
      document := custom.choice_render(p_organization_id, p_table_id,
                    custom.mask_document(v_rec.doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared));
      level := v_level;
      return next;
    end loop;

  elsif v_set.o_all_visible then
    -- THE ORDINARY PAGE. Every live row of this Table is this caller's to see, so the scan
    -- carries no visibility predicate at all and the LIMIT stops it at p_limit rows.
    for v_rec in
      select r.id, custom.record_values_of(r) as doc
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = p_table_id
         and r.deleted_at is null
       order by r.created_at desc
       limit p_limit offset p_offset
    loop
      id := v_rec.id;
      document := custom.choice_render(p_organization_id, p_table_id,
                    custom.mask_document(v_rec.doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared));
      level := v_level;
      return next;
    end loop;

  elsif coalesce(array_length(v_set.o_true_visibility, 1), 0) > 0 then
    -- A CLASS THIS CALLER HOLDS, WITH EXCEPTIONS. A granted id is never answered by its class:
    -- a grant addressed to this person on that record replaces what membership confers (VIS-19),
    -- so it is excluded from the class arm and admitted only by its own answer. Containment is a
    -- separate arm and only ever adds (VIS-6).
    for v_rec in
      select r.id, custom.record_values_of(r) as doc
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = p_table_id
         and r.deleted_at is null
         and ( r.created_by = v_me
            or (r.visibility = any (v_set.o_true_visibility) and not (r.id = any (v_set.o_granted_all)))
            or r.id = any (v_set.o_granted_visible)
            or r.id = any (v_set.o_carried_visible) )
       order by r.created_at desc
       limit p_limit offset p_offset
    loop
      id := v_rec.id;
      document := custom.choice_render(p_organization_id, p_table_id,
                    custom.mask_document(v_rec.doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared));
      level := v_level;
      return next;
    end loop;

  else
    -- NOTHING THIS CALLER HOLDS BY CLASS — `shared_only`, or a Table nobody shared with them.
    -- What is left is small and named: the rows this person made, the rows somebody gave them,
    -- and the rows a container they reach carries.
    for v_rec in
      select r.id, custom.record_values_of(r) as doc
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = p_table_id
         and r.deleted_at is null
         and ( r.created_by = v_me
            or r.id = any (v_set.o_granted_visible)
            or r.id = any (v_set.o_carried_visible) )
       order by r.created_at desc
       limit p_limit offset p_offset
    loop
      id := v_rec.id;
      document := custom.choice_render(p_organization_id, p_table_id,
                    custom.mask_document(v_rec.doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared));
      level := v_level;
      return next;
    end loop;
  end if;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 6. THE SINGLE-RECORD DOOR. It, too, already has the row: its own SELECT is what fetches
--    it. One line changes; the rest of this body is the live one, character for character.
-- ─────────────────────────────────────────────────────────────────────────────────────────
create or replace function custom.read_record(p_organization_id uuid, p_record_id uuid, p_by_id boolean DEFAULT false)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_me       uuid := auth.uid();
  v_table    uuid;
  v_doc      jsonb;
  v_mask     jsonb;
  v_visible  text[];
  v_declared text[];
  v_now      uuid;
  v_alts     jsonb;
  v_retired  jsonb;
  v_out      jsonb;
begin
  if v_me is null then
    raise exception 'Nobody is signed in, so there is nothing to read.'
      using errcode = '42501', hint = 'DOOR-1: the read door reads the person from the session.';
  end if;

  -- REC-21 / T5. THE ID A MERGE SENT SOMEWHERE ELSE — a redirect, never a silent substitution.
  v_now := custom.resolve_id(p_organization_id, p_record_id);

  select r.table_id, custom.record_values_of(r)
    into v_table, v_doc
    from custom.record r
   where r.organization_id = p_organization_id and r.id = v_now and r.deleted_at is null;
  if not found then
    raise exception 'There is no record % in this organization.', p_record_id
      using errcode = '02000', hint = 'It was deleted, or it never existed here.';
  end if;

  if not custom.has_visibility(v_me, 'record', v_now, 'viewer') then
    raise exception 'You do not have access to this record.'
      using errcode = '42501',
            hint = 'DOOR-1: nothing reads a record around this door - not a screen, not an export, not an agent. Ask somebody who holds it to share it with you.';
  end if;

  -- THE ONE FACT. `custom.read_mask` is the whole of what this door used to work out privately.
  v_mask := custom.read_mask(p_organization_id, v_now, 'read');
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_visible
    from jsonb_array_elements(v_mask -> 'visible') x;
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_declared
    from jsonb_array_elements(v_mask -> 'declared') x;

  v_out := custom.mask_document(v_doc, v_visible, v_mask -> 'notices', p_by_id,
                                v_mask -> 'key_ids', v_declared);

  -- CHOICE-VALUE. Rendered AFTER masking, so a field this reader may not see keeps its notice
  -- and is never resolved.
  v_out := custom.choice_render(p_organization_id, v_table, v_out);

  -- T5 / REC-N-11. THE ALTERNATES THE MERGE KEPT — only for keys this reader may see.
  select jsonb_object_agg(k, alts) into v_alts
    from (
      select e.key as k,
             (select jsonb_agg(jsonb_build_object(
                       'value',  a -> 'value',
                       'rank',   a -> 'rank',
                       'source', r.data -> '_sources' -> (a ->> 'src'))
                     order by (a ->> 'rank')::int)
                from jsonb_array_elements(coalesce(e.value -> 'alternates', '[]'::jsonb)) a) as alts
        from custom.record r
        cross join lateral jsonb_each(coalesce(r.data -> '_values', '{}'::jsonb)) e
       where r.organization_id = p_organization_id and r.id = v_now
         and e.key = any (v_visible)
         and jsonb_array_length(coalesce(e.value -> 'alternates', '[]'::jsonb)) > 0
    ) x
   where x.alts is not null;

  if v_alts is not null and v_alts <> '{}'::jsonb then
    v_out := v_out || jsonb_build_object('_alternates', v_alts);
  end if;

  -- SEAT-SUITES / T5+T12. THE VALUES THE STORE KEPT AND THE DOOR THREW AWAY, masked exactly
  -- like the value they used to be.
  select jsonb_agg(x order by x ->> 'key') into v_retired
    from custom.record r
    cross join lateral jsonb_array_elements(coalesce(r.data -> '_retired', '[]'::jsonb)) x
   where r.organization_id = p_organization_id and r.id = v_now
     and ((x ->> 'key') = any (v_visible) or not ((x ->> 'key') = any (v_declared)));

  if v_retired is not null and jsonb_array_length(v_retired) > 0 then
    v_out := v_out || jsonb_build_object('_retired', v_retired);
  end if;

  if v_now is distinct from p_record_id then
    v_out := v_out || jsonb_build_object(
      '_redirected_from', p_record_id,
      '_redirect_says', 'That record was merged into this one, so its id now answers with this record. REC-21: the merged id resolves to the survivor for good — undoing the merge puts both records and both ids back.');
  end if;

  return v_out;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 7. THE GUARD LEARNS THE NEW NAME, IN THE SAME FILE THAT CREATES IT.
--    `custom.doors_not_masking_fields` names every RAW value source a client-executable door
--    could reach without going through `custom.read_mask`. Its pattern ended at
--    `custom\.record_values\M`, and `\M` is a word boundary, so `custom.record_values_of`
--    would have slipped past it silently — a new raw source with no watcher. One alternation
--    closes that before the function it is about exists in any other file.
-- ─────────────────────────────────────────────────────────────────────────────────────────
create or replace function custom.doors_not_masking_fields()
returns TABLE(function_name text, identity_args text, why text)
language sql
stable
set search_path to 'pg_catalog'
as $function$
  select p.proname::text,
         pg_get_function_identity_arguments(p.oid),
         'a client may execute it, it reaches a RAW value source (custom.record_values, '
         'custom.record_values_of, custom.record_state_as_of, custom.history_changes, '
         'history.row_versions or custom.record directly) and its body never reaches '
         'custom.read_mask or the two doors that already carry it, so a Field this reader '
         'may not see leaves the store'::text
    from pg_proc p
   where p.pronamespace = 'custom'::regnamespace
     and has_function_privilege('authenticated', p.oid, 'EXECUTE')
     and p.prorettype not in ('pg_catalog.trigger'::regtype, 'pg_catalog.event_trigger'::regtype)
     and regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g')
         ~* '(custom\.record_values(_of)?\M|custom\.record_state_as_of|custom\.history_changes|history\.row_versions|history\.record_versions)'
     and regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g')
         !~* '(custom\.read_mask|custom\.mask_says_withheld|custom\.read_record\M|custom\.read_records\M|custom\.record_values_versioned)'
   order by 1;
$function$;
