-- chair-step: undo hotdoors7_h - the memo comparison builds its home_hub asks from the first 60 non-business rows again. Run BEFORE the inverse of hotdoors7_g.
-- lane: HOT-DOORS-7-GUARD
-- based-on: iam._memo_ask(text, uuid, uuid, uuid, uuid[], text, text, integer, integer) 802a2406b1ca7eb2dff82a1f741fcd61b4cb287aa2fd522b3327207d1013db1a

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
  v_items  jsonb;  -- HOT-DOORS-7-GUARD
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
      elsif p_kind = 'home_hub' then
        -- HOT-DOORS-7-GUARD: the data home as the real door runs it, in ONE statement: custom.data_home_items first (it leaves the
        -- checklist templates' ladder answer in the statement memo), then custom.data_home_changed_by's asks (structure asks lead
        -- with the organizations' checklist templates, then other non-business rows; form; portal) answered by
        -- custom.hub_changed_by_many, which reads that memo for a template. Memo off = no memo left, one custom.hub_changed_by per ask.
        select coalesce(jsonb_agg(to_jsonb(m) order by m.kind, m.organization_id, m.item_id, m.table_id), '[]'::jsonb) into v_items
          from custom.data_home_items(null) m;
        select coalesce(jsonb_agg(a.ask order by a.o, a.k), '[]'::jsonb) into v_hub
          from (
            select x.o, 1 as k, jsonb_build_object('organization_id', x.o, 'kind', 'structure', 'ids',
                     (select coalesce(jsonb_agg(r.id), '[]'::jsonb) from (select r.id from custom.record r
                        where r.organization_id = x.o and coalesce(r.data_class, 'record') <> 'record'
                        order by (r.data_class = 'checklist_template') desc, md5(r.id::text) limit 60) r)) as ask
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
        select jsonb_build_object('items', v_items, 'changed', coalesce(jsonb_agg(to_jsonb(c) order by c.organization_id, c.id, to_jsonb(c)::text), '[]'::jsonb)) into v_on
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
