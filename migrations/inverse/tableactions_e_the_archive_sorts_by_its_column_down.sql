-- chair-step: puts the archive read back as it was before tableactions_e_the_archive_sorts_by_its_column.sql: custom.read_records_archived's body without the memo-named order, and custom.archived_tables_everywhere back to three arguments (the five-argument function and its door row dropped, the three-argument one and its door row restored, EXECUTE granted to authenticated again). The Data home's archive is again newest archived first only.
-- lane: TABLE-ACTIONS
-- lock: custom
-- based-on: custom.read_records_archived(uuid, uuid, text, boolean, integer, integer) 20907afeb39773e13c96f402816c9e57b997fe6513c70c4b53ab5e4959281d4b
-- based-on: custom.archived_tables_everywhere(text, integer, integer, text, boolean) 5932857ea6634c0e2bc997f0cd1a6a2790607570e52fdd4d6143fe9b471b367d

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
             order by r.deleted_at desc, r.id
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
     order by q.archived_at desc, q.id
  $q$,
    p_organization_id, p_table_id,
    custom.visible_predicate_sql(v_me, p_organization_id, p_table_id,
                                 'viewer'::public.permission_level, 'r')
    -- ONLY-ME-LISTED (2026-10-02): the archive is a LIST too; an "Only me" row stays its owner's alone here.
    || format(' and platform.shown_to_lists(r.shown_to, r.visibility, r.created_by, r.organization_id, %L::uuid, %L::jsonb)',
              v_me, custom._record_shown_to_ctx(array[p_organization_id], p_table_id)),
    v_lane_sql,
    v_limit, greatest(coalesce(p_offset, 0), 0));

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

drop function custom.archived_tables_everywhere(text, integer, integer, text, boolean);
delete from platform.client_callable_door where schema_name = 'custom' and function_name = 'archived_tables_everywhere' and identity_args = 'p_lane text, p_limit integer, p_offset integer, p_sort text, p_desc boolean';

CREATE OR REPLACE FUNCTION custom.archived_tables_everywhere(p_lane text DEFAULT 'org'::text, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
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
  v_window integer;
  v_cands  jsonb;
  v_n      integer;
  v_last   boolean;
  v_b_at   timestamptz;
  v_b_id   uuid;
  v_org    uuid;
  v_k      integer;
  v_name   text;
  v_ceil   integer;
  v_chunk  integer;
  v_at     integer;
  v_got    integer;
  v_page   jsonb;
  v_had    jsonb := '{}'::jsonb;   -- organization -> how many of its own newest it has answered
  v_spent  jsonb := '{}'::jsonb;   -- organization -> true once it has nothing more to give
  v_in     integer;
  v_all    jsonb := '[]'::jsonb;
  v_rows   jsonb;
begin
  -- THE ARCHIVED TABLES OF EVERY ORGANIZATION THE CALLER BELONGS TO (org-filter sweep, 2026-09-29;
  -- lane DATA-HOME-3B2, 2026-10-01). Every row comes from custom.read_records_archived over the
  -- Table kernel, which decides the organization wall (custom.assert_client_may_reach, reading the
  -- request's role through custom.caller_role(), so this door being SECURITY DEFINER admits nobody)
  -- and the row ladder in its own body; an organization whose wall refuses (42501) contributes
  -- nothing. This body only adds the answers together.
  --
  -- DRIVEN FROM THE ARCHIVE ROWS, NEVER FROM THE MEMBERSHIPS (TABLE-ACTIONS, 2026-10-03). Each
  -- organization asked costs its wall, its ladder, its mask and its rendering (60-300 ms on the
  -- clone), and this body used to ask EVERY organization holding an archived Table for its newest
  -- v_cap + v_off — 28 organizations and ~1,300 rendered rows for admin@admin.com to show 200, 4.6 s
  -- cold, a statement timeout under load. Now:
  --   1. THE WINDOW. The newest archived Tables across the person's organizations are read as keys
  --      only (organization, id, moment), one indexed statement. The ladder only ever REMOVES rows,
  --      so the page lies inside the window as soon as enough of the window is readable.
  --   2. ONLY THE ORGANIZATIONS IN THE WINDOW ARE ASKED, each for exactly as many of its own newest as
  --      it has in the window (its readable rows up to the window's edge are all among them), through
  --      the same door as before. An organization outside the window is never asked.
  --   3. If fewer than v_cap + v_off readable rows reach the window's edge, the window doubles and only
  --      the organizations' next rows are asked (the door's own offset). The answer is the same page
  --      the old body produced; the cost follows the page, not the number of organizations.
  v_need := v_cap + v_off;
  v_window := v_need;
  loop
    select coalesce(jsonb_agg(jsonb_build_object('o', c.organization_id, 'i', c.id, 'a', c.deleted_at)
                              order by c.deleted_at desc, c.id), '[]'::jsonb)
      into v_cands
      from (select r.organization_id, r.id, r.deleted_at
              from custom.record r
             where r.organization_id = any (array(select o.id
                                                    from iam.organizations o
                                                   where o.id in (select iam.my_orgs())
                                                     and o.archived_at is null))
               and r.table_id = v_kernel
               and r.deleted_at is not null
             order by r.deleted_at desc, r.id
             limit v_window) c;
    v_n := jsonb_array_length(v_cands);
    v_last := v_n < v_window;            -- the window holds every archived Table there is
    if v_n > 0 then
      v_b_at := (v_cands -> (v_n - 1) ->> 'a')::timestamptz;
      v_b_id := (v_cands -> (v_n - 1) ->> 'i')::uuid;
    end if;

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
    -- Every readable row up to the window's edge is now known. Enough of them is the page.
    select count(*) into v_in
      from jsonb_array_elements(v_all) w
     where (w ->> 'archived_at')::timestamptz > v_b_at
        or ((w ->> 'archived_at')::timestamptz = v_b_at and (w ->> 'id')::uuid <= v_b_id);
    exit when v_in >= v_need;
    v_window := v_window * 2;
  end loop;

  -- WHO MADE EACH TABLE ON THE PAGE (TABLE-ACTIONS, 2026-10-03): the Data home's "Mine" lane is the
  -- tables a person made, and custom.read_records_archived answers who ARCHIVED a row, never who made
  -- it. The page's rows carry `created_by` (the Table record's own maker) and `created_by_name` (the
  -- same name sentence the door gives its archiver: display name, full name, else the mailbox), asked
  -- by primary key for the rows on the page only.
  select coalesce(jsonb_agg(s.w || jsonb_build_object('created_by', r.created_by, 'created_by_name', p.nm)
                            order by s.o), '[]'::jsonb)
    into v_rows
    from (select w, row_number() over (order by (w ->> 'archived_at')::timestamptz desc nulls last, (w ->> 'id')::uuid) as o
            from jsonb_array_elements(v_all) w
           order by (w ->> 'archived_at')::timestamptz desc nulls last, (w ->> 'id')::uuid
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
  return jsonb_build_object('success', true, 'tables', v_rows, 'limit', v_cap, 'offset', v_off);
end
$function$

;

insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers, argument_rules) values ('custom', 'archived_tables_everywhere', 'p_lane text, p_limit integer, p_offset integer', '{25,23,23}'::oid[], 'SECURITY DEFINER wrapper (DATA-HOME-3B2, 2026-10-01). Reads the archived Tables of every organization the caller belongs to (iam.my_orgs()), each through custom.read_records_archived over the Table kernel, which decides the organization wall (custom.assert_client_may_reach, reading the request role via custom.caller_role(), so definer rights admit nobody) and the row ladder in its own body; an organization that refuses contributes nothing. Definer rights are used only to skip her organizations holding no archived Table at all (an existence test that narrows which organizations are asked, never an answer). Each organization is read in pages within its own page ceiling. It only adds the answers together and writes nothing.', 'datahome3b2_a_the_archive_everywhere_reads_each_organization_once_and_refuses_no_page.sql', NULL, 't', 'f', '{"version": 1, "arguments": {"p_lane": {"type": "text", "check": "vocabulary (mine|org) refused by custom.read_records_archived in each organization.", "position": 1, "verified": "2026-09-29 org-filter sweep"}, "p_limit": {"type": "integer", "check": "clamped to 1..1000 here; each organization is read in pages within custom.page_ceiling(org).", "position": 2, "verified": "2026-09-29 org-filter sweep"}, "p_offset": {"type": "integer", "check": "clamped to >= 0.", "position": 3, "verified": "2026-09-29 org-filter sweep"}}, "declared_at": "2026-09-29 org-filter sweep", "declared_by": "org_filter_sweep_2026_09_29"}'::jsonb) on conflict do nothing;

grant execute on function custom.archived_tables_everywhere(text, integer, integer) to authenticated;
