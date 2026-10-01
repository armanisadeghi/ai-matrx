-- chair-step: this REPLACES custom.data_home(uuid) — the data home page's one call — with custom.data_home(uuid, text): the same door with one more defaulted argument, p_search. Unsearched (null or blank), the answer is the old one byte for byte. Searched, the same {tables, items, changed_by} come back narrowed to the rows that match, ranked by public.mtx_search_score (the platform's one scorer) on the Table's title, its description and its Fields' labels and keys; each matching row gains match_rank, matched_in and matched_field. A defaulted argument changes the signature, so the function is dropped and made again (as datahome2_i did for data_home_tables); its platform.client_callable_door row is moved to the new identity and its EXECUTE grant to authenticated is kept. No table, no permission change, no data row is touched; only catalog locks (measured on the clone, PROGRESS-DATA-HOME-3B).
-- lane: DATA-HOME-3B
-- based-on: custom.data_home(uuid) 44c71d95dea0deee891793f706c98a5016285c98d616df3777abdaccf8cb2e53
--
-- THE DATA HOME FINDS WHAT A ROW DOES NOT CARRY (DATA-HOME-3-SPEC §2.2 layer 2, Lane B). The page's
-- instant search ranks the rows it holds (title, organization, owner, kind). What it cannot see is a
-- Table's description and its Fields — "which table has a Furnace model column". This door answers
-- that, in the same one call, without a second walk of which Tables she may open:
--   * The rows searched are exactly the rows custom.data_home_tables / custom.data_home_items answer
--     for her (their visibility is decided there, through custom.query_visible_ids and
--     custom.visible_set); this body never reads a record's visibility and never widens that set.
--   * A Table's description is read from the Table's own record, its Fields from the Field kernel
--     (data.entity_definition_id = the Table), live Fields only — the same Fields custom.applicable_fields
--     hands anyone who may know the Table.
--   * Rank: public.mtx_search_score(q, id, title, description, -, -, field labels, field keys) — title
--     first (exact 10000, prefix 5000, whole word 3000, inside 2000), description 500-1000, field
--     label 300, field key 100, all words required for a several-word query. Ties: the shorter title
--     (the closer match), then the newest. The id arm counts only for a whole id pasted in.
--   * Records search (the spec's Deep layer) is NOT here: no read door answers across Tables under the
--     access ladder today (verified 2026-10-01, PROGRESS-DATA-HOME-3B), so the page offers no Deep toggle.
--   * Record counts are NOT here: the exact per-reader count (custom.table_row_counts) cost 5.5-9.9 s
--     for 416-530 Tables on the clone, against a 0.7-1.3 s home; no maintained count exists.
--
-- Guard: matrx-frontend/scripts/campaign-tests/datahome3b_the_data_home_searches_titles_descriptions_and_fields.sql
-- Inverse: migrations/inverse/datahome3_a_the_data_home_searches_titles_descriptions_and_fields_down.sql

drop function if exists custom.data_home(uuid);

CREATE FUNCTION custom.data_home(p_organization_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
-- THE DATA HOME IN ONE CALL (lane DATA-HOME-2, chair ruling 2026-09-29). The page asked three doors —
-- custom.data_home_tables, custom.data_home_items, custom.data_home_changed_by — and each paid the
-- walk of which Tables she may open (custom.tables_seen_once_per_group). This door asks the walk ONCE, for all
-- the person's organizations (or the one named), and then calls those three doors in this same
-- statement: each finds its organizations already answered in the statement memo and does not walk
-- them again. The rows are therefore the three doors' own, unchanged:
--   tables      = custom.data_home_tables(p_organization_id), every column
--   items       = custom.data_home_items(p_organization_id), every column
--   changed_by  = custom.data_home_changed_by(asks) where asks names, per organization, every row
--                 the page shows who-changed-it for: Tables and dashboards, digests, checklists and
--                 boards as 'structure', forms and booking pages as 'form', portals as 'portal'
--                 (outside shares have none), at most 500 ids an ask and 200 asks a call.
-- SEARCHED (lane DATA-HOME-3B, 2026-10-01): p_search narrows those same rows to the ones that match and
-- ranks them (see the campaign file's header); unsearched, nothing below the walk changes.
declare
  v_me      uuid := custom.query_principal();
  v_q       text := nullif(btrim(coalesce(p_search, '')), '');
  v_qid     uuid;
  v_tables  jsonb;
  v_items   jsonb;
  v_asks    jsonb;
  v_changed jsonb := '[]'::jsonb;
  v_part    jsonb;
  v_n       integer;
  v_i       integer := 0;
begin
  -- THE DOOR DECIDES, FIRST, IN ITS OWN NAME: an organization named is one the caller may reach, or
  -- the call is refused here, naming this door. Named nobody, the doors below admit only
  -- organizations the caller reaches.
  if p_organization_id is not null then
    perform custom.assert_client_may_reach(p_organization_id, 'custom.data_home');
  end if;
  if v_q is not null and length(v_q) > 200 then
    raise exception 'custom.data_home searches at most 200 characters; this search has %.', length(v_q)
      using errcode = '22023', hint = 'Search for a shorter phrase. Nothing was read.';
  end if;
  if v_me is null then
    return jsonb_build_object('tables', '[]'::jsonb, 'items', '[]'::jsonb, 'changed_by', '[]'::jsonb);
  end if;

  -- THE ONE WALK, for every organization of hers at once (the same organizations the three doors ask).
  perform count(*)
     from custom.tables_seen_once_per_group(v_me, array(
            select m.organization_id
              from iam.organization_member m
              join iam.organizations o on o.id = m.organization_id and o.archived_at is null
             where m.user_id = v_me
               and (p_organization_id is null or m.organization_id = p_organization_id)));

  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_tables
    from custom.data_home_tables(p_organization_id) t;
  select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb) into v_items
    from custom.data_home_items(p_organization_id) i;

  if v_q is not null then
    -- A WHOLE ID PASTED IN finds its row outright; any shorter run of hex never matches an id.
    if v_q ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_qid := v_q::uuid;
    end if;

    -- THE TABLES SHE MAY OPEN (above), ranked on title, description and Fields.
    with t as (
      select e as row_, (e ->> 'table_id')::uuid as id, (e ->> 'organization_id')::uuid as org,
             coalesce(e ->> 'table_name', '') as nm, (e ->> 'updated_at')::timestamptz as at
        from jsonb_array_elements(v_tables) e
    ), d as (
      -- the Table's own description, read from the very Table record listed above
      select r.id, nullif(btrim(r.data ->> 'description'), '') as descr
        from t
        join custom.record r
          on r.organization_id = t.org
         and r.id = t.id
         and r.table_id = custom.table_kernel_id()
    ), f as (
      -- its live Fields (custom.applicable_fields' own rule: data.entity_definition_id = the Table)
      select (fr.data ->> 'entity_definition_id') as tid,
             array_agg(coalesce(nullif(btrim(fr.data ->> 'label'), ''), fr.data ->> 'key')
                       order by (fr.data ->> 'sort') nulls last, fr.id) as labels,
             array_agg(coalesce(fr.data ->> 'key', '') order by (fr.data ->> 'sort') nulls last, fr.id) as keys
        from custom.record fr
       where fr.organization_id = any (array(select distinct t.org from t))
         and fr.table_id = custom.field_kernel_id()
         and fr.deleted_at is null
         and (fr.data ->> 'entity_definition_id') in (select t.id::text from t)
       group by 1
    ), s as (
      select t.row_, t.nm, t.at, d.descr, f.labels, f.keys,
             public.mtx_search_score(v_q, case when v_qid is not null then t.id end, t.nm, d.descr,
                                     null, null, coalesce(f.labels, '{}'), coalesce(f.keys, '{}')) as rank,
             (v_qid is not null and t.id = v_qid) as by_id
        from t
        left join d on d.id = t.id
        left join f on f.tid = t.id::text
    ), hit as (
      select s.*,
             case
               when s.by_id then 'id'
               when public.mtx_search_score(v_q, null, s.nm, null, null, null) > 0 then 'name'
               when public.mtx_search_score(v_q, null, null, s.descr, null, null) > 0 then 'description'
               when public.mtx_search_score(v_q, null, null, null, null, null, coalesce(s.labels, '{}'), coalesce(s.keys, '{}')) > 0 then 'field'
               -- several words spread over title, description and Fields: say where the first word is
               when position(split_part(lower(v_q), ' ', 1) in lower(s.nm)) > 0 then 'name'
               when position(split_part(lower(v_q), ' ', 1) in lower(coalesce(s.descr, ''))) > 0 then 'description'
               else 'field'
             end as matched_in
        from s
       where s.rank > 0
    )
    select coalesce(jsonb_agg(
             h.row_ || jsonb_build_object(
               'match_rank', h.rank,
               'matched_in', h.matched_in,
               'matched_field', case when h.matched_in = 'field' then
                  (select coalesce(l.label, k.key)
                     from unnest(coalesce(h.labels, '{}')) with ordinality as l(label, o)
                     full join unnest(coalesce(h.keys, '{}')) with ordinality as k(key, o) using (o)
                    where position(split_part(lower(v_q), ' ', 1) in lower(coalesce(l.label, ''))) > 0
                       or position(split_part(lower(v_q), ' ', 1) in lower(coalesce(k.key, ''))) > 0
                    -- the Field that holds the whole search first, then the first that holds its first word
                    order by (position(lower(v_q) in lower(coalesce(l.label, ''))) > 0) desc,
                             (position(lower(v_q) in lower(coalesce(k.key, ''))) > 0) desc,
                             o
                    limit 1) end)
             order by h.rank desc, length(h.nm), h.at desc nulls last, h.nm), '[]'::jsonb)
      into v_tables
      from hit h;

    -- THE REST THE HOME LISTS (forms, booking pages, portals, dashboards, digests, checklists,
    -- automations, outside shares), ranked on their own title and description.
    with i as (
      select e as row_,
             coalesce(e -> 'item_row' ->> 'title', e -> 'item_row' ->> 'name', e -> 'item_row' ->> 'label', '') as nm,
             nullif(btrim(e -> 'item_row' ->> 'description'), '') as descr,
             (e ->> 'item_id')::uuid as id
        from jsonb_array_elements(v_items) e
    ), s as (
      select i.*,
             public.mtx_search_score(v_q, case when v_qid is not null then i.id end, i.nm, i.descr, null, null) as rank,
             (v_qid is not null and i.id = v_qid) as by_id
        from i
    )
    select coalesce(jsonb_agg(
             s.row_ || jsonb_build_object(
               'match_rank', s.rank,
               'matched_in', case when s.by_id then 'id'
                                  when public.mtx_search_score(v_q, null, null, s.descr, null, null) > 0
                                   and public.mtx_search_score(v_q, null, s.nm, null, null, null) = 0 then 'description'
                                  else 'name' end,
               'matched_field', null)
             order by s.rank desc, length(s.nm), s.nm), '[]'::jsonb)
      into v_items
      from s
     where s.rank > 0;
  end if;

  with ids as (
    select x.organization_id as org, 'structure'::text as k, x.table_id as id
      from jsonb_to_recordset(v_tables) as x(organization_id uuid, table_id uuid)
    union
    select x.organization_id,
           case x.kind when 'form' then 'form' when 'booking' then 'form' when 'portal' then 'portal'
                       else 'structure' end,
           x.item_id
      from jsonb_to_recordset(v_items) as x(kind text, organization_id uuid, item_id uuid)
     where x.kind <> 'share'
  ), chunked as (
    select org, k, id, (row_number() over (partition by org, k order by id) - 1) / 500 as c from ids
  )
  select jsonb_agg(jsonb_build_object('organization_id', org, 'kind', k, 'ids', ids) order by org, k, c)
    into v_asks
    from (select org, k, c, jsonb_agg(id order by id) as ids from chunked group by org, k, c) q;

  v_n := coalesce(jsonb_array_length(v_asks), 0);
  while v_i < v_n loop
    select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) into v_part
      from custom.data_home_changed_by(
             (select jsonb_agg(e order by o) from jsonb_array_elements(v_asks) with ordinality as a(e, o)
               where o > v_i and o <= v_i + 200)) c;
    v_changed := v_changed || v_part;
    v_i := v_i + 200;
  end loop;

  if v_q is null then
    return jsonb_build_object('tables', v_tables, 'items', v_items, 'changed_by', v_changed);
  end if;
  return jsonb_build_object('tables', v_tables, 'items', v_items, 'changed_by', v_changed, 'search', v_q);
end;
$function$;

-- THE DOOR ROW FOLLOWS ITS FUNCTION to the new identity (platform.door_identity_is_the_catalogs checks it).
update platform.client_callable_door
   set identity_args     = 'p_organization_id uuid, p_search text',
       identity_argtypes = array['uuid'::regtype::oid, 'text'::regtype::oid],
       declared_by       = 'datahome3_a_the_data_home_searches_titles_descriptions_and_fields.sql',
       reason            = 'Decides a named organization first in its own name (custom.assert_client_may_reach), asks the Table-visibility walk (custom.tables_seen_once_per_group) once for the caller''s organizations, then answers with the rows of custom.data_home_tables, custom.data_home_items and custom.data_home_changed_by — each of which decides every organization and row by its own walls, unchanged. p_organization_id only NARROWS. p_search (at most 200 characters) only NARROWS those same rows to the ones whose title, description or Field labels and keys match, ranked by public.mtx_search_score; it reads no record outside them and never widens them. An anonymous caller gets empty lists. It writes nothing.'
 where schema_name = 'custom' and function_name = 'data_home';

update platform.client_callable_door
   set reason = replace(reason, 'SERVED BY custom.data_home(uuid)', 'SERVED BY custom.data_home(uuid, text)')
 where schema_name = 'custom'
   and function_name in ('data_home_tables', 'data_home_items', 'data_home_changed_by')
   and reason like '%SERVED BY custom.data_home(uuid)%';

grant execute on function custom.data_home(uuid, text) to authenticated;
