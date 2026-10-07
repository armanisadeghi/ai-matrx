-- lane: PERF-FIX-3
-- based-on: custom.data_home(uuid, text, boolean) a57f3265103a0a14eadb7599c0c1ccfdf8c1c628cda3fe3be5f18884c6f9161a
--
-- PERF-FIX-3 (2026-10-07). The data home walks once, not twice.
--   custom.data_home's one walk named only the organizations she is a member of. An organization she reaches
--   only through a share (a live grant on one of its Tables) still lists forms, portals and dashboards, and each
--   of those asks custom.hub_changed_by -> custom.visible_set for that organization, found no memo entry and
--   walked it again, alone (a second custom.tables_seen_among call: ~190 ms before PERF-FIX-3 part a, ~80 ms after,
--   for ONE organization of 179 Tables). The walk now also names those organizations. A walk's answer about an
--   organization never depends on which others are walked beside it (custom.tables_seen_among's header), so what the
--   later doors read back from the memo is what they would have worked out themselves.
-- Function body only: any hour.

set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION custom.data_home(p_organization_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_include_app_tables boolean DEFAULT false)
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
-- APP TABLES (lane CHAIR-DOORS-2, v6 N-C8, 2026-10-02): a Table the app keeps out of every default
-- list (custom.table_kept_out_of_lists — today the outputs an agent lands, kept_for agent_output) is
-- not among the tables unless p_include_app_tables is true — the page's "Show app tables" switch.
-- It is handed to custom.data_home_tables as is; it narrows, never widens, and searched rows obey it.
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
  -- PERF-FIX-3: ... AND FOR THE OTHER ORGANIZATIONS THE PAGE LISTS. An organization she reaches only through a
  -- share (a live grant on one of its Tables) has forms, portals or dashboards listed too, and each of
  -- those asks custom.hub_changed_by, which asks custom.visible_set for that organization - and found no
  -- memo entry, so the walk ran a second time, alone, for one organization. Walked here with the rest it
  -- is one pass; the answer about an organization never depends on which others are walked beside it
  -- (custom.tables_seen_among's header), so what visible_set reads back is what it would have worked out.
  perform count(*)
     from custom.tables_seen_once_per_group(v_me, array(
            select m.organization_id
              from iam.organization_member m
              join iam.organizations o on o.id = m.organization_id and o.archived_at is null
             where m.user_id = v_me
               and (p_organization_id is null or m.organization_id = p_organization_id)
            union
            select t.organization_id
              from iam.permissions g
              join custom.record t
                on t.id = g.resource_id
               and t.table_id = custom.table_kernel_id()
               and t.deleted_at is null
              join iam.organizations o on o.id = t.organization_id and o.archived_at is null
             where g.resource_type = 'record'
               and g.granted_to_user_id = v_me
               and g.status = 'active'
               and (g.expires_at is null or g.expires_at > now())
               and (p_organization_id is null or t.organization_id = p_organization_id)));

  -- LANE 10 FD (2026-10-02): each table row also says whether it is Foundation — read off the Table's
  -- own document (custom.table_is_foundation), one key lookup per row already admitted above.
  -- The rows keep the door's own order (WITH ORDINALITY, aggregated in it), exactly as before the join.
  select coalesce(jsonb_agg((to_jsonb(t) - 'ordinality')
                              || jsonb_build_object('foundation', coalesce(custom.table_is_foundation(r.data), false))
                            order by t.ordinality), '[]'::jsonb)
    into v_tables
    from custom.data_home_tables(p_organization_id, p_include_app_tables) with ordinality t
    left join custom.record r
      on r.organization_id = t.organization_id and r.id = t.table_id and r.table_id = custom.table_kernel_id();
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

  -- THE MAKER, BY NAME (lane DATA-HOME-3B2, 2026-10-01). Every Table row gains created_by_name: the
  -- name custom.history_people gives its maker (created_by) in the Table's own organization — the
  -- same door that names who changed a row on this page (custom.hub_changed_by), so Owner and
  -- Changed by never disagree about a person's name. Only a member of that organization is named;
  -- a maker who is not one (left, or never was) is null and the page shows its dash. One
  -- history_people call per organization, after any search narrowing; row order is kept.
  -- SYNCED FROM (lane VISION-REACH wave 3): every Table row also says where it syncs from — the
  -- provider of its sync_source ('postgres' for an outside database, 'google_sheets' for a sheet
  -- tab), null for a table of our own — read from the very Table record listed, so the home can
  -- badge it Synced.
  -- WHO CHANGED EACH TABLE, FROM THE SAME READ (lane CHAIR-STORE-PERF, 2026-10-03). The Tables listed
  -- above are the ones the one walk already admitted for her (custom.data_home_tables lists nothing
  -- else), and custom.hub_changed_by answers a live Table from that same walk — so asking it again,
  -- one organization at a time, re-decided what this statement had decided (51 asks, ~330 ms for a
  -- person in 38 organizations with Tables). Their changed-by row is read here, off the Table record
  -- this step already joins, with the name from the same custom.history_people call that names the
  -- maker. Same row, same shape: organization_id, id, at = updated_at (else created_at),
  -- who = the name of updated_by (else created_by), null when that person is not a member.
  -- Everything else the home lists (dashboards, digests, checklists, boards, forms, booking pages,
  -- portals), and any Table row not answered here, is still asked of custom.data_home_changed_by.
  with rows_ as materialized (
    select t.e, t.o,
           (t.e ->> 'organization_id')::uuid as org,
           (t.e ->> 'table_id')::uuid as id,
           (t.e ->> 'created_by')::uuid as maker,
           tr.data -> 'sync_source' ->> 'provider' as synced_from,
           coalesce(tr.updated_at, tr.created_at) as at,
           coalesce(tr.updated_by, tr.created_by) as changer,
           (tr.id is not null and tr.deleted_at is null and coalesce(tr.data_class, 'record') <> 'record') as answered
      from jsonb_array_elements(v_tables) with ordinality as t(e, o)
      left join custom.record tr
        on tr.organization_id = (t.e ->> 'organization_id')::uuid
       and tr.id = (t.e ->> 'table_id')::uuid
       and tr.table_id = custom.table_kernel_id()
  ), mk as (
    select r.org, array_agg(distinct p.id) as ids
      from rows_ r
      cross join lateral (values (r.maker), (case when r.answered then r.changer end)) as p(id)
     where p.id is not null
     group by 1
  ), people as materialized (
    -- asked once per organization (materialized: never once per row)
    select mk.org, custom.history_people(mk.org, mk.ids) as m from mk
  )
  select coalesce(jsonb_agg(r.e || jsonb_build_object('created_by_name', p.m #>> array[r.e ->> 'created_by', 'name'],
                                                      'synced_from', r.synced_from)
                  order by r.o), '[]'::jsonb),
         -- one row a Table, however many lanes listed it (the asks below were always a set)
         (select coalesce(jsonb_agg(jsonb_build_object('organization_id', c.org, 'id', c.id, 'at', c.at,
                                                       'who', cp.m #>> array[c.changer::text, 'name'])
                                    order by c.org, c.id), '[]'::jsonb)
            from (select distinct a.org, a.id, a.at, a.changer from rows_ a where a.answered) c
            left join people cp on cp.org = c.org)
    into v_tables, v_changed
    from rows_ r
    left join people p on p.org = r.org;

  with listed as (
    select x.organization_id as org, 'structure'::text as k, x.table_id as id
      from jsonb_to_recordset(v_tables) as x(organization_id uuid, table_id uuid)
    union
    select x.organization_id,
           case x.kind when 'form' then 'form' when 'booking' then 'form' when 'portal' then 'portal'
                       else 'structure' end,
           x.item_id
      from jsonb_to_recordset(v_items) as x(kind text, organization_id uuid, item_id uuid)
     where x.kind <> 'share'
  ), ids as (
    -- a structure answered above (a Table, or an item that IS that Table) is not asked again
    select l.org, l.k, l.id
      from listed l
     where not (l.k = 'structure'
                and exists (select 1 from jsonb_to_recordset(v_changed) as a(organization_id uuid, id uuid)
                             where a.organization_id = l.org and a.id = l.id))
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
