-- seo_topic_panel_reads_each_item_once_and_pages.sql
--
-- chair-step: seo.map_topic_associations widens from 3 to 5 arguments (p_limit, p_after). The old identity is DROPPED in the same transaction, because a 3-argument and a 5-argument overload with defaults are ambiguous to every existing named-argument caller (PostgREST PGRST203); the door row moves to the new identity in the same transaction and the GRANT names exactly the roles the old identity held (authenticated, service_role). No grantee is added.
--
-- based-on: seo.map_topic_associations(uuid, text, text[]) 6254091afe2b6fe283ee81e58e306d9527cb8a25fc3d31f45755cb3edf796621
-- based-on: seo._tm_topics(uuid, uuid) f7c6415c8563af8ea161ea91dbf9038db7856b8ab284e3d34e3430173e5de22c
--   (live body read with pg_get_functiondef on 2026-09-30 immediately before this file was written).
--
-- THE DEFECT (2026-09-30, after 14,303 keyword homes moved onto seo.site_keyword_value.topic_id):
-- the topic panel for "Consumer Electronics Recycling" on All Green's map took 36 s on the clone
-- (45 s reported live), "E-Waste Recycling Events" 13 s. Measured cause, per item and ALL items:
--   1. `resolved` was an inlined CTE whose `seo._tm_item(...)` expression is referenced four times
--      (three `?` tests in `visible`, once in the output), so every item's access check, dynamic
--      row read and — for a page — per-page traffic read ran up to FOUR times (keywords alone:
--      1.6 s of resolves became 8 s).
--   2. The keyword edge's site check `iam.has_access('web_site', site, 'viewer')` ran once per
--      keyword (2,857 calls, 1.25 s) though every keyword on the topic names the same one site.
--   3. A page's traffic was read one page at a time (`_tm_page_perf(ARRAY[id])`, 3,779 calls, 5 s)
--      though `_tm_page_perf` takes an array.
--   4. The panel asked for EVERY edge (6,637 rows) and rendered all of them.
--
-- THE FIX. Access is decided by EXACTLY the same predicates as before — nothing here changes who
-- sees what:
--   * the map: seo._tm_map(p_map_id, 'viewer'), once, first (unchanged);
--   * each item: platform.resolve_entity_ref(type, id) — the canonical kernel — ONCE per item
--     instead of up to four times; an item it answers forbidden / missing / unregistered is absent;
--   * a keyword edge: (public.is_platform_admin() OR iam.has_access('web_site', site, 'viewer'))
--     IS TRUE, now decided ONCE per distinct site in the call (the same expression, the same
--     statement snapshot, so the same answer) instead of once per keyword;
--   * traffic is added only to a page whose resolve succeeded (unchanged), now read in one
--     `_tm_page_perf` call per performance window instead of one per page.
-- THE SCOPE RULE: `p_limit` returns at most that many VISIBLE rows per kind, and the walk stops
-- resolving a kind the moment it has them — the per-item kernel runs only for the rows the panel
-- renders (plus the one extra the client asks for to learn there is more). `p_after` continues ONE
-- kind from a row's `association.cursor` (keyset, so page 30 costs what page 1 costs). With
-- p_limit NULL the output is byte-identical to the old function (proved by md5 on the clone for
-- a member, an admin, and a refused non-member; see the commit).
--
-- THE SIBLING (census): seo._tm_topics — behind seo.map_tree, which the panel loads itself when no
-- workspace has — had the same inlined-CTE shape: `vis` (seo._tm_visible_sites, ~220 ms: an access
-- check per site over the whole stats view) was inlined into the per-topic LATERAL filter and ran
-- once per candidate stats row — 22.4 s for All Green's 50-topic map on the clone, past the 8 s
-- statement timeout, so the map screen never loaded at all. `vis` is now MATERIALIZED: the same
-- function, the same arguments, the same snapshot, evaluated once. Nothing else in the body moved.
--
-- Also: feature knob seo.topical_map / panel_page_size (100) — how many rows each topic-panel
-- section shows before "Show more".

set local lock_timeout = '2s';

drop function if exists seo.map_topic_associations(uuid, text, text[]);

create function seo.map_topic_associations(
  p_map_id uuid,
  p_slug text,
  p_kinds text[] default null,
  p_limit integer default null,
  p_after text default null)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
DECLARE
  v_map record; v_tid uuid; v_kinds text[];
  v_after_dir text; v_after_at timestamptz; v_after_id uuid;
  e record; v_item jsonb; v_site_ok jsonb := '{}'::jsonb; v_site text; v_ok boolean;
  v_cur_kind text; v_taken integer := 0;
  a_kind text[] := '{}'; a_dir text[] := '{}'; a_role text[] := '{}'; a_payload jsonb[] := '{}';
  a_type text[] := '{}'; a_id uuid[] := '{}'; a_at timestamptz[] := '{}'; a_item jsonb[] := '{}';
  v_perf jsonb := '{}'::jsonb; v_out jsonb;
BEGIN
  IF p_map_id IS NULL THEN RAISE EXCEPTION 'map_topic_associations: p_map_id is required (got NULL)' USING ERRCODE='22023'; END IF;
  IF p_slug IS NULL THEN RAISE EXCEPTION 'map_topic_associations: p_slug is required (got NULL)' USING ERRCODE='22023'; END IF;
  v_map := seo._tm_map(p_map_id, 'viewer');
  SELECT t.id INTO v_tid FROM seo.map_topic t
   WHERE t.map_id = p_map_id AND t.slug = p_slug AND t.deleted_at IS NULL AND t.status <> 'rejected';
  IF v_tid IS NULL THEN perform platform.refuse_not_found(format('topic %s not found', p_slug)); END IF;
  IF p_kinds IS NOT NULL THEN
    SELECT COALESCE(array_agg(seo._tm_kind_alias(k)), '{}'::text[]) INTO v_kinds FROM unnest(p_kinds) k;
  END IF;
  IF p_limit IS NOT NULL AND p_limit < 1 THEN
    RAISE EXCEPTION 'map_topic_associations: p_limit must be at least 1 (got %)', p_limit USING ERRCODE='22023';
  END IF;
  IF p_after IS NOT NULL THEN
    IF p_limit IS NULL OR v_kinds IS NULL OR cardinality(v_kinds) <> 1 THEN
      RAISE EXCEPTION 'map_topic_associations: p_after continues ONE kind — pass exactly one p_kinds entry and a p_limit'
        USING ERRCODE='22023';
    END IF;
    BEGIN
      v_after_dir := split_part(p_after, '|', 1);
      v_after_at  := split_part(p_after, '|', 2)::timestamptz;
      v_after_id  := split_part(p_after, '|', 3)::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'map_topic_associations: p_after is not a cursor this function returned' USING ERRCODE='22023';
    END;
    IF v_after_dir NOT IN ('in', 'out') THEN
      RAISE EXCEPTION 'map_topic_associations: p_after is not a cursor this function returned' USING ERRCODE='22023';
    END IF;
  END IF;

  -- One walk in output order. Each item is resolved ONCE; a kind stops resolving at p_limit.
  FOR e IN
    WITH edges AS (
      SELECT a.source_type AS kind, 'in'::text AS direction, a.role, a.payload, a.source_type AS item_type, a.source_id AS item_id, a.created_at
        FROM platform.associations a WHERE a.target_type='seo_map_topic' AND a.target_id=v_tid AND a.deleted_at IS NULL
      UNION ALL
      SELECT a.target_type, 'out', a.role, a.payload, a.target_type, a.target_id, a.created_at
        FROM platform.associations a WHERE a.source_type='seo_map_topic' AND a.source_id=v_tid AND a.deleted_at IS NULL
      UNION ALL
      SELECT 'plan_node', 'in', 'home', NULL, 'plan_node', n.id, n.created_at FROM plan.node n WHERE n.topic_id=v_tid AND n.deleted_at IS NULL
      UNION ALL
      SELECT 'seo_keyword', 'in', 'home', jsonb_build_object('site_id', v.site_id), 'seo_keyword', v.keyword_id, v.created_at
        FROM seo.site_keyword_value v WHERE v.topic_id=v_tid AND v.deleted_at IS NULL
    )
    SELECT x.* FROM edges x
     WHERE (p_kinds IS NULL OR x.kind = ANY(v_kinds))
       AND (p_after IS NULL OR (x.direction, x.created_at, x.item_id) > (v_after_dir, v_after_at, v_after_id))
     ORDER BY x.kind, x.direction, x.created_at, x.item_id
  LOOP
    IF v_cur_kind IS DISTINCT FROM e.kind THEN v_cur_kind := e.kind; v_taken := 0; END IF;
    IF p_limit IS NOT NULL AND v_taken >= p_limit THEN
      IF p_after IS NOT NULL THEN EXIT; END IF;  -- one kind: nothing after this matters
      CONTINUE;
    END IF;

    IF e.item_type = 'seo_keyword' THEN
      v_site := e.payload->>'site_id';
      IF v_site IS NULL THEN
        v_ok := (public.is_platform_admin() OR iam.has_access('web_site', NULL::uuid, 'viewer'::public.permission_level)) IS TRUE;
      ELSIF v_site_ok ? v_site THEN
        v_ok := (v_site_ok->>v_site)::boolean;
      ELSE
        v_ok := (public.is_platform_admin() OR iam.has_access('web_site', v_site::uuid, 'viewer'::public.permission_level)) IS TRUE;
        v_site_ok := v_site_ok || jsonb_build_object(v_site, v_ok);
      END IF;
      IF NOT v_ok THEN CONTINUE; END IF;
    END IF;

    v_item := COALESCE(platform.resolve_entity_ref(e.item_type, e.item_id),
                       jsonb_build_object('type', e.item_type, 'id', e.item_id));
    IF v_item ? 'forbidden' OR v_item ? 'missing' OR v_item ? 'unregistered' THEN CONTINUE; END IF;

    v_taken := v_taken + 1;
    a_kind := a_kind || e.kind; a_dir := a_dir || e.direction; a_role := a_role || e.role;
    a_payload := a_payload || e.payload; a_type := a_type || e.item_type; a_id := a_id || e.item_id;
    a_at := a_at || e.created_at; a_item := a_item || v_item;
  END LOOP;

  -- Traffic for the visible pages: one read per performance window, not one per page.
  -- MATERIALIZED on purpose: inlined, the planner put `perf` on the inner side of a nested loop
  -- and re-ran _tm_page_perf once per page (720 pages: 100 s on the clone).
  WITH pg AS (
    SELECT DISTINCT u.id FROM unnest(a_type, a_id) AS u(t, id) WHERE u.t = 'web_page' AND u.id IS NOT NULL
  ), pp AS (
    SELECT p.id, p.organization_id, p.site_id FROM web.page p JOIN pg ON pg.id = p.id
     WHERE p.deleted_at IS NULL AND p.organization_id IS NOT NULL
  ), win AS MATERIALIZED (
    SELECT s.organization_id, s.site_id, seo._tm_perf_days(s.organization_id, s.site_id) AS days
      FROM (SELECT DISTINCT pp.organization_id, pp.site_id FROM pp) s
  ), pd AS MATERIALIZED (
    SELECT pp.id, w.days FROM pp JOIN win w
      ON w.organization_id = pp.organization_id AND w.site_id IS NOT DISTINCT FROM pp.site_id
  ), perf AS MATERIALIZED (
    SELECT g.days, seo._tm_page_perf(g.ids, g.days) AS perf
      FROM (SELECT pd.days, array_agg(pd.id) AS ids FROM pd GROUP BY pd.days) g
  )
  SELECT COALESCE(jsonb_object_agg(pd.id,
           COALESCE(perf.perf -> pd.id::text, jsonb_build_object('clicks', 0, 'impressions', 0))
           || jsonb_build_object('performance_window_days', pd.days)), '{}'::jsonb)
    INTO v_perf
    FROM pd JOIN perf ON perf.days = pd.days;

  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'topic', p_slug,
             'association', jsonb_strip_nulls(jsonb_build_object('kind', j.kind, 'role', j.role, 'direction', j.dir, 'payload', j.payload))
                            || CASE WHEN p_limit IS NULL THEN '{}'::jsonb
                                    ELSE jsonb_build_object('cursor', j.dir || '|'
                                           || to_char(j.at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '|' || j.id::text) END,
             'item', j.item
                     || CASE WHEN j.typ = 'web_page' AND j.id IS NOT NULL THEN COALESCE(v_perf -> j.id::text, '{}'::jsonb) ELSE '{}'::jsonb END
                     || CASE WHEN j.typ = 'seo_map_facet_value'
                          THEN COALESCE((SELECT jsonb_build_object('facet', f.key, 'ref', seo._tm_ref(fv.ref_type, fv.ref_id))
                                           FROM seo.map_facet_value fv JOIN seo.map_facet f ON f.id=fv.facet_id WHERE fv.id=j.id), '{}'::jsonb)
                          ELSE '{}'::jsonb END)
           ORDER BY j.ord), '[]'::jsonb)
    INTO v_out
    FROM unnest(a_kind, a_dir, a_role, a_payload, a_type, a_id, a_at, a_item)
         WITH ORDINALITY AS j(kind, dir, role, payload, typ, id, at, item, ord);
  RETURN v_out;
END $function$;

comment on function seo.map_topic_associations(uuid, text, text[], integer, text) is
  'Everything attached to one topic, resolved. Access: seo._tm_map(viewer) once; each item through platform.resolve_entity_ref once; a keyword edge also needs viewer on its site, decided once per distinct site. p_limit = at most N visible rows per kind (NULL = all); p_after = a row''s association.cursor, continuing ONE kind.';

update platform.client_callable_door d
   set identity_args = pg_catalog.pg_get_function_identity_arguments(
         'seo.map_topic_associations(uuid, text, text[], integer, text)'::regprocedure),
       identity_argtypes = (select platform.door_argtypes(p.proargtypes) from pg_catalog.pg_proc p
                             where p.oid = 'seo.map_topic_associations(uuid, text, text[], integer, text)'::regprocedure),
       argument_rules = jsonb_set(jsonb_set(d.argument_rules,
         '{arguments,p_limit}',
         '{"type":"integer","check":"p_limit -> at most that many visible rows per kind; below 1 is 22023","foreign":{"not_an_id":true},"optional":true,"position":4,"null_rule":{"means":"every row"}}'::jsonb),
         '{arguments,p_after}',
         '{"type":"text","check":"p_after -> a cursor this function returned; continues exactly one kind (p_kinds of one entry and a p_limit, else 22023)","foreign":{"not_an_id":true},"optional":true,"position":5,"null_rule":{"means":"from the first row"}}'::jsonb),
       reason = d.reason || ' | PAGING (2026-09-30): p_limit returns at most N visible rows per kind and stops resolving that kind there; p_after continues one kind from a returned association.cursor (keyset). Paging never changes which rows are visible, only how many are returned.'
 where d.schema_name = 'seo'
   and d.function_name = 'map_topic_associations';

-- The door row names the new identity first, so this grant sticks (§6d-4 guard). Same grantees as before.
grant execute on function seo.map_topic_associations(uuid, text, text[], integer, text) to authenticated, service_role;

create or replace function seo._tm_topics(p_map_id uuid, p_site_id uuid)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
  WITH RECURSIVE vis AS MATERIALIZED (
    SELECT CASE WHEN p_site_id IS NULL THEN seo._tm_visible_sites(p_map_id, NULL)
                ELSE ARRAY[p_site_id] END AS sites
  ), tr AS (
    SELECT t.id, t.parent_id, t.slug, t.name, t.description, t.status, t.sort_order, 0 AS depth,
           ARRAY[t.id] AS path, ARRAY[lpad(t.sort_order::text, 8, '0') || ' ' || t.slug] AS spath, t.layout
      FROM seo.map_topic t
     WHERE t.map_id = p_map_id AND t.parent_id IS NULL AND t.deleted_at IS NULL
       AND t.status NOT IN ('retired','rejected')
    UNION ALL
    SELECT t.id, t.parent_id, t.slug, t.name, t.description, t.status, t.sort_order, tr.depth + 1,
           tr.path || t.id, tr.spath || (lpad(t.sort_order::text, 8, '0') || ' ' || t.slug), t.layout
      FROM seo.map_topic t JOIN tr ON t.parent_id = tr.id
     WHERE t.deleted_at IS NULL AND t.status NOT IN ('retired','rejected') AND tr.depth < 200
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.spath), '[]'::jsonb)
    FROM (
      SELECT tr.id, tr.parent_id, tr.slug, tr.name, tr.description, tr.status, tr.sort_order, tr.depth,
             tr.path, tr.spath, tr.layout,
             COALESCE(s.page_count, 0)    AS page_count,
             COALESCE(s.planned_count, 0) AS planned_count,
             COALESCE(s.keyword_count, 0) AS keyword_count
        FROM tr
        LEFT JOIN LATERAL (
          SELECT sum(v.page_count)::int AS page_count, sum(v.planned_count)::int AS planned_count,
                 sum(v.keyword_count)::int AS keyword_count
            FROM seo.v_map_topic_stats v, vis
           WHERE v.topic_id = tr.id
             AND (v.site_id = ANY(vis.sites) OR (p_site_id IS NULL AND v.site_id IS NULL))
        ) s ON true
    ) x;
$function$;

insert into platform.feature_knob
  (feature, key, label, description, basis, value, default_value, value_type, unit, min_value, max_value,
   set_by, delegable, overridable_by, review_due, propagation, taxonomy_node_id, public_read, override_direction, ui)
select 'seo.topical_map', 'panel_page_size', 'Rows per topic-panel section',
       'How many pages, keywords, planned pages or other attachments each section of a topic''s detail panel shows at first, and how many more each "Show more" adds. A topic can carry thousands of keywords and pages; the panel reads only the rows it shows.',
       'Set 2026-09-30 while fixing the 45-second topic panel (seo_topic_panel_reads_each_item_once_and_pages.sql). 100 rows fill about three screens of the panel and read in well under a second on the largest All Green topic; 1000 is the ceiling so one step never renders an unbounded list. Arman has NOT reviewed this number.',
       '100'::jsonb, '100'::jsonb, k.value_type, 'rows', k.min_value, k.max_value,
       'agent', true, k.overridable_by, (current_date + 30), 'next_load', k.taxonomy_node_id, false, k.override_direction, '{}'::jsonb
  from platform.feature_knob k
 where k.feature = 'seo.topical_map' and k.key = 'history_page_size'
on conflict do nothing;
