-- chair-step: undo hotdoors7_a - restores custom.query_visible_ids as before HOT-DOORS-7 (one custom.visible_set per organization) and drops custom.kernel_viewer_sets, custom.hot_doors_7_on and the door row. Run AFTER the inverses of hotdoors7_c and hotdoors7_b (d, c, b, a).
-- lane: HOT-DOORS-7
-- ground-standing-ok: c, b — custom.hub_changed_by_many (b) and iam._memo_ask (c) call the functions this drops; their inverses run first and remove those calls
-- based-on: custom.query_visible_ids(uuid, uuid, text) 809dbfcbcf0e9a80384f454fe197385aa261f23699eaff5bad251b21cd417f98
-- based-on: custom.kernel_viewer_sets(uuid, uuid[]) ba03a3d73dd61562df543877c0d558586cf17c81ea926e88cf6e2c254aca69b6
-- based-on: custom.hot_doors_7_on(uuid) b101cf60fc8767079b0b4aff8f809f1cbcfe7fda56d7032ef7ed1541e46f1270

set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION custom.query_visible_ids(p_organization_id uuid, p_table_id uuid DEFAULT NULL::uuid, p_required text DEFAULT 'viewer'::text)
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_user uuid := custom.query_principal();
  v_set  record;
  v_tbl  uuid;
  -- Access ladder T-36: "Shown to" is the list filter ("Only me" hides, never locks). One context
  -- per statement; platform.shown_to_lists decides each row exactly as every other list door does.
  v_ctx  jsonb;
  -- STORE-READ-PERF-4: the Table-kernel answer for every organization of this statement at once.
  v_snap  text;
  v_m     text;
  v_orgs  uuid[];
  v_o     uuid;
  v_sets  jsonb := '[]'::jsonb;
  v_one   record;
  v_among uuid[];
  -- STORE-READ-PERF-6
  v_seen  uuid[];
  v_b     jsonb;
  v_list  text;
  v_pk    text;
  v_pairs text[];
  v_x     text;
  v_t     uuid;
begin
  -- The organization wall, before any row is fetched, because this is now a door a
  -- signed-in person may execute directly.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.query_visible_ids');

  -- A connection with no principal at all is the campaign's own maintenance and is judged by
  -- the ROLE instead, exactly as `custom.query_access_ids` judged it. Unchanged.
  if v_user is null then
    if custom.query_is_store_owner() then
      return query
        select r.id
          from custom.record r
         where r.organization_id = p_organization_id
           and (p_table_id is null or r.table_id = p_table_id)
           and r.deleted_at is null
           and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true';
    end if;
    return;
  end if;
  -- STORE-READ-PERF-5 (2026-09-30): THE TABLE LIST AMONG NAMED TABLES. A door that shows only some
  -- Tables (the scope screens: the Tables the context system keeps) asks through
  -- custom.tables_listed_among, which names them for this organization in the statement memo
  -- ('custom.qvi_kernel_among:<person>:<organization>') around its one call here and drops the entry
  -- after. Then this answer is the answer below restricted to those Tables: the same live,
  -- unquarantined, "shown to" rows, and of them the ones she created or the one ladder's viewer
  -- answer sees — custom.tables_seen_among asked for those Tables only (a Table's answer never
  -- depends on which Tables are walked beside it). Below, at viewer on the Table kernel,
  -- custom.visible_set answers exactly that set — its kernel branch hands back no granted or class
  -- answer, only "every Table is seen" (then each of these is among the seen ones) or the seen list
  -- — except at its stops, where it walks each row; so at a stop (an FK containment parent for
  -- record, more granted kernel ids or live Tables than the ceiling) this is not used and the full
  -- answer below is given, as always.
  if p_table_id = custom.table_kernel_id() and p_required = 'viewer' then
    v_m := platform.memo_k_get('custom.qvi_kernel_among:' || v_user::text || ':' || p_organization_id::text);
    if v_m is not null
       and not exists (select 1 from platform.entity_relationships er
                        where er.child_type = 'record' and er.kind in ('composition', 'containment'))
       and coalesce(cardinality(custom.read_door_granted_ids(p_organization_id, custom.table_kernel_id())), 0)
           <= custom.read_door_ladder_ceiling()
       and (select count(*) from custom.record r
             where r.organization_id = p_organization_id
               and r.table_id = custom.table_kernel_id()
               and r.deleted_at is null) <= custom.read_door_ladder_ceiling() then
      v_among := coalesce(string_to_array(nullif(v_m, ''), ',')::uuid[], '{}'::uuid[]);
      -- STORE-READ-PERF-6 (2026-10-01): THE AMONG WALK ONCE FOR EVERY ORGANIZATION OF THE STATEMENT. A
      -- door that asks this list for several organizations (custom.context_tree) may name them with
      -- their Tables in the statement memo ('custom.kernel_among_batch:<person>': {organization: [Table
      -- ids]}). Then, in a transaction that has written nothing, custom.tables_seen_among is asked once
      -- for all those organizations and all those Tables (a Table's answer never depends on which Tables
      -- or organizations are walked beside it — it is the one ladder's viewer answer about that Table),
      -- and kept in the statement memo; the filter below reads only this organization's Tables of it.
      -- Otherwise it is asked for this organization and these Tables, as before.
      v_seen := null;
      if pg_catalog.pg_current_xact_id_if_assigned() is null then
        v_b := nullif(platform.memo_k_get('custom.kernel_among_batch:' || v_user::text), '')::jsonb;
        -- only when the batch names this organization with every Table this call asks about
        if v_b ? p_organization_id::text
           and not exists (select 1 from unnest(v_among) a
                            where not (v_b -> p_organization_id::text) ? a::text) then
          v_pk := 'custom.kernel_among_seen:' || v_user::text || ':' || md5(v_b::text) || ':'
               || pg_catalog.pg_current_snapshot()::text;
          v_m := platform.memo_k_get(v_pk);
          if v_m is null then
            select coalesce(string_agg(g.organization_id::text || ':' || g.id::text, ','), '') into v_m
              from custom.tables_seen_among(
                     v_user,
                     array(select k::uuid from jsonb_object_keys(v_b) k order by 1),
                     array(select distinct e::uuid from jsonb_each(v_b) t, jsonb_array_elements_text(t.value) e order by 1)) g
             where g.seen;
            perform platform.memo_k_put(v_pk, v_m);
          end if;
          -- this organization's seen Tables only (a record id is unique only within its organization)
          v_seen := array(select split_part(x, ':', 2)::uuid from unnest(string_to_array(nullif(v_m, ''), ',')) x
                           where split_part(x, ':', 1) = p_organization_id::text);
        end if;
      end if;
      if v_seen is null then
        select coalesce(array_agg(g.id), '{}'::uuid[]) into v_seen
          from custom.tables_seen_among(v_user, array[p_organization_id], v_among) g
         where g.seen and g.organization_id = p_organization_id;
      end if;
      v_ctx := custom._record_shown_to_ctx(array[p_organization_id], custom.table_kernel_id());
      return query
        select r.id
          from custom.record r
         where r.organization_id = p_organization_id
           and r.table_id = custom.table_kernel_id()
           and r.id = any (v_among)
           and r.deleted_at is null
           and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
           and platform.shown_to_lists(r.shown_to, r.visibility, r.created_by, r.organization_id, v_user, v_ctx)
           and ( r.created_by = v_user
              or r.id = any (v_seen) );
      return;
    end if;
    v_m := null;
  end if;
  -- STORE-READ-PERF-4 (2026-09-29): THE TABLE LIST, ANSWERED FOR EVERY ORGANIZATION OF THE STATEMENT
  -- AT ONCE. A door that walks many organizations (the data home, the scope tree) first asks
  -- custom.tables_seen_once_per_group for all of them, which names them in this statement's memo.
  -- The first of its per-organization calls here then works out THIS function's own answer — the
  -- same custom.visible_set per organization, the same filters, the same branches, word for word
  -- below — for every one of those organizations in one pass, and leaves each in the memo; the
  -- rest read theirs. Only at viewer, only on the Table kernel, only while the transaction has
  -- written nothing, and never for an organization at one of visible_set's stops (it walks here
  -- as always). Each organization is still decided in its own call, by the wall above, before its
  -- answer is read.
  if p_table_id = custom.table_kernel_id() and p_required = 'viewer'
     and pg_catalog.pg_current_xact_id_if_assigned() is null then
    v_snap := pg_catalog.pg_current_snapshot()::text;
    v_m := platform.memo_k_get('custom.qvi_kernel:' || v_user::text || ':' || p_organization_id::text || ':' || v_snap);
    if v_m is not null then
      return query select x::uuid from unnest(string_to_array(nullif(v_m, ''), ',')) x;
      return;
    end if;
    v_orgs := string_to_array(nullif(platform.memo_k_get('custom.tables_seen_orgs:' || v_user::text || ':' || v_snap), ''), ',')::uuid[];
    -- (an organization at one of visible_set's stops walks on its own, below, without a batch)
    if p_organization_id = any (coalesce(v_orgs, '{}'::uuid[]))
       and not (custom.visible_set(v_user, p_organization_id, custom.table_kernel_id(),
                                   'viewer'::public.permission_level)).o_fallback then
      -- STORE-READ-PERF-5: the "shown to" context of these organizations' Tables only, without the
      -- teammates where no row can read them (custom._record_shown_to_ctx; same answers).
      v_ctx := custom._record_shown_to_ctx(v_orgs, custom.table_kernel_id());
      foreach v_o in array v_orgs loop
        v_set := custom.visible_set(v_user, v_o, custom.table_kernel_id(), 'viewer'::public.permission_level);
        continue when v_set.o_fallback;
        v_sets := v_sets || jsonb_build_object('org', v_o, 'all', v_set.o_all_visible,
                    'tv', coalesce(to_jsonb(v_set.o_true_visibility), '[]'::jsonb),
                    'ga', coalesce(to_jsonb(v_set.o_granted_all), '[]'::jsonb),
                    'gv', coalesce(to_jsonb(v_set.o_granted_visible), '[]'::jsonb),
                    'cv', coalesce(to_jsonb(v_set.o_carried_visible), '[]'::jsonb));
      end loop;
      if exists (select 1 from jsonb_array_elements(v_sets) e where (e ->> 'org')::uuid = p_organization_id) then
        for v_one in
          with sets as materialized (
            select (e ->> 'org')::uuid as org, (e ->> 'all')::boolean as all_v,
                   array(select jsonb_array_elements_text(e -> 'tv'))::platform.visibility[] as tv,
                   array(select jsonb_array_elements_text(e -> 'ga'))::uuid[] as ga,
                   array(select jsonb_array_elements_text(e -> 'gv'))::uuid[] as gv,
                   array(select jsonb_array_elements_text(e -> 'cv'))::uuid[] as cv
              from jsonb_array_elements(v_sets) e
          )
          select s.org,
                 coalesce((select string_agg(r.id::text, ',')
                             from custom.record r
                            where r.organization_id = s.org
                              and r.table_id = custom.table_kernel_id()
                              and r.deleted_at is null
                              and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
                              and platform.shown_to_lists(r.shown_to, r.visibility, r.created_by, r.organization_id, v_user, v_ctx)
                              and case
                                    when s.all_v then true
                                    when coalesce(array_length(s.tv, 1), 0) > 0 then
                                      ( r.created_by = v_user
                                     or (r.visibility = any (s.tv) and not (r.id = any (s.ga)))
                                     or r.id = any (s.gv)
                                     or r.id = any (s.cv) )
                                    else
                                      ( r.created_by = v_user
                                     or r.id = any (s.gv)
                                     or r.id = any (s.cv) )
                                  end), '') as ids
            from sets s
        loop
          perform platform.memo_k_put('custom.qvi_kernel:' || v_user::text || ':' || v_one.org::text || ':' || v_snap, v_one.ids);
          if v_one.org = p_organization_id then
            v_m := v_one.ids;
          end if;
        end loop;
        return query select x::uuid from unnest(string_to_array(nullif(v_m, ''), ',')) x;
        return;
      end if;
    end if;
  end if;

  -- STORE-READ-PERF-6 (2026-10-01): EVERY NAMED (ORGANIZATION, TABLE) OF THE STATEMENT AT ONCE. A door
  -- that reads many ordinary Tables in one statement (custom.context_tree: its scope Tables) names the
  -- pairs in the statement memo ('custom.qvi_pairs:<person>'). The first call here about a named pair,
  -- at viewer, in a transaction that has written nothing, works out THIS function's own answer for
  -- every named pair in one pass — the loop below (a Table with no live record of the organization
  -- answers nothing; custom.visible_set per pair; its four branches), with ONE query over all pairs —
  -- and leaves each pair's ids in the statement memo; the rest read theirs. A pair at one of
  -- visible_set's stops is left out and walks below in its own call, as always. The "shown to"
  -- context is one for all the named organizations: the whole platform.shown_to_context('record')
  -- when a live row of a named pair says my_team, else custom._record_shown_to_ctx for those
  -- organizations (which is the whole context when one of their defaults is my_team, else each
  -- organization's default without the teammates) — any of these answers platform.shown_to_lists
  -- exactly as the per-Table context does, because a row reads only its own organization's default
  -- and reads the teammates only when its list resolves to my_team. Each call still meets the wall
  -- above, for its own organization, before its answer is read.
  if p_table_id is not null and p_table_id <> custom.table_kernel_id() and p_required = 'viewer'
     and pg_catalog.pg_current_xact_id_if_assigned() is null then
    v_list := platform.memo_k_get('custom.qvi_pairs:' || v_user::text);
    if v_list is not null
       and strpos(',' || v_list || ',', ',' || p_organization_id::text || ':' || p_table_id::text || ',') > 0 then
      v_pk := 'custom.qvi_pair:' || v_user::text || ':' || md5(v_list) || ':' || pg_catalog.pg_current_snapshot()::text || ':';
      v_m := platform.memo_k_get(v_pk || p_organization_id::text || ':' || p_table_id::text);
      if v_m is null and platform.memo_k_get(v_pk || 'asked') is null then
        perform platform.memo_k_put(v_pk || 'asked', '1');
        v_pairs := array(select distinct x from unnest(string_to_array(v_list, ',')) x where x <> '' order by 1);
        v_orgs := array(select distinct split_part(x, ':', 1)::uuid from unnest(v_pairs) x order by 1);
        if exists (select 1
                     from unnest(v_pairs) x
                     join custom.record r
                       on r.organization_id = split_part(x, ':', 1)::uuid
                      and r.table_id = split_part(x, ':', 2)::uuid
                      and r.deleted_at is null
                      and r.shown_to = 'my_team'::platform.shown_to) then
          v_ctx := platform.shown_to_context('record');
        else
          v_ctx := custom._record_shown_to_ctx(v_orgs, split_part(v_pairs[1], ':', 2)::uuid);
        end if;
        foreach v_x in array v_pairs loop
          v_o := split_part(v_x, ':', 1)::uuid;
          v_t := split_part(v_x, ':', 2)::uuid;
          if not exists (select 1 from custom.record r
                          where r.organization_id = v_o and r.deleted_at is null and r.table_id = v_t) then
            perform platform.memo_k_put(v_pk || v_x, '');
            continue;
          end if;
          v_set := custom.visible_set(v_user, v_o, v_t, 'viewer'::public.permission_level);
          continue when v_set.o_fallback;
          v_sets := v_sets || jsonb_build_object('org', v_o, 'tbl', v_t, 'all', v_set.o_all_visible,
                      'tv', coalesce(to_jsonb(v_set.o_true_visibility), '[]'::jsonb),
                      'ga', coalesce(to_jsonb(v_set.o_granted_all), '[]'::jsonb),
                      'gv', coalesce(to_jsonb(v_set.o_granted_visible), '[]'::jsonb),
                      'cv', coalesce(to_jsonb(v_set.o_carried_visible), '[]'::jsonb));
        end loop;
        for v_one in
          with sets as materialized (
            select (e ->> 'org')::uuid as org, (e ->> 'tbl')::uuid as tbl, (e ->> 'all')::boolean as all_v,
                   array(select jsonb_array_elements_text(e -> 'tv'))::platform.visibility[] as tv,
                   array(select jsonb_array_elements_text(e -> 'ga'))::uuid[] as ga,
                   array(select jsonb_array_elements_text(e -> 'gv'))::uuid[] as gv,
                   array(select jsonb_array_elements_text(e -> 'cv'))::uuid[] as cv
              from jsonb_array_elements(v_sets) e
          )
          select s.org, s.tbl,
                 coalesce((select string_agg(r.id::text, ',')
                             from custom.record r
                            where r.organization_id = s.org
                              and r.table_id = s.tbl
                              and r.deleted_at is null
                              and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
                              and platform.shown_to_lists(r.shown_to, r.visibility, r.created_by, r.organization_id, v_user, v_ctx)
                              and case
                                    when s.all_v then true
                                    when coalesce(array_length(s.tv, 1), 0) > 0 then
                                      ( r.created_by = v_user
                                     or (r.visibility = any (s.tv) and not (r.id = any (s.ga)))
                                     or r.id = any (s.gv)
                                     or r.id = any (s.cv) )
                                    else
                                      ( r.created_by = v_user
                                     or r.id = any (s.gv)
                                     or r.id = any (s.cv) )
                                  end), '') as ids
            from sets s
        loop
          perform platform.memo_k_put(v_pk || v_one.org::text || ':' || v_one.tbl::text, v_one.ids);
        end loop;
        v_m := platform.memo_k_get(v_pk || p_organization_id::text || ':' || p_table_id::text);
      end if;
      if v_m is not null then
        return query select x::uuid from unnest(string_to_array(nullif(v_m, ''), ',')) x;
        return;
      end if;
      v_m := null;
    end if;
  end if;

  -- STORE-READ-PERF-5: the "shown to" context of this organization (and Table) only, without the
  -- teammates where no row can read them (custom._record_shown_to_ctx; same answers).
  v_ctx := custom._record_shown_to_ctx(array[p_organization_id], p_table_id);

  for v_tbl in
    select distinct r.table_id
      from custom.record r
     where r.organization_id = p_organization_id
       and r.deleted_at is null
       and (p_table_id is null or r.table_id = p_table_id)
  loop
    v_set := custom.visible_set(v_user, p_organization_id, v_tbl,
                                p_required::public.permission_level);

    if v_set.o_fallback then
      raise notice '%', v_set.o_note;
      return query
        select r.id
          from custom.record r
         where r.organization_id = p_organization_id
           and r.table_id is not distinct from v_tbl
           and r.deleted_at is null
           -- DOOR-17: a quarantined submission is invisible to every read until a Rule clears it.
           and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
           and platform.shown_to_lists(r.shown_to, r.visibility, r.created_by, r.organization_id, v_user, v_ctx)
           -- THE ONE LADDER, per row, exactly as before this file.
           and custom.has_visibility(v_user, 'record', r.id, p_required::public.permission_level);

    elsif v_set.o_all_visible then
      return query
        select r.id
          from custom.record r
         where r.organization_id = p_organization_id
           and r.table_id is not distinct from v_tbl
           and r.deleted_at is null
           and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
           and platform.shown_to_lists(r.shown_to, r.visibility, r.created_by, r.organization_id, v_user, v_ctx);

    elsif coalesce(array_length(v_set.o_true_visibility, 1), 0) > 0 then
      return query
        select r.id
          from custom.record r
         where r.organization_id = p_organization_id
           and r.table_id is not distinct from v_tbl
           and r.deleted_at is null
           and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
           and platform.shown_to_lists(r.shown_to, r.visibility, r.created_by, r.organization_id, v_user, v_ctx)
           and ( r.created_by = v_user
              or (r.visibility = any (v_set.o_true_visibility) and not (r.id = any (v_set.o_granted_all)))
              or r.id = any (v_set.o_granted_visible)
              or r.id = any (v_set.o_carried_visible) );

    else
      return query
        select r.id
          from custom.record r
         where r.organization_id = p_organization_id
           and r.table_id is not distinct from v_tbl
           and r.deleted_at is null
           and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
           and platform.shown_to_lists(r.shown_to, r.visibility, r.created_by, r.organization_id, v_user, v_ctx)
           and ( r.created_by = v_user
              or r.id = any (v_set.o_granted_visible)
              or r.id = any (v_set.o_carried_visible) );
    end if;
  end loop;
end;
$function$
;

delete from platform.client_callable_door where schema_name = 'custom' and function_name = 'kernel_viewer_sets';
drop function if exists custom.kernel_viewer_sets(uuid, uuid[]);
drop function if exists custom.hot_doors_7_on(uuid);
