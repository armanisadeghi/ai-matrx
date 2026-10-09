-- chair-step: undo hotdoors7_e - HOT-DOORS-7 loses its own off switch and custom.hub_changed_by_many's last arm answers false again. Run BEFORE the inverse of hotdoors7_f.
-- lane: HOT-DOORS-7-GUARD
-- based-on: custom.hot_doors_7_on(uuid) 50a7cc18ee961d5d59b719a0824f105a826b96903aa37a63ded023100d2e2427
-- based-on: custom.hub_changed_by_many(jsonb, text) fe7b95000d7b8277df2d3c3543751e8f927105aeaa6b8b0f6845e5ca2cebc54b

set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION custom.hot_doors_7_on(p_person uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  -- HOT-DOORS-7 (2026-10-09). The switch for the data home's per-organization loops made set-based: on exactly when
  -- the knob access/kernel_batch is on for this person (iam.kernel_batch_on: never after the transaction's first
  -- write), and a session has not forced the old paths with set_config('mx.hot_doors_7', 'off', true) - the hook the
  -- old-vs-new proof uses inside one snapshot. Same answers either way; only the work differs.
  select coalesce(iam.kernel_batch_on(p_person), false)
     and coalesce(pg_catalog.current_setting('mx.hot_doors_7', true), '') <> 'off';
$function$;
revoke all on function custom.hot_doors_7_on(uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION custom.hub_changed_by_many(p_asks jsonb, p_door text DEFAULT NULL::text)
 RETURNS TABLE(organization_id uuid, id uuid, at timestamp with time zone, who text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
-- HOT-DOORS-7 (2026-10-09). custom.hub_changed_by(<organization>, <kind>, <ids>) for every ask of p_asks
-- ([{"organization_id", "kind", "ids"}], custom.data_home_changed_by's shape) in ONE statement: the rows each ask
-- would return, with its organization. custom.data_home_changed_by asked custom.hub_changed_by once per ask (31 for
-- admin@admin.com's data home); here the walls are asked per ask, in order, exactly as before (p_door's own
-- custom.assert_client_may_reach first when named, then custom.hub_changed_by's: its wall, its kind and size checks),
-- and then every arm is answered for all the asks at once:
--   structure  custom.visible_set's Table-kernel answer per organization (custom.kernel_viewer_sets, the same
--              answer from the same statement memo), the ladder's level per id from the statement memo
--              custom.data_home_changed_by leaves (custom.hub_levels) when it holds every id an ask needs, else
--              custom.levels_of (one call for every such ask; levels_of answers each id on its own); an ask with a
--              row neither answers (the per-row ladder) is asked of custom.hub_changed_by itself, whole;
--   form/portal the organization's Table list (custom.query_visible_ids, one call per organization) when this
--              statement already walked it; an organization it did not walk is asked of custom.hub_changed_by itself.
-- Names: custom.history_people once per organization (its answer about a person never depends on who else is asked).
-- Only while custom.hot_doors_7_on: otherwise (and after a write) every ask goes to custom.hub_changed_by as before.
declare
  v_me     uuid := custom.query_principal();
  v_owner  boolean := custom.query_is_store_owner();
  v_kernel uuid := custom.table_kernel_id();
  v_snap   text := pg_catalog.pg_current_snapshot()::text;
  v_ask    jsonb;
  v_org    uuid;
  v_kind   text;
  v_ids    uuid[];
  v_set    boolean := custom.hot_doors_7_on(null)
                      and coalesce(current_setting('mx.data_home_set', true), '') <> 'off';
  v_pre    jsonb;
  v_levels jsonb := '{}'::jsonb;
  v_sets   jsonb := '{}'::jsonb;   -- organization -> its seen Tables, when custom.visible_set did not stop
  v_need   jsonb := '{}'::jsonb;   -- ask number -> ids custom.levels_of would be asked
  v_lv_ids uuid[] := '{}'::uuid[];
  v_n      integer := 0;
  v_alone  integer[] := '{}'::integer[];  -- asks answered by custom.hub_changed_by itself
  v_tplm   jsonb := '{}'::jsonb;  -- HOT-DOORS-7 d
begin
  if p_asks is null or jsonb_typeof(p_asks) <> 'array' then
    return;
  end if;
  -- THE WALLS, ask by ask, in order, as custom.data_home_changed_by and custom.hub_changed_by ask them
  for v_ask in select e from jsonb_array_elements(p_asks) e loop
    v_n := v_n + 1;
    v_org := (v_ask ->> 'organization_id')::uuid;
    if p_door is not null then
      perform custom.assert_client_may_reach(v_org, p_door);
    end if;
    v_kind := v_ask ->> 'kind';
    v_ids := array(select (e #>> '{}')::uuid from jsonb_array_elements(coalesce(v_ask -> 'ids', '[]'::jsonb)) e);
    if not v_set then
      return query select v_org, c.id, c.at, c.who from custom.hub_changed_by(v_org, v_kind, v_ids) c;
      continue;
    end if;
    perform custom.assert_client_may_reach(v_org, 'custom.hub_changed_by');
    if v_kind not in ('structure', 'form', 'portal') then
      raise exception 'custom.hub_changed_by does not know the kind %', coalesce(v_kind, '(null)')
        using errcode = '22023',
              hint = 'The kinds are: structure (a Table, dashboard, rule, checklist or work '
                     'template), form (a form, booking page or capture sheet) and portal.';
    end if;
    if array_length(v_ids, 1) > 500 then
      raise exception 'custom.hub_changed_by was asked about % things at once', array_length(v_ids, 1)
        using errcode = '54000',
              hint = 'Ask about at most 500 at a time — that is one page of a hub, and more '
                     'than a person reads.';
    end if;
    -- a form or portal ask about an organization this statement has not walked: custom.hub_changed_by's own arm
    if v_kind is distinct from 'structure' and array_length(v_ids, 1) is not null
       and platform.memo_k_get('custom.tables_seen:' || coalesce(v_me::text, '-') || ':' || v_org::text || ':' || v_snap) is null then
      v_alone := v_alone || v_n;
    end if;
  end loop;
  if not v_set then
    return;
  end if;

  -- custom.visible_set's Table-kernel answer for every organization a structure ask names a live Table of
  -- (custom.hub_changed_by asks it exactly then), one call for all of them
  select coalesce(jsonb_object_agg(k.organization_id::text, to_jsonb(k.carried_visible)) filter (where not k.fallback), '{}'::jsonb)
    into v_sets
    from custom.kernel_viewer_sets(v_me, array(
           select distinct (x.e ->> 'organization_id')::uuid
             from jsonb_array_elements(p_asks) with ordinality x(e, n)
            where x.e ->> 'kind' = 'structure'
              and not (x.n::integer = any (v_alone))
              and exists (select 1 from custom.record t
                           where t.organization_id = (x.e ->> 'organization_id')::uuid
                             and t.id = any (array(select (i #>> '{}')::uuid
                                                     from jsonb_array_elements(coalesce(x.e -> 'ids', '[]'::jsonb)) i))
                             and t.table_id = v_kernel
                             and t.deleted_at is null))) k;

  -- the ladder's level for every id custom.hub_changed_by would hand to custom.levels_of, per ask: from the statement
  -- memo custom.data_home_changed_by leaves when it holds every id the ask needs, else from custom.levels_of
  if not v_owner then
    v_pre := platform.memo_k_get('custom.hub_levels:' || coalesce(v_me::text, '-') || ':' || v_snap)::jsonb;
    with a as materialized (
      select x.n, (x.e ->> 'organization_id')::uuid as org,
             array(select (i #>> '{}')::uuid from jsonb_array_elements(coalesce(x.e -> 'ids', '[]'::jsonb)) i) as ids
        from jsonb_array_elements(p_asks) with ordinality x(e, n)
       where x.e ->> 'kind' = 'structure'
    ), nd as materialized (
      select a.n, coalesce(array_agg(r.id) filter (where r.id is not null), '{}'::uuid[]) as need
        from a
        left join custom.record r
          on r.organization_id = a.org and r.id = any (a.ids)
         and coalesce(r.data_class, 'record') <> 'record'
         and r.table_id is not null
         and r.table_id is distinct from v_kernel
       group by a.n
    )
    select coalesce(jsonb_object_agg(nd.n::text, jsonb_build_object(
             'covered', v_pre is not null and v_pre ?& nd.need::text[], 'need', to_jsonb(nd.need))), '{}'::jsonb)
      into v_need
      from nd;
    v_lv_ids := array(select distinct x::uuid
                        from jsonb_each(v_need) e, jsonb_array_elements_text(e.value -> 'need') x
                       where not (e.value ->> 'covered')::boolean);
    if cardinality(v_lv_ids) > 0 then
      v_levels := custom.levels_of(v_me, v_lv_ids);
    end if;
    -- HOT-DOORS-7 d: the checklist templates' ladder answer custom.data_home_items left in this statement's memo
    -- (custom.levels_of's 's', the answer that function's own wall decides on); a row it names is answered from it
    v_tplm := coalesce(platform.memo_k_get('custom.home_tpl_levels:' || coalesce(v_me::text, '-') || ':' || v_snap)::jsonb, '{}'::jsonb);
  end if;

  -- an ask with a row that neither the Table-kernel answer nor the levels answer: custom.hub_changed_by itself, whole
  if not v_owner then
    v_alone := v_alone || array(
      select distinct x.n::integer
        from jsonb_array_elements(p_asks) with ordinality x(e, n)
        join custom.record r
          on r.organization_id = (x.e ->> 'organization_id')::uuid
         and r.id = any (array(select (i #>> '{}')::uuid from jsonb_array_elements(coalesce(x.e -> 'ids', '[]'::jsonb)) i))
       where x.e ->> 'kind' = 'structure'
         and not (x.n::integer = any (v_alone))
         and coalesce(r.data_class, 'record') <> 'record'
         and not (v_sets ? r.organization_id::text and r.table_id = v_kernel and r.deleted_at is null)
         and not ((v_need -> x.n::text -> 'need') ? r.id::text
                  and (case when (v_need -> x.n::text ->> 'covered')::boolean then v_pre else v_levels end) ? r.id::text)
         and not (v_tplm ? r.id::text));
  end if;

  return query
    with a as materialized (
      select x.n, (x.e ->> 'organization_id')::uuid as org,
             case when x.e ->> 'kind' = 'structure' then 'structure'
                  when x.e ->> 'kind' = 'form' then 'form' else 'portal' end as k,
             array(select (i #>> '{}')::uuid from jsonb_array_elements(coalesce(x.e -> 'ids', '[]'::jsonb)) i) as ids
        from jsonb_array_elements(p_asks) with ordinality x(e, n)
       where not (x.n::integer = any (v_alone))
    ), s as materialized (
      select a.n, a.org, r.id, coalesce(r.updated_at, r.created_at) as at, coalesce(r.updated_by, r.created_by) as by_,
             r.table_id, r.deleted_at, r.data_class
        from a join custom.record r on r.organization_id = a.org and r.id = any (a.ids)
       where a.k = 'structure'
    ), f as materialized (
      select a.n, a.org, fo.id, coalesce(fo.updated_at, fo.created_at) as at, coalesce(fo.updated_by, fo.created_by) as by_,
             fo.table_id
        from a join custom.anon_form fo on fo.organization_id = a.org and fo.id = any (a.ids)
       where a.k = 'form'
    ), p as materialized (
      select a.n, a.org, po.id, po.created_at as at, po.created_by as by_, po.client_table_id
        from a join custom.portal po on po.organization_id = a.org and po.id = any (a.ids)
       where a.k = 'portal'
    ), vis as materialized (
      -- the organization's Table list, one call per organization (custom.hub_changed_by's form and portal arms)
      select o.org, v.v as tid
        from (select distinct f.org from f union select distinct p.org from p where not v_owner) o
        cross join lateral custom.query_visible_ids(o.org, v_kernel) v
    ), people as materialized (
      select q.org, custom.history_people(q.org, array_agg(distinct q.by_)) as m
        from (select s.org, s.by_ from s union all select f.org, f.by_ from f union all select p.org, p.by_ from p) q
       where q.by_ is not null
       group by q.org
    )
    select s.org, s.id, s.at, pe.m #>> array[s.by_::text, 'name']
      from s left join people pe on pe.org = s.org
     where coalesce(s.data_class, 'record') <> 'record'
       and (v_owner
            or case
                 when v_sets ? s.org::text and s.table_id = v_kernel and s.deleted_at is null
                   then (v_sets -> s.org::text) ? s.id::text
                 when (v_need -> s.n::text -> 'need') ? s.id::text
                      and (case when (v_need -> s.n::text ->> 'covered')::boolean then v_pre else v_levels end) ? s.id::text
                   then coalesce(((case when (v_need -> s.n::text ->> 'covered')::boolean then v_pre else v_levels end)
                                  -> s.id::text ->> 's')::boolean, false)
                 when v_tplm ? s.id::text
                   then coalesce((v_tplm -> s.id::text ->> 's')::boolean, false)
                 else false  -- never reached: such an ask was handed to custom.hub_changed_by above
               end)
    union all
    select f.org, f.id, f.at, pe.m #>> array[f.by_::text, 'name']
      from f left join people pe on pe.org = f.org
     where exists (select 1 from vis where vis.org = f.org and vis.tid = f.table_id)
    union all
    select p.org, p.id, p.at, pe.m #>> array[p.by_::text, 'name']
      from p left join people pe on pe.org = p.org
     where v_owner or exists (select 1 from vis where vis.org = p.org and vis.tid = p.client_table_id);

  -- the asks about an organization this statement has not walked: custom.hub_changed_by itself
  for v_ask in select x.e from jsonb_array_elements(p_asks) with ordinality x(e, n) where x.n::integer = any (v_alone) loop
    v_org := (v_ask ->> 'organization_id')::uuid;
    return query
      select v_org, c.id, c.at, c.who
        from custom.hub_changed_by(v_org, v_ask ->> 'kind',
               array(select (e #>> '{}')::uuid from jsonb_array_elements(coalesce(v_ask -> 'ids', '[]'::jsonb)) e)) c;
  end loop;
end;
$function$

;

drop function if exists custom.hub_row_asked_alone(uuid, uuid);
