-- lane: HOT-DOORS-7
-- based-on: iam._memo_ask(text, uuid, uuid, uuid, uuid[], text, text, integer, integer) 54b1b9250fcf8f5cd9a4ddcfdc86bdeb541361894459f3ccd977a28c845eca54
-- based-on: iam._memo_pair(text, uuid, uuid, uuid, uuid[], text, text, integer, integer) 94b9a0ba4c0749617c00b434908053cdc2e2a73faacfc091d09c33fba073505e
-- based-on: iam.kernel_memo_compare(integer, integer) 629799ee17ef7f55ce7f1f8ce08b83489666bba2c429b24711e1f4e775a9eaba
--
-- HOT-DOORS-7 c (2026-10-09). The standing memo comparison (iam.kernel_memo_compare, cron kernel-memo-sweep) asks the
-- two new set paths too, memo off then on, as each sweep seat: 'kvs' = custom.visible_set per organization vs
-- custom.kernel_viewer_sets, 'hub' = custom.data_home_changed_by after the data home's walk (off: one
-- custom.hub_changed_by per ask; on: custom.hub_changed_by_many). custom.query_visible_ids' new branch is already asked
-- through the 'home' kind (custom.data_home_items). Planted faults: scripts/db-proofs/memo-path-agreement.py.
-- Inverse: migrations/inverse/hotdoors7_c_the_memo_sweep_compares_the_new_set_paths_down.sql

set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION iam._memo_ask(p_kind text, p_person uuid, p_org uuid, p_table uuid, p_ids uuid[], p_level text, p_search text, p_limit integer, p_offset integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- MEMO-SWEEP k: the one place the comparison asks a read path. Called by iam._memo_pair with the role GUC set to
-- authenticated, so custom.caller_role() / custom.query_is_store_owner() answer as they do for a signed-in client; the body
-- runs as its owner like every real door does. Refuses any session that did not log in as postgres (session_user does not
-- move under SET ROLE or a definer, and PostgREST sessions log in as authenticator). Reads only.
declare
  v_on     jsonb;
  v_orgs   uuid[];
  v_hint   uuid[];
  v_off    boolean := coalesce(current_setting('mx.kernel_batch', true), '') = 'off';
  v_hub    jsonb;  -- HOT-DOORS-7
begin
  if session_user::text <> 'postgres' then
    raise exception 'iam._memo_ask is for the memo comparison only' using errcode = '42501';
  end if;
      if p_kind = 'levels' then
        v_on := custom.levels_of(p_person, p_ids);
      elsif p_kind = 'team' then
        select coalesce(jsonb_agg(jsonb_build_array(m.organization_id, m.user_id) order by m.organization_id, m.user_id), '[]'::jsonb) into v_on
          from iam.my_team_reach(p_org) m;
      elsif p_kind = 'shown' then
        v_on := coalesce(custom._record_shown_to_ctx(p_ids, p_table), 'null'::jsonb);
      elsif p_kind = 'home' then
        select coalesce(jsonb_agg(to_jsonb(m) order by m.kind, m.organization_id, m.item_id, m.table_id), '[]'::jsonb) into v_on
          from custom.data_home_items(p_org) m;
      elsif p_kind = 'many_in' then
        -- the batch form with MIXED hints against the kernel asked one target at a time (the memo-off arm)
        if v_off then
          select coalesce(jsonb_object_agg(t::text, iam.has_access_for(p_person, 'record', t, p_level::public.permission_level)), '{}'::jsonb)
            into v_on from unnest(p_ids) t;
        else
          v_orgs := array(select om.organization_id from iam.organization_member om where om.user_id = p_person order by om.organization_id limit 8);
          v_hint := array(select case i % 4
                     when 0 then (select r.organization_id from custom.record r where r.id = p_ids[i] limit 1)
                     when 1 then v_orgs[1 + (i % greatest(cardinality(v_orgs), 1))]
                     when 2 then null
                     else '00000000-0000-0000-0000-000000000001'::uuid end
                   from generate_subscripts(p_ids, 1) i order by i);
          select coalesce(jsonb_object_agg(m.target::text, m.allowed), '{}'::jsonb) into v_on
            from iam.has_access_for_many_in(p_person, p_ids, v_hint, p_level, 'record') m;
        end if;
      elsif p_kind in ('among', 'once') then
        v_orgs := array(select om.organization_id from iam.organization_member om where om.user_id = p_person order by om.organization_id limit 8);
        if p_kind = 'among' then
          select coalesce(jsonb_agg(jsonb_build_array(m.organization_id, m.id, m.seen) order by m.organization_id, m.id), '[]'::jsonb) into v_on
            from custom.tables_seen_among(p_person, v_orgs, p_ids) m;
        else
          select coalesce(jsonb_agg(jsonb_build_array(m.organization_id, m.id, m.seen) order by m.organization_id, m.id), '[]'::jsonb) into v_on
            from custom.tables_seen_once_per_group(p_person, v_orgs) m;
        end if;
      elsif p_kind = 'kvs' then
        -- HOT-DOORS-7: custom.visible_set (Table kernel, viewer) per organization (memo off) vs custom.kernel_viewer_sets
        if v_off then
          select coalesce(jsonb_agg(jsonb_build_array(x.o, v.o_fallback, v.o_all_visible,
                   (select coalesce(jsonb_agg(g order by g), '[]'::jsonb) from unnest(v.o_granted_all) g),
                   (select coalesce(jsonb_agg(c order by c), '[]'::jsonb) from unnest(v.o_carried_visible) c)) order by x.n), '[]'::jsonb)
            into v_on
            from unnest(p_ids) with ordinality x(o, n)
            cross join lateral custom.visible_set(p_person, x.o, custom.table_kernel_id(), 'viewer'::public.permission_level) v;
        else
          select coalesce(jsonb_agg(jsonb_build_array(k.organization_id, k.fallback, k.all_visible,
                   (select coalesce(jsonb_agg(g order by g), '[]'::jsonb) from unnest(k.granted_all) g),
                   (select coalesce(jsonb_agg(c order by c), '[]'::jsonb) from unnest(k.carried_visible) c)) order by k.n), '[]'::jsonb)
            into v_on
            from custom.kernel_viewer_sets(p_person, p_ids) with ordinality k(organization_id, fallback, all_visible, granted_all, carried_visible, n);
        end if;
      elsif p_kind = 'hub' then
        -- HOT-DOORS-7: custom.data_home_changed_by after the data home's walk, asks built from the organizations' own rows
        -- (structure: non-business rows and Tables; form; portal); memo off = one custom.hub_changed_by per ask
        perform count(*) from custom.tables_seen_once_per_group(p_person, p_ids);
        select coalesce(jsonb_agg(a.ask order by a.o, a.k), '[]'::jsonb) into v_hub
          from (
            select x.o, 1 as k, jsonb_build_object('organization_id', x.o, 'kind', 'structure', 'ids',
                     (select coalesce(jsonb_agg(r.id), '[]'::jsonb) from (select r.id from custom.record r
                        where r.organization_id = x.o and coalesce(r.data_class, 'record') <> 'record'
                        order by md5(r.id::text) limit 60) r)) as ask
              from unnest(p_ids) x(o)
            union all
            select x.o, 2, jsonb_build_object('organization_id', x.o, 'kind', 'form', 'ids',
                     (select coalesce(jsonb_agg(f.id), '[]'::jsonb) from (select f.id from custom.anon_form f
                        where f.organization_id = x.o order by md5(f.id::text) limit 30) f))
              from unnest(p_ids) x(o)
            union all
            select x.o, 3, jsonb_build_object('organization_id', x.o, 'kind', 'portal', 'ids',
                     (select coalesce(jsonb_agg(p.id), '[]'::jsonb) from (select p.id from custom.portal p
                        where p.organization_id = x.o order by md5(p.id::text) limit 10) p))
              from unnest(p_ids) x(o)) a;
        select coalesce(jsonb_agg(to_jsonb(c) order by c.organization_id, c.id, to_jsonb(c)::text), '[]'::jsonb) into v_on
          from custom.data_home_changed_by(v_hub) c;
      elsif p_kind = 'many' then
        select coalesce(jsonb_object_agg(m.target::text, m.reaches), '{}'::jsonb) into v_on
          from custom.reaches_directly_many(p_person, p_ids, 'record', p_level::public.permission_level) m;
      else
        v_on := custom.read_records_page(p_org, p_table, '{}'::jsonb, p_search, '[]'::jsonb, null, false, p_limit, p_offset);
      end if;
  return v_on;
end;
$function$
;

CREATE OR REPLACE FUNCTION iam._memo_pair(p_kind text, p_person uuid, p_org uuid, p_table uuid, p_ids uuid[], p_level text, p_search text, p_limit integer, p_offset integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
-- MEMO-SWEEP: ask custom.levels_of ('levels'), custom.reaches_directly_many ('many') or custom.read_records_page ('page')
-- as p_person with the statement memo off, then on (platform.memo_clear() before each), and return
-- {"same": bool, "slots": live memo slots after the 'on' run, "diff": [first differing keys]}. Never writes.
declare
  v_off   jsonb;
  v_on    jsonb;
  v_snap  text;
  v_slots integer;
  v_diff  jsonb := '[]'::jsonb;
  v_mode  text;
begin
  perform pg_catalog.set_config('request.jwt.claims',
            jsonb_build_object('sub', p_person, 'role', 'authenticated')::text, true);
  perform pg_catalog.set_config('request.jwt.claim.sub', p_person::text, true);
  foreach v_mode in array array['off', 'on'] loop
    perform pg_catalog.set_config('mx.kernel_batch',
      case when v_mode = 'on' and coalesce(current_setting('mx.memo_compare_written', true), '') = '1' then 'on_written' else v_mode end, true);
    perform platform.memo_clear();
    begin
      -- MEMO-SWEEP k: the ask is made as a signed-in person, not as the store owner: the role the request runs as is
      -- authenticated (what PostgREST sets), so every owner-only shortcut sees a normal user. The internal helpers are
      -- not callable by that role, so the ask goes through iam._memo_ask (a definer door that refuses every session
      -- that did not log in as postgres, exactly as the real doors are definers asked by a signed-in caller).
      perform pg_catalog.set_config('role', 'authenticated', true);
      v_on := iam._memo_ask(p_kind, p_person, p_org, p_table, p_ids, p_level, p_search, p_limit, p_offset);
      perform pg_catalog.set_config('role', 'none', true);
    exception when others then
      perform pg_catalog.set_config('role', 'none', true);
      v_on := jsonb_build_object('error', sqlstate || ' ' || sqlerrm);
    end;
    if v_mode = 'off' then
      v_off := v_on;
    end if;
  end loop;
  -- Did the memo run? Its slots are session settings that pg_settings does not list, so ask for the keys the helpers
  -- write (carrying edges and ancestors of the ids asked; the default level and carrying edges of the Table for a page).
  v_snap := pg_catalog.pg_current_snapshot()::text;
  perform pg_catalog.set_config('role', 'authenticated', true);
  if p_kind in ('team', 'shown', 'home', 'many_in', 'among', 'once', 'kvs', 'hub') then
    v_slots := -1;   -- HOT-DOORS-5 paths: no slot probe; the forced-on run is the memo path
  elsif p_ids is not null then
    select count(*) into v_slots from unnest(p_ids) x
     where platform.memo_k_get('custom.carrying_edges_of:record:' || x::text || ':' || v_snap) is not null
        or platform.memo_k_get('custom.ancestors_of:record:' || x::text || ':' || v_snap) is not null;
  else
    v_slots := (platform.memo_k_get('iam.member_default_level:' || coalesce(p_org::text, '') || ':' || coalesce(p_table::text, '') || ':' || v_snap) is not null)::int
             + (platform.memo_k_get('custom.carrying_edges_of:record:' || coalesce(p_table::text, '') || ':' || v_snap) is not null)::int;
  end if;
  perform pg_catalog.set_config('role', 'none', true);
  if v_off is distinct from v_on then
    if p_kind in ('levels', 'many') and jsonb_typeof(v_off) = 'object' and jsonb_typeof(v_on) = 'object' then
      select coalesce(jsonb_agg(k.key order by k.key) filter (where k.n <= 5), '[]'::jsonb) into v_diff
        from (select x.key, row_number() over (order by x.key) n
                from (select key from jsonb_object_keys(v_off) key union select key from jsonb_object_keys(v_on) key) x
               where v_off -> x.key is distinct from v_on -> x.key) k;
    else
      select coalesce(jsonb_agg(k.key order by k.key) filter (where k.n <= 5), '[]'::jsonb) into v_diff
        from (select x.key, row_number() over (order by x.key) n
                from (select key from jsonb_object_keys(case when jsonb_typeof(v_off) = 'object' then v_off else '{}'::jsonb end) key
                      union select key from jsonb_object_keys(case when jsonb_typeof(v_on) = 'object' then v_on else '{}'::jsonb end) key) x
               where v_off -> x.key is distinct from v_on -> x.key) k;
    end if;
    if jsonb_array_length(v_diff) = 0 then
      v_diff := jsonb_build_array('(whole answer)');
    end if;
  end if;
  return jsonb_build_object('same', v_off is not distinct from v_on, 'slots', v_slots, 'diff', v_diff,
                            'off', case when v_off is distinct from v_on then left(v_off::text, 300) end,
                            'on',  case when v_off is distinct from v_on then left(v_on::text, 300) end);
end;
$function$
;

CREATE OR REPLACE FUNCTION iam.kernel_memo_compare(p_ids integer DEFAULT 20, p_pages integer DEFAULT 2)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
-- MEMO-SWEEP: see the file header. Compares memo-off and memo-on answers of custom.levels_of,
-- custom.reaches_directly_many and custom.read_records_page on one snapshot, read-only. Returns
-- {"ok": bool, "compared": n, "diffs": [...], "errors": [...], "strata": [...], "slots": {kind: live slots}}.
-- ok is false on any difference or when the memo path could not be shown to run.
declare
  v_kernel  uuid := custom.table_kernel_id();
  v_claims0 text := current_setting('request.jwt.claims', true);
  v_sub0    text := current_setting('request.jwt.claim.sub', true);
  v_kb0     text := current_setting('mx.kernel_batch', true);
  v_conf    constant uuid := 'a261e070-6e44-4ab9-837c-7f6df75db3da';
  v_n       integer := greatest(coalesce(p_ids, 20), 5);
  v_strata  jsonb := '[]'::jsonb;
  v_who     uuid[];
  v_pub_t   uuid[];
  v_rel_org uuid;
  v_rel_tbl uuid;
  v_p2      uuid;
  v_seats5  uuid[];
  v_orgs    uuid[];
  v_o       uuid;
  v_k5      integer := 0;
  v_big_org uuid;
  v_big_tbl uuid;
  v_org     uuid;
  v_tbl     uuid;
  v_ids     uuid[];
  v_name    text;
  v_named   uuid;
  v_s       jsonb;
  v_p       uuid;
  v_lvl     text;
  v_r       jsonb;
  v_compared integer := 0;
  v_diffs   jsonb := '[]'::jsonb;
  v_errs    jsonb := '[]'::jsonb;
  v_slots   jsonb := jsonb_build_object('levels', 0, 'many', 0, 'page', 0);
  v_k       text;
  v_p3      uuid[];
  v_pg      integer;
  v_search  text;
  v_off     integer;
  v_tg      uuid[];
  v_seed    text := md5(random()::text);
begin
  if pg_catalog.pg_current_xact_id_if_assigned() is not null and coalesce(current_setting('mx.memo_compare_written', true), '') <> '1' then
    return jsonb_build_object('ok', false, 'compared', 0, 'diffs', '[]'::jsonb,
      'errors', jsonb_build_array('the comparison started in a transaction that had already written, so the statement memo was off and nothing was tested'));
  end if;

  -- The strata: ids, and for page reads the Table they live in.
  select r.organization_id into v_org from custom.record r where r.id = v_conf limit 1;
  if v_org is null then
    select r.id, r.organization_id into v_tbl, v_org from custom.record r
     where r.table_id = v_kernel and r.data_class = 'table' and r.data ->> 'level' = 'confidential' limit 1;
  else
    v_tbl := v_conf;
  end if;
  if v_tbl is not null then
    select array_agg(x.id) into v_ids from (select r.id from custom.record r
       where r.organization_id = v_org and r.table_id = v_tbl and r.data_class = 'record' order by random() limit v_n) x;
    v_strata := v_strata || jsonb_build_object('name', 'confidential', 'org', v_org, 'tbl', v_tbl, 'ids', to_jsonb(coalesce(v_ids, '{}')));
    -- a person a reader field of that Table names
    select (r.data ->> (rd ->> 'field'))::uuid into v_named
      from custom.record t
      cross join lateral jsonb_array_elements(case when jsonb_typeof(t.data -> 'readers') = 'array' then t.data -> 'readers' else '[]'::jsonb end) rd
      join custom.record r on r.organization_id = t.organization_id and r.table_id = t.id and r.data_class = 'record'
     where t.id = v_tbl and t.organization_id = v_org
       and (r.data ->> (rd ->> 'field')) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     limit 1;
  end if;

  select x.organization_id, x.table_id into v_big_org, v_big_tbl
    from (select r.organization_id, r.table_id, count(*) n from custom.record r
           where r.data_class = 'record' group by 1, 2 order by 3 desc limit 1) x;

  select array_agg(t.id) into v_pub_t from custom.record t
   where t.table_id = v_kernel and t.data_class = 'table' and t.data ->> 'level' = 'public';

  -- The Table whose rows carry relations to containers (Deliverables: a client, an owner): the rows the carrying-edges,
  -- ancestors and addressed-cap helpers answer for. Falls back to the Table whose rows most often name a record.
  select x.organization_id, x.table_id into v_rel_org, v_rel_tbl
    from (select r.organization_id, r.table_id, count(*) n from custom.record r
            join custom.record t on t.id = r.table_id and t.organization_id = r.organization_id
           where r.data_class = 'record' and t.data ->> 'name' ilike '%deliverable%'
           group by 1, 2
           order by (select count(*) from iam.organization_member om where om.organization_id = r.organization_id) > 1 desc, 3 desc limit 1) x;
  if v_rel_tbl is null then
    select x.organization_id, x.table_id into v_rel_org, v_rel_tbl
      from (select r.organization_id, r.table_id, count(*) n from (select a.source_id from platform.associations a
              where a.source_type = 'record' and a.deleted_at is null limit 20000) s
              join custom.record r on r.id = s.source_id and r.data_class = 'record'
             group by 1, 2 order by 3 desc limit 1) x;
  end if;

  foreach v_name in array array['published', 'only_me', 'big', 'relations', 'table_definition'] loop
    v_ids := null; v_org := null; v_tbl := null;
    if v_name = 'published' then
      select array_agg(x.id), min(x.organization_id::text)::uuid, min(x.table_id::text)::uuid into v_ids, v_org, v_tbl
        from (select r.id, r.organization_id, r.table_id from custom.record r
               where r.data_class = 'record' and (r.published_to_web or r.table_id = any (coalesce(v_pub_t, '{}')))
               order by random() limit v_n) x;
    elsif v_name = 'only_me' then
      select array_agg(x.id), min(x.organization_id::text)::uuid, min(x.table_id::text)::uuid into v_ids, v_org, v_tbl
        from (select r.id, r.organization_id, r.table_id from custom.record r
               where r.shown_to = 'only_me' and r.data_class = 'record' order by random() limit v_n) x;
    elsif v_name = 'relations' then
      v_org := v_rel_org; v_tbl := v_rel_tbl;
      select array_agg(x.id) into v_ids from (select r.id from custom.record r
         where r.organization_id = v_rel_org and r.table_id = v_rel_tbl and r.data_class = 'record' order by random() limit v_n) x;
    elsif v_name = 'big' then
      v_org := v_big_org; v_tbl := v_big_tbl;
      select array_agg(x.id) into v_ids from (select r.id from custom.record r
         where r.organization_id = v_big_org and r.table_id = v_big_tbl and r.data_class = 'record' order by random() limit v_n) x;
    else
      select array_agg(x.id), min(x.organization_id::text)::uuid into v_ids, v_org
        from (select r.id, r.organization_id from custom.record r
               where r.table_id = v_kernel and r.data_class = 'table' order by random() limit v_n) x;
    end if;
    if v_ids is not null then
      v_strata := v_strata || jsonb_build_object('name', v_name, 'org', v_org, 'tbl', v_tbl, 'ids', to_jsonb(v_ids));
    end if;
  end loop;

  -- The seats.
  v_who := array['87a6e699-3622-4869-8843-d0867456c0dd'::uuid, '4060701e-706a-4c76-b3ca-0bbc69fa5a14'::uuid];
  if v_named is not null then v_who := v_who || v_named; end if;
  select om.user_id into v_p from iam.organization_member om
   where om.organization_id = v_big_org and om.user_id <> all (v_who) order by random() limit 1;
  if v_p is not null then v_who := v_who || v_p; end if;
  select om.user_id into v_p2 from iam.organization_member om
   where om.organization_id = v_rel_org and om.user_id <> all (v_who) order by random() limit 1;
  if v_p2 is not null then v_who := v_who || v_p2; end if;

  for v_s in select * from jsonb_array_elements(v_strata) loop
    v_ids := array(select x::uuid from jsonb_array_elements_text(v_s -> 'ids') x);
    foreach v_p in array v_who loop
      -- levels
      v_r := iam._memo_pair('levels', v_p, null, null, v_ids, null, null, null, null);
      v_compared := v_compared + 1;
      v_slots := jsonb_set(v_slots, '{levels}', to_jsonb((v_slots ->> 'levels')::int + (v_r ->> 'slots')::int));
      if not (v_r ->> 'same')::boolean then
        v_diffs := v_diffs || jsonb_build_object('fn', 'custom.levels_of', 'stratum', v_s ->> 'name', 'person', v_p, 'level', null,
                     'target', v_r -> 'diff' -> 0, 'detail', v_r);
      end if;
      -- sets, at every level
      foreach v_lvl in array array['viewer', (array['commenter', 'edit_content', 'editor', 'admin'])[1 + floor(random() * 4)::int]] loop
        v_r := iam._memo_pair('many', v_p, null, null, v_ids, v_lvl, null, null, null);
        v_compared := v_compared + 1;
        v_slots := jsonb_set(v_slots, '{many}', to_jsonb((v_slots ->> 'many')::int + (v_r ->> 'slots')::int));
        if not (v_r ->> 'same')::boolean then
          v_diffs := v_diffs || jsonb_build_object('fn', 'custom.reaches_directly_many', 'stratum', v_s ->> 'name', 'person', v_p,
                       'level', v_lvl, 'target', v_r -> 'diff' -> 0, 'detail', v_r);
        end if;
      end loop;
      -- pages of the Table the stratum lives in
      -- Pages only for a seat that can open the Table: the two fixed seats (the door answers or refuses at once) and the
      -- members of its organization. A page for a person outside it walks the whole Table row by row (a 25,000-row
      -- Table took longer than any budget) and says nothing the set questions above do not.
      if v_s ->> 'tbl' is not null and v_s ->> 'name' <> 'table_definition'
         and (v_p = any (array['87a6e699-3622-4869-8843-d0867456c0dd'::uuid, '4060701e-706a-4c76-b3ca-0bbc69fa5a14'::uuid])
              or exists (select 1 from iam.organization_member om
                          where om.user_id = v_p and om.organization_id = (v_s ->> 'org')::uuid)) then
        for v_pg in 1 .. greatest(coalesce(p_pages, 2), 1) loop
          -- page 1 is the plain first page; the others are an offset page or a searched page (chosen at random)
          v_off := case when v_pg = 1 or random() < 0.5 then 0 else 25 end;
          v_search := case when v_pg > 1 and v_off = 0 then 'a' end;
          v_r := iam._memo_pair('page', v_p, (v_s ->> 'org')::uuid, (v_s ->> 'tbl')::uuid, null, null, v_search,
                                case when v_pg = 1 then 50 else 25 end, v_off);
          v_compared := v_compared + 1;
          v_slots := jsonb_set(v_slots, '{page}', to_jsonb((v_slots ->> 'page')::int + (v_r ->> 'slots')::int));
          if not (v_r ->> 'same')::boolean then
            v_diffs := v_diffs || jsonb_build_object('fn', 'custom.read_records_page', 'stratum', v_s ->> 'name', 'person', v_p,
                         'level', format('page %s', v_pg), 'target', to_jsonb(v_s ->> 'tbl'), 'detail', v_r);
          end if;
        end loop;
      end if;
    end loop;
  end loop;

  -- HOT-DOORS-5 paths: iam.my_team_reach, custom._record_shown_to_ctx, custom.data_home_items. Seats: the two fixed ones,
  -- people on a team, members of organizations with knob overrides, a few-organization member and a member of an
  -- organization with a live stage-field Table.
  v_seats5 := array['87a6e699-3622-4869-8843-d0867456c0dd'::uuid, '4060701e-706a-4c76-b3ca-0bbc69fa5a14'::uuid];
  select array_agg(z.u) into v_p3 from (select distinct r.user_id u from iam.team_members_resolved(array(
           select t.id from iam.team t where t.deleted_at is null order by random() limit 20)) r limit 3) z;
  v_seats5 := v_seats5 || coalesce(v_p3, '{}');
  select array_agg(z.u) into v_p3 from (select om.user_id u from iam.organization_member om
          where om.organization_id in (select ko.organization_id from platform.knob_override ko where ko.organization_id is not null limit 200)
          order by random() limit 2) z;
  v_seats5 := v_seats5 || coalesce(v_p3, '{}');
  select array_agg(z.u) into v_p3 from (select om.user_id u from iam.organization_member om group by om.user_id
          having count(*) <= 2 order by random() limit 1) z;
  v_seats5 := v_seats5 || coalesce(v_p3, '{}');
  select array_agg(z.u) into v_p3 from (select om.user_id u from iam.organization_member om
          where om.organization_id in (select t.organization_id from custom.record t where t.table_id = v_kernel
                  and t.data_class = 'table' and t.deleted_at is null and nullif(t.data ->> 'stage_field', '') is not null limit 50)
          order by random() limit 2) z;
  v_seats5 := v_seats5 || coalesce(v_p3, '{}');
  -- MEMO-SWEEP k: members of organizations with a live booking page (the data home's booking shortcut is asked only for these)
  select array_agg(z.u) into v_p3 from (select om.user_id u from iam.organization_member om
          where om.organization_id in (select f.organization_id from custom.anon_form f
                  where f.deleted_at is null and f.presentation ? 'booking' limit 50)
          order by random() limit 2) z;
  v_seats5 := v_seats5 || coalesce(v_p3, '{}');
  v_seats5 := array(select distinct u from unnest(v_seats5) u);

  foreach v_p in array v_seats5 loop
    v_orgs := array(select om.organization_id from iam.organization_member om where om.user_id = v_p order by random() limit 8);
    v_o := v_orgs[1];
    for v_k in select unnest(array['team', 'team_org', 'shown', 'shown_table', 'home', 'home_org']) loop
      v_r := iam._memo_pair(case when v_k like 'team%' then 'team' when v_k like 'shown%' then 'shown' else 'home' end, v_p,
                            case when v_k in ('team_org', 'home_org') then v_o end,
                            case when v_k = 'shown_table' then v_big_tbl end,
                            case when v_k like 'shown%' then v_orgs end, null, null, null, null);
      v_compared := v_compared + 1;
      if not (v_r ->> 'same')::boolean then
        v_diffs := v_diffs || jsonb_build_object('fn', case when v_k like 'team%' then 'iam.my_team_reach' when v_k like 'shown%' then 'custom._record_shown_to_ctx' else 'custom.data_home_items' end,
                     'stratum', v_k, 'person', v_p, 'level', v_k, 'target', to_jsonb(coalesce(v_o::text, '')), 'detail', v_r);
      end if;
    end loop;
    -- MEMO-SWEEP k: HOT-DOORS-6 paths. Targets: the Table definitions of the seat's organizations (what the walk asks) and some
    -- rows of the first one; hints mixed (right, another organization, none, an organization nobody is in).
    v_tg := array(select t.id from custom.record t where t.organization_id = any (v_orgs) and t.table_id = v_kernel
                   and t.data_class = 'table' and t.deleted_at is null order by md5(t.id::text || v_seed) limit 40);
    if v_o is not null then
      v_tg := v_tg || array(select r.id from custom.record r where r.organization_id = v_o and r.data_class = 'record'
                             and r.deleted_at is null order by md5(r.id::text || v_seed) limit 20);
    end if;
    -- HOT-DOORS-7 paths: custom.kernel_viewer_sets (the seat's organizations) and custom.data_home_changed_by's set form
    -- (custom.hub_changed_by_many) after the walk
    foreach v_k in array array['kvs', 'hub'] loop
      v_r := iam._memo_pair(v_k, v_p, v_o, null, v_orgs, null, null, null, null);
      v_compared := v_compared + 1;
      if not (v_r ->> 'same')::boolean then
        v_diffs := v_diffs || jsonb_build_object('fn', case v_k when 'kvs' then 'custom.kernel_viewer_sets' else 'custom.hub_changed_by_many' end,
                     'stratum', v_k, 'person', v_p, 'level', v_k, 'target', to_jsonb(coalesce(v_o::text, '')), 'detail', v_r);
      end if;
    end loop;
    foreach v_k in array array['many_in', 'among', 'once'] loop
      v_r := iam._memo_pair(v_k, v_p, v_o, null, v_tg,
                            case when v_k = 'many_in' then (array['viewer', 'editor', 'admin'])[1 + floor(random() * 3)::int] end, null, null, null);
      v_compared := v_compared + 1;
      if not (v_r ->> 'same')::boolean then
        v_diffs := v_diffs || jsonb_build_object('fn', case v_k when 'many_in' then 'iam.has_access_for_many_in'
                       when 'among' then 'custom.tables_seen_among' else 'custom.tables_seen_once_per_group' end,
                     'stratum', v_k, 'person', v_p, 'level', v_k, 'target', to_jsonb(coalesce(v_o::text, '')), 'detail', v_r);
      end if;
    end loop;
  end loop;

  -- The memo path must have run: live slots after the 'on' runs, for every kind.
  foreach v_k in array array['levels', 'many', 'page'] loop
    if (v_slots ->> v_k)::int = 0 then
      v_errs := v_errs || to_jsonb(format('the statement memo wrote no slot while asking %s: the memo path was not exercised', v_k));
    end if;
  end loop;
  if pg_catalog.pg_current_xact_id_if_assigned() is not null and coalesce(current_setting('mx.memo_compare_written', true), '') <> '1' then
    v_errs := v_errs || to_jsonb('the comparison took a transaction id, so the memo was off for the rest of it'::text);
  end if;

  perform pg_catalog.set_config('request.jwt.claims', coalesce(v_claims0, ''), true);
  perform pg_catalog.set_config('request.jwt.claim.sub', coalesce(v_sub0, ''), true);
  perform pg_catalog.set_config('mx.kernel_batch', coalesce(v_kb0, ''), true);
  return jsonb_build_object('ok', jsonb_array_length(v_diffs) = 0 and jsonb_array_length(v_errs) = 0,
    'compared', v_compared, 'diffs', v_diffs, 'errors', v_errs, 'slots', v_slots,
    'seats', cardinality(v_who),
    'strata', (select coalesce(jsonb_agg(jsonb_build_object('name', s ->> 'name', 'table', s ->> 'tbl', 'ids', jsonb_array_length(s -> 'ids'))), '[]'::jsonb)
                 from jsonb_array_elements(v_strata) s));
exception when others then
  perform pg_catalog.set_config('request.jwt.claims', coalesce(v_claims0, ''), true);
  perform pg_catalog.set_config('request.jwt.claim.sub', coalesce(v_sub0, ''), true);
  perform pg_catalog.set_config('mx.kernel_batch', coalesce(v_kb0, ''), true);
  return jsonb_build_object('ok', false, 'compared', coalesce(v_compared, 0), 'diffs', coalesce(v_diffs, '[]'::jsonb),
    'errors', jsonb_build_array(format('the comparison itself failed: %s %s', sqlstate, sqlerrm)));
end;
$function$
;
