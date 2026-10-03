-- chair-step: custom.archived_tables_everywhere gains two arguments (p_sort text DEFAULT 'archived_at', p_desc boolean DEFAULT true), so the three-argument function is DROPPED and the five-argument one CREATED in its place — its platform.client_callable_door row is replaced (old identity deleted, new one declared) and EXECUTE is granted to `authenticated` again (signed-in only; anon gains nothing). A call with the old three arguments resolves to the new function with the defaults and answers exactly as before. It also REPLACES the body of custom.read_records_archived (same signature and grants): the page's order may be named by the caller in the statement memo (custom.archived_order: archived desc|asc, name asc|desc); with nothing named, exactly as before. No table, column, index, trigger or policy is touched.
-- lane: TABLE-ACTIONS
-- lock: custom
-- based-on: custom.read_records_archived(uuid, uuid, text, boolean, integer, integer) 5a37758f045e6b746035d6da0917760ee2f1193e45ed50e94ad6697508eeb9fc
-- based-on: custom.archived_tables_everywhere(text, integer, integer) 2c592e85cf2167a9966788310b37c453a1ccc24b6ce79891751204d27609e929
--
-- The inverse is `migrations/inverse/tableactions_e_the_archive_sorts_by_its_column_down.sql`.
--
-- THE ARCHIVE SORTS BY ITS COLUMN (TABLE-ACTIONS, 2026-10-03). Every list column sorts; the Data
-- home's Archived and "All" views ignored the sort and always showed newest archived first, because
-- the store paged the archive in that one order. custom.archived_tables_everywhere now takes the sort
-- (archived_at · name · organization, either direction), cuts its window across organizations in that
-- order and asks each organization's door for its rows in the same order, so the page is exact and
-- only the organizations on it are asked.

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
  v_sql := format($q$
    select q.id,
           custom.record_values_of(q.rr) as doc, (q.rr).data -> '_values' as wv_values, (q.rr).data -> '_sources' as wv_sources,
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
$function$
;

drop function custom.archived_tables_everywhere(text, integer, integer);

delete from platform.client_callable_door where schema_name = 'custom' and function_name = 'archived_tables_everywhere' and identity_args = 'p_lane text, p_limit integer, p_offset integer';

CREATE FUNCTION custom.archived_tables_everywhere(p_lane text DEFAULT 'org'::text, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0, p_sort text DEFAULT 'archived_at'::text, p_desc boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_cap    integer := least(greatest(coalesce(p_limit, 100), 1), 1000);
  v_off    integer := greatest(coalesce(p_offset, 0), 0);
  v_need   integer;
  v_kernel uuid := custom.table_kernel_id();
  v_me     uuid := auth.uid();
  v_sort   text := lower(coalesce(nullif(btrim(p_sort), ''), 'archived_at'));
  v_desc   boolean := coalesce(p_desc, true);
  v_dir    text;
  v_order  text;          -- the page order each organization's door is asked for (statement memo)
  v_rank   text;          -- the same order across organizations, for the window
  v_prev   text;
  v_window integer;
  v_cands  jsonb;
  v_n      integer;
  v_last   boolean;
  v_org    uuid;
  v_k      integer;
  v_name   text;
  v_ceil   integer;
  v_chunk  integer;
  v_at     integer;
  v_got    integer;
  v_page   jsonb;
  v_had    jsonb := '{}'::jsonb;
  v_spent  jsonb := '{}'::jsonb;
  v_in     integer;
  v_all    jsonb := '[]'::jsonb;
  v_rows   jsonb;
begin
  -- THE ARCHIVED TABLES OF EVERY ORGANIZATION THE CALLER BELONGS TO, in the order the person sorted
  -- the list by (TABLE-ACTIONS, 2026-10-03: every list column sorts). Every row still comes from
  -- custom.read_records_archived over the Table kernel, which decides the wall, the ladder and the
  -- lane; an organization whose wall refuses contributes nothing. This body only adds the answers.
  --
  -- p_sort: archived_at (default, newest first) · name · organization; p_desc flips it. Each
  -- organization's door is asked for its rows in the same order (named in the statement memo,
  -- custom.archived_order), so a window cut across organizations is exact:
  --   1. THE WINDOW: the first limit + offset archived Tables across the person's organizations in
  --      that order, read as keys (organization, id) in one indexed statement, each with its rank;
  --   2. only the organizations in the window are asked, each for as many of its own as it has there;
  --   3. if fewer readable rows than limit + offset reach the window's edge, the window doubles.
  -- By organization: the organizations in name order, newest archived first inside each.
  v_dir := case when v_desc then 'desc' else 'asc' end;
  case v_sort
    when 'name' then
      v_order := case when v_desc then 'name_desc' else 'name_asc' end;
      v_rank := format($o$lower(coalesce(r.data ->> 'name', '')) %s, r.id$o$, v_dir);
    when 'organization' then
      v_order := 'archived_desc';
      v_rank := format($o$lower(o.name::text) %s, o.id, r.deleted_at desc, r.id$o$, v_dir);
    else
      v_sort := 'archived_at';
      v_order := case when v_desc then 'archived_desc' else 'archived_asc' end;
      v_rank := format('r.deleted_at %s, r.id', v_dir);
  end case;

  v_prev := platform.memo_k_get('custom.archived_order:' || coalesce(v_me::text, '-'));
  if v_me is not null then
    perform platform.memo_k_put('custom.archived_order:' || v_me::text, v_order);
  end if;

  v_need := v_cap + v_off;
  v_window := v_need;
  loop
    execute format($q$
      select coalesce(jsonb_agg(jsonb_build_object('o', c.organization_id, 'i', c.id, 'n', c.n) order by c.n), '[]'::jsonb)
        from (select r.organization_id, r.id, row_number() over (order by %s) as n
                from custom.record r
                join iam.organizations o on o.id = r.organization_id
               where r.organization_id = any (array(select x.id
                                                      from iam.organizations x
                                                     where x.id in (select iam.my_orgs())
                                                       and x.archived_at is null))
                 and r.table_id = $1
                 and r.deleted_at is not null
               order by %s
               limit $2) c
    $q$, v_rank, v_rank)
      into v_cands
      using v_kernel, v_window;
    v_n := jsonb_array_length(v_cands);
    v_last := v_n < v_window;

    for v_org, v_k in
      select (x ->> 'o')::uuid, count(*)::integer
        from jsonb_array_elements(v_cands) x
       group by 1
    loop
      continue when v_spent ? v_org::text;
      v_at := coalesce((v_had ->> v_org::text)::integer, 0);
      continue when v_at >= v_k;
      select o.name::text into v_name from iam.organizations o where o.id = v_org;
      begin
        v_ceil := greatest(coalesce(custom.page_ceiling(v_org), 200), 1);
        loop
          v_chunk := least(v_k - v_at, v_ceil);
          exit when v_chunk < 1;
          select coalesce(jsonb_agg(to_jsonb(x) || jsonb_build_object('organization_id', v_org,
                                                                      'organization_name', v_name)), '[]'::jsonb),
                 count(*)
            into v_page, v_got
            from custom.read_records_archived(v_org, v_kernel, p_lane, false, v_chunk, v_at) x;
          v_all := v_all || v_page;
          v_at := v_at + v_got;
          if v_got < v_chunk then
            v_spent := v_spent || jsonb_build_object(v_org::text, true);
            exit;
          end if;
        end loop;
        v_had := v_had || jsonb_build_object(v_org::text, v_at);
      exception when insufficient_privilege then
        v_spent := v_spent || jsonb_build_object(v_org::text, true);
        continue;
      end;
    end loop;

    exit when v_last;
    -- Every readable row up to the window's edge is now known (it carries a rank). Enough is the page.
    select count(*) into v_in
      from jsonb_array_elements(v_all) w
      join jsonb_array_elements(v_cands) c on c ->> 'i' = w ->> 'id';
    exit when v_in >= v_need;
    v_window := v_window * 2;
  end loop;

  if v_me is not null then
    perform platform.memo_k_put('custom.archived_order:' || v_me::text, coalesce(v_prev, 'archived_desc'));
  end if;

  -- THE PAGE, by rank; and WHO MADE EACH TABLE ON IT (tableactions_d: `created_by`, the Table record's
  -- own maker, and `created_by_name`), asked by primary key for the page's rows only.
  select coalesce(jsonb_agg(s.w || jsonb_build_object('created_by', r.created_by, 'created_by_name', p.nm)
                            order by s.n), '[]'::jsonb)
    into v_rows
    from (select w, (c ->> 'n')::bigint as n
            from jsonb_array_elements(v_all) w
            join jsonb_array_elements(v_cands) c on c ->> 'i' = w ->> 'id'
           order by (c ->> 'n')::bigint
           limit v_cap offset v_off) s
    left join custom.record r
      on r.organization_id = (s.w ->> 'organization_id')::uuid and r.id = (s.w ->> 'id')::uuid
    left join lateral (
           select coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''),
                           nullif(u.raw_user_meta_data ->> 'full_name', ''),
                           split_part(u.email::text, '@', 1)) as nm
             from iam.organization_member m
             join auth.users u on u.id = m.user_id
            where m.organization_id = r.organization_id
              and m.user_id = r.created_by
            limit 1) p on true;
  return jsonb_build_object('success', true, 'tables', v_rows, 'limit', v_cap, 'offset', v_off,
                            'sort', v_sort, 'desc', v_desc);
end
$function$
;

comment on function custom.archived_tables_everywhere(text, integer, integer, text, boolean) is
  'TABLE-ACTIONS. The archived Tables of every organization the caller belongs to, a page at a time, in the order asked (archived_at, name or organization; p_desc), each row read through custom.read_records_archived (wall, ladder, lane) and carrying created_by / created_by_name. Only the organizations on the page are asked.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values
  ('custom', 'archived_tables_everywhere',
   'p_lane text, p_limit integer, p_offset integer, p_sort text, p_desc boolean',
   array['text'::regtype::oid, 'int4'::regtype::oid, 'int4'::regtype::oid, 'text'::regtype::oid, 'bool'::regtype::oid],
   'SECURITY DEFINER wrapper. Reads the archived Tables of every organization the caller belongs to (iam.my_orgs()), each through custom.read_records_archived over the Table kernel, which decides the organization wall (custom.assert_client_may_reach, reading the request role via custom.caller_role(), so definer rights admit nobody) and the row ladder in its own body; an organization that refuses contributes nothing. Definer rights are used only to read which archived Tables exist (keys, in the asked order) so that only the organizations on the page are asked. It writes nothing but the statement memo naming the page order.',
   'tableactions_e_the_archive_sorts_by_its_column.sql', null, true, false,
   jsonb_build_object(
     'version', 1,
     'declared_by', 'tableactions_e_the_archive_sorts_by_its_column.sql',
     'arguments', jsonb_build_object(
       'p_lane', jsonb_build_object('type', 'text', 'position', 1, 'optional', true, 'sql_default', '''org''',
         'check', 'vocabulary (mine|org) refused by custom.read_records_archived in each organization.',
         'foreign', jsonb_build_object('not_an_id', true), 'null_rule', jsonb_build_object('means', 'org')),
       'p_limit', jsonb_build_object('type', 'integer', 'position', 2, 'optional', true, 'sql_default', '100',
         'check', 'clamped to 1..1000; each organization is read in pages within custom.page_ceiling(org).',
         'foreign', jsonb_build_object('not_an_id', true), 'null_rule', jsonb_build_object('means', '100')),
       'p_offset', jsonb_build_object('type', 'integer', 'position', 3, 'optional', true, 'sql_default', '0',
         'check', 'clamped to >= 0.', 'foreign', jsonb_build_object('not_an_id', true), 'null_rule', jsonb_build_object('means', '0')),
       'p_sort', jsonb_build_object('type', 'text', 'position', 4, 'optional', true, 'sql_default', '''archived_at''',
         'check', 'A word: archived_at | name | organization; anything else is archived_at.',
         'foreign', jsonb_build_object('not_an_id', true), 'null_rule', jsonb_build_object('means', 'archived_at')),
       'p_desc', jsonb_build_object('type', 'boolean', 'position', 5, 'optional', true, 'sql_default', 'true',
         'check', 'The direction of p_sort.', 'foreign', jsonb_build_object('not_an_id', true), 'null_rule', jsonb_build_object('means', 'true')))))
on conflict do nothing;

grant execute on function custom.archived_tables_everywhere(text, integer, integer, text, boolean) to authenticated;
