-- chair-step: this replaces the body of custom.table_list_everywhere(uuid) — same signature, same grants (authenticated), same comment, same platform.client_callable_door row, still STABLE SECURITY DEFINER — so the no-organization branch answers every organization in ONE statement instead of calling itself once per organization. Same rows, same values, same order keys; one deterministic tiebreak (the Table's id) is added at the end of the order. The (uuid, boolean) overload is untouched. No table, index, policy, grant or data row is touched.
-- lane: CHAIR-GRID (asked by v6 lane 12 PLATFORM-APP-DATA for lane data-tables-grid-overhaul, "tables-list door (go-live blocker for admin-sized accounts)")
-- based-on: custom.table_list_everywhere(uuid) 99726734c6bca99fc6a397660b466f1caff3908a2d4a7feeb69e4c11c6ebac36
--
-- THE TABLE LIST ANSWERS EVERY ORGANIZATION IN ONE STATEMENT. Every picker, ⌘K and the quick sheet
-- ask custom.table_list_everywhere(null) for the Tables a person may open across all her
-- organizations. The body called ITSELF once per organization, and each call counted rows, Fields
-- and the latest activity Table by Table and asked custom.table_placement — a scan of the
-- organization's whole Field graph — once per Table. For admin@admin.com (48 organizations, ~600
-- Tables) that was 25–47 s on the clone when the grid lane measured it (TABLE-LIST-PERF), against an
-- 8 s statement limit on the web: a go-live blocker for any account of that size.
--
-- WHAT CHANGES: the walls are asked first (custom.assert_client_may_reach, this door's own name, per
-- organization — one that refuses contributes nothing, as before); the one ladder is primed once for
-- every admitted organization (custom.tables_seen_once_per_group, as custom.data_home_tables does);
-- then the row counts, the latest activity, the Field counts and the one Field-graph question
-- custom.table_placement asks (is this Table some list Field's options table) are read ONCE,
-- set-based, for all admitted organizations. The placement arithmetic is custom.table_placement's
-- own, word for word (custom.table_kept_for_derived with the same three arguments); the document
-- shape, the visibility, the "Show app tables" switch and the order keys are unchanged.
-- WHAT DOES NOT CHANGE: the one-organization branch still meets its wall and its ladder exactly as
-- before; no permission is widened or narrowed anywhere; the comment, the grant to authenticated,
-- the door row and the platform._t13_allowlist entry (which names this exact signature) all stand.
--
-- Proof (clone exerfbdiksdjilwerpda, 2026-10-03, both seats through the door): same rows and values
-- for admin@admin.com and test@test.com before and after, timings in the lane's report.
-- Inverse: migrations/inverse/chairgrid_a_the_table_list_answers_every_organization_in_one_statement_down.sql

CREATE OR REPLACE FUNCTION custom.table_list_everywhere(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me     uuid := custom.query_principal();
  v_kernel uuid := custom.table_kernel_id();
  v_field  uuid := custom.field_kernel_id();
  v_orgs   uuid[] := '{}'::uuid[];
  v_org    uuid;
  v_tables jsonb;
begin
  -- NO ORGANIZATION NAMED = the optional organization FILTER left off (org-filter sweep, 2026-09-29;
  -- access-belongs-to-the-person): the Tables the caller may open in EVERY organization she belongs
  -- to. Each organization still meets its own wall (custom.assert_client_may_reach, this door's name)
  -- and its own ladder (custom.query_visible_ids) below; an organization whose wall refuses (42501)
  -- contributes nothing. No permission is changed by this branch.
  --
  -- TABLE-LIST-PERF (2026-10-03, lane data-tables-grid-overhaul; shipped by CHAIR-GRID): ONE STATEMENT
  -- FOR EVERY ORGANIZATION. This branch used to call this same door once per organization, and each
  -- call counted rows, Fields and latest activity Table by Table and asked custom.table_placement (a
  -- scan of the organization's whole Field graph) once per Table: ~25-40 s for admin@admin.com (48
  -- organizations, ~600 Tables) against an 8 s statement limit. Now the walls are asked first, the one
  -- ladder is primed once for all admitted organizations (custom.tables_seen_once_per_group, as
  -- custom.data_home_tables does), and the counts, the Field graph and the placement are read once,
  -- set-based. Same rows, same shape, same order.
  if p_organization_id is null then
    if v_me is null then
      return jsonb_build_object('success', true, 'tables', '[]'::jsonb);
    end if;
    for v_org in
      select m.organization_id
        from iam.organization_member m
        join iam.organizations o on o.id = m.organization_id and o.archived_at is null
       where m.user_id = v_me
    loop
      begin
        perform custom.assert_client_may_reach(v_org, 'custom.table_list_everywhere');
        v_orgs := v_orgs || v_org;
      exception when insufficient_privilege then
        continue;
      end;
    end loop;
  else
    perform custom.assert_client_may_reach(p_organization_id, 'custom.table_list_everywhere');
    v_orgs := array[p_organization_id];
  end if;

  if cardinality(v_orgs) = 0 then
    return jsonb_build_object('success', true, 'tables', '[]'::jsonb);
  end if;

  -- STORE-READ-PERF-3/4: the one ladder's Table answer for every admitted organization at once; the
  -- answer waits in this statement's memo and each custom.query_visible_ids below reads its own
  -- organization's part. It decides nothing: without it every answer is the same, only slower.
  if v_me is not null then
    perform count(*) from custom.tables_seen_once_per_group(v_me, v_orgs);
  end if;

  with visible as materialized (
    select o.org, v.v as id
      from unnest(v_orgs) as o(org)
      cross join lateral custom.query_visible_ids(o.org, v_kernel) v
  ),
  tbl as materialized (
    select t.*
      from custom.record t
      join visible v on v.org = t.organization_id and v.id = t.id
     where t.table_id = v_kernel
       and t.data_class = 'table'
       and t.deleted_at is null
  ),
  activity as materialized (
    -- rows and latest activity of every listed Table, one grouped read
    select r.organization_id, r.table_id,
           max(r.updated_at) as last_updated,
           count(*) filter (where r.data_class = 'record' and r.deleted_at is null) as row_count
      from (select distinct organization_id, id from tbl) k
      join custom.record r on r.organization_id = k.organization_id and r.table_id = k.id
     group by 1, 2
  ),
  field_counts as materialized (
    -- the Field graph of the admitted organizations, read once: live Fields per Table ...
    select f.organization_id, f.data ->> 'entity_definition_id' as entity_id, count(*) as field_count
      from custom.record f
     where f.organization_id = any (v_orgs)
       and f.table_id = v_field
       and f.data_class = 'field'
       and f.deleted_at is null
     group by 1, 2
  ),
  options_tables as materialized (
    -- ... and which Tables a list Field takes its choices from (custom.table_placement's one
    -- Field-graph question, asked once for every organization instead of once per Table)
    select distinct f.organization_id, f.data -> 'config' ->> 'options_table_id' as id
      from custom.record f
     where f.organization_id = any (v_orgs)
       and f.table_id = v_field
       and f.deleted_at is null
       and f.data ->> 'type' = 'list'
       and f.data -> 'config' ->> 'options_table_id' is not null
  ),
  store as materialized (
    select jsonb_build_object(
             'id', t.id,
             'table_name', coalesce(nullif(t.data ->> 'name', ''), '(unnamed table)'),
             'description', t.data ->> 'description',
             'version', t.version,
             'user_id', t.created_by,
             'is_public', false,
             'visibility', t.visibility::text,
             'organization_id', t.organization_id,
             'created_at', t.created_at,
             'updated_at', t.updated_at,
             'last_activity_at', greatest(t.updated_at, a.last_updated),
             'row_count', coalesce(a.row_count, 0),
             'field_count', coalesce(fc.field_count, 0),
             'store', 'records')
           -- SC-1 PLACEMENT: custom.table_placement(t.organization_id, t.id, t.data, false), word for
           -- word, with its one Field-graph question answered from `options_tables` above instead of per Table.
           || (select jsonb_build_object(
                        'kept_by_the_app', d.kept,
                        'kept_for', case when d.kept then coalesce(nullif(btrim(t.data ->> 'kept_for'), ''), d.word, 'app') end,
                        'offered_as_context',
                          case when jsonb_typeof(t.data -> 'offered_as_context') = 'boolean'
                               then (t.data ->> 'offered_as_context')::boolean else false end)
                 from (select w.word,
                              (w.word is not null
                               or coalesce(t.data ->> 'kept_by_the_app', '') = 'true'
                               or coalesce(btrim(t.data ->> 'kept_for'), '') <> '') as kept
                         from (select custom.table_kept_for_derived(
                                        t.data, false,
                                        ot.id is not null) as word) w) d) as doc
      from tbl t
      left join activity a on a.organization_id = t.organization_id and a.table_id = t.id
      left join field_counts fc on fc.organization_id = t.organization_id and fc.entity_id = t.id::text
      left join options_tables ot on ot.organization_id = t.organization_id and ot.id = t.id::text
  )
  -- The order keys are the door's own (latest activity, then creation, newest first); the Table's id
  -- closes a tie so two calls page the same way (CHAIR-GRID).
  select coalesce(jsonb_agg(x.doc order by (x.doc ->> 'last_activity_at') desc nulls last,
                                           (x.doc ->> 'created_at') desc,
                                           (x.doc ->> 'id')), '[]'::jsonb)
    into v_tables
    -- APP TABLES WAIT BEHIND ONE SWITCH (lane CHAIR-DOORS-2, v6 N-C8): a Table the app keeps out of every
    -- default list (custom.table_kept_out_of_lists on its placement word) only with p_include_app_tables.
    from (select s.doc from store s
           where current_setting('custom.include_app_tables', true) is not distinct from 'on'
              or not custom.table_kept_out_of_lists(s.doc ->> 'kept_for')) x;

  return jsonb_build_object('success', true, 'tables', v_tables);
end
$function$;
