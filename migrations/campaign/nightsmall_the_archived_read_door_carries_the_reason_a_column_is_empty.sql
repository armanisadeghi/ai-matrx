-- additive: yes
--   REPLACES one body, custom.read_records_archived(uuid, uuid, text, boolean, integer, integer): same signature,
--   same columns, same rows, order and paging, same grants. The only change is the document step: it now asks
--   custom.record_values_step (the step every sibling read door asks) instead of custom.record_values_of, so a
--   column that cannot be worked out keeps its reason in the document's `_errors`. No table, column, trigger,
--   policy, grant or stored row is touched. Locks: pg_proc row lock only.
--   Inverse: migrations/inverse/nightsmall_the_archived_read_door_carries_the_reason_a_column_is_empty_down.sql
--
-- lane: NIGHT-SMALL
-- lock: custom
-- based-on: custom.read_records_archived(uuid, uuid, text, boolean, integer, integer) 20907afeb39773e13c96f402816c9e57b997fe6513c70c4b53ab5e4959281d4b
--
-- THE GAP. custom.read_records, read_records_by_ids, read_record, read_records_matching and read_records_page
-- return `_errors` (CHAIR-SHEET-STORE a, "a column that cannot be worked out says why") because they build the
-- document with custom.record_values_step. custom.read_records_archived built it with custom.record_values_of,
-- which has no `_errors`, so an archived row's "#ERROR" cell lost its reason. Body below is the live body with
-- that one line changed.

CREATE OR REPLACE FUNCTION custom.read_records_archived(p_organization_id uuid, p_table_id uuid, p_lane text DEFAULT 'org'::text, p_by_id boolean DEFAULT false, p_limit integer DEFAULT 200, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, document jsonb, level permission_level, archived_at timestamp with time zone, archived_by uuid, archived_by_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me       uuid := auth.uid();
  v_rec      record;
  v_level    public.permission_level;
  v_visible  text[];
  v_declared text[];
  v_notices  jsonb;
  v_key_ids  jsonb;
  v_mask     jsonb;
  v_limit    integer;
  v_lane     text := lower(coalesce(p_lane, 'org'));
  v_lane_sql text;
  v_sql      text;
  v_order    text;     -- TABLE-ACTIONS: the page's order, named by custom.archived_tables_everywhere
  v_in_ord   text;
  v_out_ord  text;
  v_count    integer;   -- CHAIR-DOORS-3A: the count-only answer
begin
  if v_me is null then
    raise exception 'Nobody is signed in, so there is nothing to read.'
      using errcode = '42501',
            hint = 'DOOR-1: the read door resolves the reader from the session and takes no principal argument. Sign in, or call it from a lane that carries a person.';
  end if;

  -- THE ORGANIZATION WALL, ASKED BY NAME, BEFORE ANYTHING IS READ. This door decided the
  -- organization through custom.assert_may_know_table and the row through a
  -- custom.visible_predicate_sql placeholder inside a `format`-built statement: both real,
  -- neither legible to a census that reads a body. custom.record_aggregate asks this same
  -- line before it builds its statement, for the same reason. The yes is memoised per
  -- transaction, so the member below pays nothing twice. (DOORS-DECIDE-3, 2026-09-22.)
  perform custom.assert_client_may_reach(p_organization_id, 'custom.read_records_archived');

  -- THE LANE IS VOCABULARY, NOT A FREE STRING. An unknown word is refused by name; answering
  -- it as 'org' would quietly show a person more than they asked for.
  if v_lane not in ('mine', 'org') then
    raise exception 'custom.read_records_archived: "%" is not a lane', p_lane
      using errcode = '22023',
            hint = 'Two lanes: "mine" (what I archived) and "org" (what anybody in this organization archived).';
  end if;

  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.read_records_archived');

  -- A COUNT, THROUGH THIS DOOR'S OWN WHERE (CHAIR-DOORS-3A, asked by lane 9 SCOPES-ON-THE-STORE).
  -- custom.count_records_archived names the caller in the statement memo before it asks this door
  -- once per Table; this door then answers ONE row whose document is {"archived_count": n}, n being
  -- count(*) of exactly the rows the page below would have listed - the same wall, the same Table
  -- decision, the same ladder predicate, the same "Only me" list rule, the same lane, the same
  -- quarantine test - with no rendering, no mask, no level and no archiver lookup (the "mine" lane
  -- alone still asks custom.record_archiver, because it IS the lane). The count lives here and not in
  -- a door of its own because this WHERE reads the row column T-13 retires, which only the readers
  -- platform._t13_allowlist already names may read, and that list only shrinks.
  if platform.memo_k_get('custom.archived_count_only:' || v_me::text) = '1' then
    execute format($q$
      select count(*)::integer
        from custom.record r
       where r.organization_id = %1$L::uuid
         and r.table_id = %2$L::uuid
         and r.deleted_at is not null
         and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
         and %3$s
         and %4$s
    $q$,
      p_organization_id, p_table_id,
      custom.visible_predicate_sql(v_me, p_organization_id, p_table_id,
                                   'viewer'::public.permission_level, 'r')
      || format(' and platform.shown_to_lists(r.shown_to, r.visibility, r.created_by, r.organization_id, %L::uuid, %L::jsonb)',
                v_me, custom._record_shown_to_ctx(array[p_organization_id], p_table_id)),
      case when v_lane = 'mine'
           then format('custom.record_archiver(%L::uuid, r.id) = %L::uuid', p_organization_id, v_me)
           else 'true' end)
      into v_count;
    id               := null;
    document         := jsonb_build_object('archived_count', v_count);
    level            := null;
    archived_at      := null;
    archived_by      := null;
    archived_by_name := null;
    return next;
    return;
  end if;
  v_limit := custom.page_size(p_organization_id, 'custom.read_records_archived', p_limit, 200);

  v_level := custom.effective_level(v_me, p_organization_id, p_table_id);

  -- READ-MASK-ONCE: the field mask is the one door's answer, asked once per statement for this
  -- (person, organization, Table, level) and memoised — never worked out here a second way.
  v_mask := custom.read_mask_for(v_me, p_organization_id, p_table_id, v_level, 'read');
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_visible
    from jsonb_array_elements(v_mask -> 'visible') x;
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_declared
    from jsonb_array_elements(v_mask -> 'declared') x;
  -- Only the fields that are actually hidden carry a notice; every declared field carries its id.
  v_notices := v_mask -> 'notices';
  v_key_ids := v_mask -> 'all_key_ids';

  -- THE LANE, AS A PREDICATE OVER THE SET THE LADDER ALREADY ALLOWED. `mine` narrows; it
  -- cannot widen, because it is an additional conjunct beside custom.visible_predicate_sql.
  -- TABLE-ACTIONS (2026-10-03): the "mine" lane asks custom.record_archiver in the WHERE, the same
  -- sentence the count above uses; the archiver SHOWN beside each row is asked only for the page.
  v_lane_sql := case when v_lane = 'mine'
                     then format('custom.record_archiver(%L::uuid, r.id) = %L::uuid', p_organization_id, v_me)
                     else 'true' end;

  -- THE ORDER OF THE PAGE (TABLE-ACTIONS, 2026-10-03). Newest archived first, unless the caller in
  -- this statement — custom.archived_tables_everywhere sorting the Data home's Archived list by a
  -- column — named another in the statement memo. Four words, each a fixed sentence; anything else is
  -- the default. The id breaks every tie, so an offset always lands on the same row.
  v_order := coalesce(platform.memo_k_get('custom.archived_order:' || v_me::text), 'archived_desc');
  case v_order
    when 'archived_asc' then
      v_in_ord := 'r.deleted_at asc, r.id';  v_out_ord := 'q.archived_at asc, q.id';
    when 'name_asc' then
      v_in_ord := $o$lower(coalesce(r.data ->> 'name', '')) asc, r.id$o$;
      v_out_ord := $o$lower(coalesce((q.rr).data ->> 'name', '')) asc, q.id$o$;
    when 'name_desc' then
      v_in_ord := $o$lower(coalesce(r.data ->> 'name', '')) desc, r.id$o$;
      v_out_ord := $o$lower(coalesce((q.rr).data ->> 'name', '')) desc, q.id$o$;
    else
      v_in_ord := 'r.deleted_at desc, r.id'; v_out_ord := 'q.archived_at desc, q.id';
  end case;

  -- ONE STATEMENT. Visibility, the lane, the archive test and the page in the same WHERE.
  -- Nothing here is built from a caller's bytes: the only interpolated values are two uuids
  -- this function resolved itself, two integers, and predicates this database wrote.
  -- THE ARCHIVER IS ASKED FOR THE PAGE, NEVER FOR THE PILE (TABLE-ACTIONS, 2026-10-03). It sat in
  -- the FROM beside every archived row, so a page of one asked custom.record_archiver once per
  -- archived row of the organization (645 calls, 134 ms for two one-row pages on the clone). The page
  -- is cut first; the archiver and the archiver's name are asked of the rows on it. Same rows, same
  -- order, same columns.
  -- NIGHT-SMALL: the document is built by custom.record_values_step, the step every sibling read door
  -- asks, so a column that cannot be worked out keeps its reason in `_errors`.
  v_sql := format($q$
    select q.id,
           (select s.o_doc from custom.record_values_step(q.rr) s) as doc, (q.rr).data -> '_values' as wv_values, (q.rr).data -> '_sources' as wv_sources,
           q.archived_at              as archived_at,
           a.who                      as archived_by,
           p.nm                       as archived_by_name
      from (select r.id, r as rr, r.deleted_at as archived_at
              from custom.record r
             where r.organization_id = %1$L::uuid
               and r.table_id = %2$L::uuid
               and r.deleted_at is not null
               and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
               and %3$s
               and %4$s
             order by %7$s
             limit %5$s offset %6$s) q
      -- `offset 0` keeps the archiver one call a row: flattened, it was asked once for the column and
      -- again inside the name lookup (600 calls for a page of 200).
      cross join lateral (select custom.record_archiver(%1$L::uuid, q.id) as who offset 0) a
      left join lateral (
             select coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''),
                             nullif(u.raw_user_meta_data ->> 'full_name', ''),
                             split_part(u.email::text, '@', 1)) as nm
               from iam.organization_member m
               join auth.users u on u.id = m.user_id
              where m.organization_id = %1$L::uuid
                and m.user_id = a.who
              limit 1) p on true
     order by %8$s
  $q$,
    p_organization_id, p_table_id,
    custom.visible_predicate_sql(v_me, p_organization_id, p_table_id,
                                 'viewer'::public.permission_level, 'r')
    -- ONLY-ME-LISTED (2026-10-02): the archive is a LIST too; an "Only me" row stays its owner's alone here.
    || format(' and platform.shown_to_lists(r.shown_to, r.visibility, r.created_by, r.organization_id, %L::uuid, %L::jsonb)',
              v_me, custom._record_shown_to_ctx(array[p_organization_id], p_table_id)),
    v_lane_sql,
    v_limit, greatest(coalesce(p_offset, 0), 0),
    v_in_ord, v_out_ord);

  for v_rec in execute v_sql loop
    id               := v_rec.id;
    document         := custom.choice_render(p_organization_id, p_table_id,
                          custom.mask_document(v_rec.doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared));
    -- BIG-VALUES-READERS: a value kept as a file carries its pointer, so every reader finds it.
    document := custom.with_whole_value_pointers(document, v_rec.wv_values, v_rec.wv_sources, v_visible, p_by_id, v_key_ids);
    level            := v_level;
    archived_at      := v_rec.archived_at;
    archived_by      := v_rec.archived_by;
    archived_by_name := v_rec.archived_by_name;
    return next;
  end loop;
end;
$function$;
