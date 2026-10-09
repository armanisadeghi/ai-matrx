-- lane: PERF-FIX-2
-- based-on: custom.levels_of(uuid, uuid[]) 2ea73552ba4a9be5624d968c60c6678d1f8b0784a37e0c1d9541a1627e0ccdef
-- based-on: custom.tables_seen_among(uuid, uuid[], uuid[]) a3bc3fbe97c3d58a704a6be7490a84682fc758e1f13a51a24cf6d20aae9a1a07
-- based-on: custom.data_home_tables(uuid) 0cd4e1879d24e88bc337ee812c168dd336e1eb9aef09fa2be134e119f7dfa8cc
-- based-on: custom.data_home_changed_by(jsonb) 0a2cf4d228f1658274cc1772d8262419761b677df3560c4b0736bffe3dc2c881
--
-- PERF-FIX-2 (2026-10-07). The access ladder asked as a set, same answers.
--   * custom.reaches_directly_many(person, targets[], type, rung): custom.reaches_directly for every
--     target - that very function, so it cannot drift - after reading ONCE, for all targets, whether
--     each record can have a Confidential anchor at all (the anchor read is a by-id read across all
--     sixteen partitions, asked twice per record: by the store's ladder and by the access kernel).
--   * custom.effective_level_many(person, ids[], type): custom.effective_level's halving for every id,
--     the ids at the same rung in the same round asked together through reaches_directly_many.
--   * custom.levels_of asks effective_level_many once for every class representative (was one
--     effective_level per class); custom.tables_seen_among asks reaches_directly_many once for every
--     group's first Table (was one reaches_directly per group).
--   * custom.data_home_tables / custom.data_home_changed_by: the memo key they test for "already walked"
--     now ends in the snapshot, as the walk writes it - it never matched, so every organization was
--     handed to the walk's memo shortcut again.
-- Proof: one REPEATABLE READ transaction, old answers, these bodies, new answers, rolled back - 3,574
-- targets x {admin, test} x {viewer, editor} single vs single and vs the set form, effective_level on 600,
-- levels_of, the walk, data_home, data_home_tables, read_records_page/drill_rows on 10 Tables: 0 differ.
-- New functions are not client doors (the definer guard clears PUBLIC at birth; no client grant). Function bodies: any hour.

set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION custom.reaches_directly_many(p_user_id uuid, p_targets uuid[], p_type text DEFAULT 'record'::text, p_required permission_level DEFAULT 'viewer'::permission_level)
 RETURNS TABLE(target uuid, reaches boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- PERF-FIX-2 (2026-10-07). THE SET FORM OF custom.reaches_directly: one row per distinct non-null
-- target, `reaches` = custom.reaches_directly(p_user_id, p_type, target, p_required) - that very
-- function, asked for each target, so it is not a second ladder and cannot drift from it.
-- What it shares is the one question that function and the access kernel each ask first about a
-- record: does it have a Confidential anchor (custom.confidential_anchor, twice per record, each a
-- read by id across all sixteen partitions). Here it is read ONCE for every target together. A
-- target that no row of class `record` carries, or that exactly one such row carries whose Table is
-- not Confidential and whose document names no parent, has no anchor - custom.confidential_anchor's
-- own loop stops at that first row - and the statement memo is given the very "none" ('-') that
-- function would leave there (only while the transaction has written nothing, as it does). Every
-- other target is left to the anchor function, as before.
declare
  v_kernel uuid := custom.table_kernel_id();
  v_snap   text := pg_catalog.pg_current_snapshot()::text;
begin
  if p_targets is null or cardinality(p_targets) = 0 then
    return;
  end if;
  if p_user_id is not null and p_type = 'record' and pg_catalog.pg_current_xact_id_if_assigned() is null then
    perform platform.memo_k_put('custom.confidential_anchor:' || q.id::text || ':' || v_snap, '-')
       from (
         select u.id,
                count(w.id) as n_rec,
                coalesce(bool_or((t.data ->> 'level') = 'confidential'), false) as conf_tbl,
                coalesce(bool_or(jsonb_typeof(w.data -> 'parent_id') = 'string'), false) as has_parent
           from (select distinct x as id from unnest(p_targets) x where x is not null) u
           left join custom.record w on w.id = u.id and w.data_class = 'record'
           left join custom.record t
             on t.organization_id = w.organization_id and t.id = w.table_id and t.table_id = v_kernel
          group by u.id
       ) q
      where q.n_rec = 0 or (q.n_rec = 1 and not q.conf_tbl and not q.has_parent);
  end if;
  return query
    select u.x, custom.reaches_directly(p_user_id, p_type, u.x, p_required)
      from (select distinct x from unnest(p_targets) x where x is not null) u(x);
end;
$function$;


insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'reaches_directly_many', 'p_user_id uuid, p_targets uuid[], p_type text, p_required permission_level',
        array['uuid'::regtype, 'uuid[]'::regtype, 'text'::regtype, 'public.permission_level'::regtype]::oid[],
        'p_user_id is the principal the CALLING definer already resolved and is never taken from a client; p_targets are rows that door already decided it may ask about. It decides nothing of its own: for each distinct non-null target it answers exactly custom.reaches_directly(p_user_id, p_type, target, p_required) - it calls that function - after reading once whether each record can have a Confidential anchor. A NULL p_user_id answers false for every target; NULL targets are skipped.',
        'migrations/campaign/perffix2_a_the_ladder_asks_a_set_once.sql (lane PERF-FIX-2)',
        'server_only: the set form of custom.reaches_directly, called only inside the record store''s own definer doors (custom.tables_seen_among, custom.effective_level_many). It takes the principal as an argument, so a client reaching it directly could ask what somebody else reaches.',
        false, false);

CREATE OR REPLACE FUNCTION custom.effective_level_many(p_user_id uuid, p_ids uuid[], p_type text DEFAULT 'record'::text)
 RETURNS TABLE(id uuid, level permission_level)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- PERF-FIX-2 (2026-10-07). THE SET FORM OF custom.effective_level: one row per distinct non-null id,
-- `level` exactly what custom.effective_level(p_user_id, <any organization>, id, p_type) answers (that
-- function never reads its organization argument). The same halving over iam.content_levels(), and at
-- every step the same three questions effective_level's own check asks, in its order: the copy in
-- progress hides it (asked once per id: it does not depend on the rung), custom.reaches_directly (asked
-- through custom.reaches_directly_many for every id standing at the same rung in the same round), and
-- at viewer a Table that something inside opens (custom.table_has_a_visible_record). Each id walks its
-- own halving; the ids only share the asking. An id more than one row carries is answered by
-- custom.effective_level itself.
declare
  v_levels public.permission_level[];
  v_nl     integer;
  v_id     uuid[];  v_org uuid[];  v_tbl uuid[];  v_solo boolean[];  v_hide boolean[];
  v_lo     integer[];  v_hi integer[];  v_best integer[];
  v_kernel uuid := custom.table_kernel_id();
  v_m      integer;
  v_ix     integer[];
  v_ask    uuid[];
  v_ans    jsonb;
  v_yes    boolean;
  i        integer;
begin
  if p_ids is null or cardinality(p_ids) = 0 then
    return;
  end if;
  select coalesce(array_agg(l.level order by l.ordinal), '{}'::public.permission_level[])
    into v_levels
    from iam.content_levels() l;
  v_nl := coalesce(array_length(v_levels, 1), 0);
  if p_user_id is null or v_nl = 0 then
    return query select distinct u.x, null::public.permission_level from unnest(p_ids) u(x) where u.x is not null;
    return;
  end if;

  select coalesce(array_agg(q.id order by q.id), '{}'), coalesce(array_agg(q.org order by q.id), '{}'),
         coalesce(array_agg(q.tbl order by q.id), '{}'), coalesce(array_agg(q.n > 1 order by q.id), '{}')
    into v_id, v_org, v_tbl, v_solo
    from (select u.id, count(w.id) as n, (array_agg(w.organization_id))[1] as org, (array_agg(w.table_id))[1] as tbl
            from (select distinct x as id from unnest(p_ids) x where x is not null) u
            left join custom.record w on p_type = 'record' and w.id = u.id
           group by u.id) q;

  v_hide := array_fill(false, array[cardinality(v_id)]);
  v_lo   := array_fill(1, array[cardinality(v_id)]);
  v_hi   := array_fill(v_nl, array[cardinality(v_id)]);
  v_best := array_fill(0, array[cardinality(v_id)]);
  for i in 1 .. cardinality(v_id) loop
    if v_solo[i] then
      continue;
    end if;
    if p_type = 'record' then
      v_hide[i] := custom._copy_in_progress_hides(p_user_id, v_id[i]);
    end if;
  end loop;

  loop
    select min((v_lo[k] + v_hi[k]) / 2) into v_m
      from generate_subscripts(v_id, 1) k
     where not v_solo[k] and v_lo[k] <= v_hi[k];
    exit when v_m is null;
    v_ix := array(select k from generate_subscripts(v_id, 1) k
                   where not v_solo[k] and v_lo[k] <= v_hi[k] and (v_lo[k] + v_hi[k]) / 2 = v_m order by k);
    v_ask := array(select v_id[k] from unnest(v_ix) k where not v_hide[k]);
    select coalesce(jsonb_object_agg(m.target::text, m.reaches), '{}'::jsonb) into v_ans
      from custom.reaches_directly_many(p_user_id, v_ask, p_type, v_levels[v_m]) m;
    foreach i in array v_ix loop
      if v_hide[i] then
        v_yes := false;
      else
        v_yes := coalesce((v_ans ->> v_id[i]::text)::boolean, false);
        if not v_yes and p_type = 'record' and v_levels[v_m] <= 'viewer'::public.permission_level
           and v_tbl[i] = v_kernel
           and custom.table_has_a_visible_record(p_user_id, v_org[i], v_id[i]) then
          v_yes := true;
        end if;
      end if;
      if v_yes then
        v_best[i] := v_m;
        v_lo[i] := v_m + 1;
      else
        v_hi[i] := v_m - 1;
      end if;
    end loop;
  end loop;

  return query
    select v_id[k],
           case when v_solo[k] then custom.effective_level(p_user_id, v_org[k], v_id[k], p_type)
                when v_best[k] = 0 then null::public.permission_level
                else v_levels[v_best[k]] end
      from generate_subscripts(v_id, 1) k;
end;
$function$;


insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'effective_level_many', 'p_user_id uuid, p_ids uuid[], p_type text',
        array['uuid'::regtype, 'uuid[]'::regtype, 'text'::regtype]::oid[],
        'p_user_id is the reader the CALLING definer already resolved (auth.uid()); p_ids are records that door is about to read. It decides nothing of its own: for each distinct non-null id it answers exactly custom.effective_level(p_user_id, <its organization>, id, p_type), the same halving with the ids at one rung asked together. A NULL p_user_id answers null for every id.',
        'migrations/campaign/perffix2_a_the_ladder_asks_a_set_once.sql (lane PERF-FIX-2)',
        'server_only: the set form of custom.effective_level, called only inside custom.levels_of, itself called only inside the record store''s own definer doors. It takes the principal as an argument, so a client reaching it directly could ask somebody else''s rung.',
        false, false);

CREATE OR REPLACE FUNCTION custom.levels_of(p_user_id uuid, p_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- STORE-READ-PERF-2 (2026-09-25). THE RUNG, ONCE PER CLASS, FOR A SET OF RECORDS.
--
-- Answers, for each id, exactly what the one ladder answers about it for this person:
--   l = custom.effective_level(p_user_id, <its organization>, id)   (the rung the mask needs)
--   s = custom.has_visibility(p_user_id, 'record', id, 'viewer')   (the read door's own check)
-- as {"<id>": {"l": <level or null>, "s": <bool>}}.
--
-- CHAIR-READPERF (round 2, 2026-10-03). Each answer for an id that exactly ONE row carries also names
-- that row's organization: {"l": .., "s": .., "o": "<organization id>"}. It is a fact this door has
-- already read (the row's home), handed on so the next door reads the row by its key (organization,
-- id) — one partition — instead of by id across all sixteen. An id no row carries, or more than one
-- row carries, has no "o". Every reader of this answer takes `l` and `s` by name.
--
-- WHY IT MAY ASK ONCE PER CLASS. Every input the ladder reads about ONE record is either a
-- column of that record — its organization, its Table, its `visibility`, whether it is live,
-- whether this person created it (`iam.owner_of` reads `created_by`), whether its document names
-- a parent, whether its Table is Confidential — or a row somewhere else that NAMES that record by
-- id: a grant (`iam.permissions`), a membership THIS PERSON holds on it (`iam.memberships`, record
-- or scope — nothing on the ladder reads anybody else's), a library grant
-- (`platform.entity_grants`), a closure row (`platform.reachability`), a carrying edge
-- (`custom.carrying_edges_of` arms 1a/1b/2a/2b/4 — every arm but the Table the record lives in),
-- or an assignment to a scope (`public._edu_can_read_via_assignment`). Everything else the ladder
-- reads — the organization's lanes and knobs, the Table's own grants and carrying, whether this
-- person is an admin, owns a record in the organization, or holds any grant anywhere — is the same
-- for every record that shares those columns. So two records with the same columns, the same own
-- memberships and NO other row naming either of them get the same answer at every rung, and the
-- ladder is asked once for the class.
--
-- A record that is NAMED by any such row, a row of the kernel Table (arm 4 of has_visibility
-- reads the Table's contents), a record with no Table, a record of a Confidential Table or with a
-- parent in its document (CHAIR-READPERF), an id that is not a record, and every record while
-- `record` has a registered FK containment parent (custom.visible_set's first stop) is asked on
-- its own, exactly as before. The class memo lives in this one call and nowhere else, so it can
-- never outlive the snapshot it was answered in.
--
-- SCOPES-HANDOFF-BUDGET (2026-09-28). An association that TARGETS the record names it only when it
-- is one of the carrying arms that read it from that side — arm 1a (an active association type
-- whose container is the SOURCE) and arm 2a (an active carrying rule of that role whose container
-- is the SOURCE) — exactly as the source-side test below has always matched arms 1b/2b/4. It used
-- to be ANY live association targeting the record, and every scope a transcript, an agent or a
-- workflow is tagged with carries a `context_tag` edge whose container is the scope itself (the
-- target side), so every scope of a type was walked on its own: 1,166 ladder walks for one type.
-- No other arm of the ladder reads an association that targets the record (visibility_ancestors
-- and addressed_cap read only custom.carrying_edges_of; has_access_for_base reads grants,
-- memberships and platform.reachability, each still a naming row here).
--
-- CHAIR-READPERF (2026-10-03). The person's OWN memberships on a record are part of its class key
-- (`mine` below: container_type/role/status of each live row, sorted), not a reason to walk it alone;
-- a scope names its members, and every scope of a type was a class of its own for a member of all
-- of them. `s` is read off the rung the halving found (null: viewer was asked and said no; viewer:
-- it was asked and said yes; above: the ladder is monotone, as the halving itself assumes).
declare
  v_out    jsonb := '{}'::jsonb;
  v_memo   jsonb := '{}'::jsonb;
  v_ks     text[] := array[]::text[];
  v_vs     jsonb[] := array[]::jsonb[];
  v_v      jsonb;
  v_fk     boolean;
  v_kernel uuid := custom.table_kernel_id();
  v_key    text;
  v_l      public.permission_level;
  v_s      boolean;
  r        record;
  -- PERF-FIX-1: a row named only by a portal's naming field is classed by WHERE it points
  v_t      uuid;
  v_tbl    uuid;
  v_ok     boolean;
  v_tmemo  jsonb := '{}'::jsonb;
  -- PERF-FIX-2: the rows in loop order, then one set ask for every row that needs the ladder
  v_a_id   uuid[] := '{}';  v_a_key text[] := '{}';  v_a_found boolean[] := '{}';  v_a_n bigint[] := '{}';  v_a_org uuid[] := '{}';
  v_seen   jsonb := '{}'::jsonb;
  v_need   uuid[] := '{}';
  v_lv     jsonb;
  i        integer;
begin
  if p_user_id is null or p_ids is null or cardinality(p_ids) = 0 then
    return v_out;
  end if;

  v_fk := exists (select 1 from platform.entity_relationships er
                   where er.child_type = 'record' and er.kind in ('composition', 'containment'));

  for r in
    select u.id, x.organization_id, x.table_id, x.visibility, x.deleted_at is null as live,
           x.created_by is not distinct from p_user_id as own, x.id is not null as found,
           count(*) over (partition by u.id) as n,
           -- a Confidential Table's row and a row with a parent answer from their own document
           (t.data ->> 'level' = 'confidential') is true
             or jsonb_typeof(x.data -> 'parent_id') = 'string' as alone,
           -- this person's own live memberships on it, the only ones the ladder reads (read once for
           -- the person, grouped, and joined: an aggregate run once per id cost 0.09 ms an id)
           mm.mine,
           ( exists (select 1 from iam.permissions p
                      where p.resource_type = 'record' and p.resource_id = u.id)
          or exists (select 1 from platform.entity_grants g
                      where g.entity_type = 'record' and g.entity_id = u.id)
          or exists (select 1 from platform.reachability rr
                      where rr.item_type = 'record' and rr.item_id = u.id)
          or exists (select 1 from platform.associations a
                      where a.deleted_at is null and a.target_type = 'record' and a.target_id = u.id
                        and ( exists (select 1 from platform.association_types t
                                       where t.source_type = a.source_type and t.target_type = a.target_type
                                         and (t.label is null or t.label = a.label)
                                         and t.is_active and t.container_side = 'source')
                           or exists (select 1 from custom.carrying_rule cr
                                       where cr.role = a.role and cr.is_active and cr.container_side = 'source')))
          or exists (select 1 from platform.associations a
                      where a.deleted_at is null and a.source_type = 'record' and a.source_id = u.id
                        and ( a.target_type = 'scope'
                           -- PERF-FIX-1: a naming field that DOES yield a portal edge (a record target, an active
                           -- portal) is no longer a reason to walk the row alone: it is part of the class key below
                           or a.relation_field_id is not null
                              and exists (select 1 from custom.portal_table pt where pt.names_via_field_id = a.relation_field_id)
                              and not (a.target_type = 'record'
                                       and exists (select 1 from custom.portal_table pt
                                                     join custom.portal p on p.id = pt.portal_id and p.is_active
                                                    where pt.names_via_field_id = a.relation_field_id))
                           or exists (select 1 from platform.association_types t
                                       where t.source_type = a.source_type and t.target_type = a.target_type
                                         and (t.label is null or t.label = a.label)
                                         and t.is_active and t.container_side = 'target')
                           or exists (select 1 from custom.carrying_rule cr
                                       where cr.role = a.role and cr.is_active and cr.container_side = 'target'))) ) as named,
           -- PERF-FIX-1: the portal edges custom.carrying_edges_of arm 4 would give this record, as a sorted
           -- signature (target id / what it conveys) and as the targets themselves
           (select string_agg(z.s, ',' order by z.s)
              from (select distinct a.target_id::text || '/' || pt.conveys_max::text as s
                      from platform.associations a
                      join custom.portal_table pt on pt.names_via_field_id = a.relation_field_id
                      join custom.portal p on p.id = pt.portal_id and p.is_active
                     where a.deleted_at is null and a.source_type = 'record' and a.source_id = u.id
                       and a.target_type = 'record') z) as portal_sig,
           (select array_agg(distinct a.target_id)
              from platform.associations a
              join custom.portal_table pt on pt.names_via_field_id = a.relation_field_id
              join custom.portal p on p.id = pt.portal_id and p.is_active
             where a.deleted_at is null and a.source_type = 'record' and a.source_id = u.id
               and a.target_type = 'record') as portal_targets
      from (select distinct unnest(p_ids) as id) u
      left join custom.record x on x.id = u.id
      left join custom.record t on t.organization_id = x.organization_id and t.id = x.table_id
      left join (select m.container_id,
                        string_agg(m.container_type || '/' || coalesce(m.role, '') || '/' || coalesce(m.status, ''), ','
                                   order by m.container_type, m.role, m.status) as mine
                   from iam.memberships m
                  where m.user_id = p_user_id and m.container_type in ('record', 'scope') and m.deleted_at is null
                  group by m.container_id) mm on mm.container_id = u.id
     where u.id is not null
  loop
    if not r.found or v_fk or r.table_id is null or r.table_id = v_kernel or r.named or r.alone then
      v_key := null;
    else
      v_key := r.organization_id::text || ':' || r.table_id::text || ':' || r.visibility::text || ':'
            || r.live::text || ':' || r.own::text || ':' || coalesce(r.mine, '');
      -- PERF-FIX-1: two records that point at the same portal targets, and differ in nothing else the
      -- ladder reads, have the same carriers and so the same answer - but only while each target is a
      -- TERMINAL container (its only carrying edge is the Table it lives in), so the walk above it is the
      -- same for both and no cycle back through the record itself can tell them apart. Any other target
      -- and the row is asked on its own, exactly as before.
      if r.portal_sig is not null then
        v_ok := true;
        foreach v_t in array r.portal_targets loop
          if not (v_tmemo ? v_t::text) then
            select t.table_id into v_tbl from custom.record t where t.id = v_t limit 1;
            v_tmemo := v_tmemo || jsonb_build_object(v_t::text,
              v_tbl is not null
              and not exists (select 1 from custom.carrying_edges_of('record', v_t) e
                               where e.container_type <> 'record' or e.container_id is distinct from v_tbl));
          end if;
          if not (v_tmemo ->> v_t::text)::boolean then
            v_ok := false;
            exit;
          end if;
        end loop;
        v_key := case when v_ok then v_key || ':' || r.portal_sig end;
      end if;
    end if;

    v_a_id := array_append(v_a_id, r.id);  v_a_key := array_append(v_a_key, v_key);
    v_a_found := array_append(v_a_found, r.found);  v_a_n := array_append(v_a_n, r.n);
    v_a_org := array_append(v_a_org, r.organization_id);
    if v_key is null or not (v_seen ? v_key) then
      v_need := array_append(v_need, r.id);
      if v_key is not null then
        v_seen := v_seen || jsonb_build_object(v_key, true);
      end if;
    end if;
  end loop;

  -- PERF-FIX-2: the rung of every row the memo below will not answer, in one set ask (the same halving
  -- per row, custom.effective_level_many); then the answers are laid out exactly as before.
  select coalesce(jsonb_object_agg(e.id::text, e.level), '{}'::jsonb) into v_lv
    from custom.effective_level_many(p_user_id, v_need) e;

  for i in 1 .. cardinality(v_a_id) loop
    v_key := v_a_key[i];
    if v_key is not null and v_memo ? v_key then
      v_ks := v_ks || v_a_id[i]::text;
      v_vs := v_vs || case when v_a_n[i] = 1 then (v_memo -> v_key) || jsonb_build_object('o', v_a_org[i])
                           else v_memo -> v_key end;
      continue;
    end if;

    v_l := (v_lv ->> v_a_id[i]::text)::public.permission_level;
    v_s := v_l is not null;
    v_v := jsonb_build_object('l', v_l, 's', v_s);
    v_ks := v_ks || v_a_id[i]::text;
    v_vs := v_vs || case when v_a_found[i] and v_a_n[i] = 1 then v_v || jsonb_build_object('o', v_a_org[i])
                         else v_v end;
    if v_key is not null then
      v_memo := v_memo || jsonb_build_object(v_key, v_v);
    end if;
  end loop;
  -- SCOPES-HANDOFF-BUDGET: the answers are gathered in two arrays and made one object at the end
  -- (appending to a jsonb object copies it whole, so a set of n ids cost n^2 bytes).
  select coalesce(jsonb_object_agg(k.k, k.v), '{}'::jsonb) into v_out
    from unnest(v_ks, v_vs) as k(k, v);
  return v_out;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.tables_seen_among(p_user_id uuid, p_organization_ids uuid[], p_among uuid[])
 RETURNS TABLE(organization_id uuid, id uuid, seen boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET plan_cache_mode TO 'force_generic_plan'
AS $function$
-- STORE-READ-PERF-5 (2026-09-30). THE TABLE WALK OF custom.tables_seen_once_per_group, AMONG NAMED TABLES.
--
-- The body of custom.tables_seen_once_per_group (STORE-READ-PERF-3: the one ladder's viewer answer
-- about each live Table, asked once per group of Tables it cannot tell apart — its header has the
-- argument), moved here unchanged except for one line: with p_among, only the live Tables of these
-- organizations whose ids are in p_among are walked (null: every live Table, which is how
-- tables_seen_once_per_group calls it). A Table's answer never depends on which other Tables are
-- walked beside it: its group key is its own columns and its own container's, every member of a
-- group answers alike, and arm 4 is asked per Table. It reads and writes NO memo — that stays
-- tables_seen_once_per_group's, which is the only caller that asks for every Table.
declare
  v_ceiling integer := custom.read_door_ladder_ceiling();
  v_solo    boolean;
  v_ids     uuid[];  v_orgs uuid[];  v_keys text[];
  v_prev_k  text;
  v_prev_v  boolean;
  v_left_id uuid[] := '{}';  v_left_org uuid[] := '{}';
  v_r_org   uuid[] := '{}';  v_r_id uuid[] := '{}';  v_r_seen boolean[] := '{}';
  v_i       integer;
  v_seen    boolean;
  v_cand    uuid;
  v_arm     record;
  v_one     jsonb;
  v_org     uuid;
  v_reps    jsonb;  -- PERF-FIX-2: the one viewer answer of each group's first Table, asked as one set
begin
  if p_organization_ids is null or cardinality(p_organization_ids) = 0 then
    return;
  end if;

  v_solo := p_user_id is null
         or exists (select 1 from platform.entity_relationships er
                     where er.child_type = 'record' and er.kind in ('composition', 'containment'))
         or platform.reference_gate_columns('record') is not null
         or platform.detail_parent_columns('record') is not null
         or platform.child_parent_columns('record') is not null
         or platform.row_class_column('record') is not null
         or platform.trash_is_owner_only('record')
         or exists (select 1 from platform.entity_types et
                     where et.token = 'record' and et.is_active and et.rls_variant = 'detail');

  with
  t as materialized (
    select x.id, x.organization_id as org, x.table_id,
           -- THE ROW'S OWN COLUMNS, every one but its id, its content and its clocks: a superset of
           -- the columns the ladder reads about a row, whatever they are called.
           (to_jsonb(x) - array['id','data','metadata','custom_fields','created_at','updated_at','updated_by','version','deleted_at']) as cols,
           -- custom.containment_parent raises on anything but one uuid; such a Table walks alone,
           -- so it raises exactly where it always did.
           (x.data -> 'parent_id' is null or jsonb_typeof(x.data -> 'parent_id') = 'null'
            or (jsonb_typeof(x.data -> 'parent_id') = 'string'
                and (x.data ->> 'parent_id') ~* '^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$')) as parent_ok
      from custom.record x
     where x.organization_id = any (p_organization_ids)
       and x.table_id = custom.table_kernel_id()
       and x.deleted_at is null
       and (p_among is null or x.id = any (p_among))
  ),
  tid as materialized (select array_agg(t.id) as v from t),
  te as materialized (
    select a.target_id as item, a.source_type as c_type, a.source_id as c_id, ty.conveys_max
      from platform.associations a
      join platform.association_types ty
        on ty.source_type = a.source_type and ty.target_type = a.target_type
       and (ty.label is null or ty.label = a.label)
     where a.deleted_at is null and ty.is_active and ty.container_side = 'source'
       and a.target_type = 'record' and a.target_id = any ((select tid.v from tid)::uuid[])
    union
    select a.source_id, a.target_type, a.target_id, ty.conveys_max
      from platform.associations a
      join platform.association_types ty
        on ty.source_type = a.source_type and ty.target_type = a.target_type
       and (ty.label is null or ty.label = a.label)
     where a.deleted_at is null and ty.is_active and ty.container_side = 'target'
       and a.source_type = 'record' and a.source_id = any ((select tid.v from tid)::uuid[])
    union
    select a.target_id, a.source_type, a.source_id, cr.conveys_max
      from platform.associations a
      join custom.carrying_rule cr on cr.role = a.role and cr.is_active
     where a.deleted_at is null and cr.container_side = 'source'
       and a.target_type = 'record' and a.target_id = any ((select tid.v from tid)::uuid[])
    union
    select a.source_id, a.target_type, a.target_id, cr.conveys_max
      from platform.associations a
      join custom.carrying_rule cr on cr.role = a.role and cr.is_active
     where a.deleted_at is null and cr.container_side = 'target'
       and a.source_type = 'record' and a.source_id = any ((select tid.v from tid)::uuid[])
    union
    select x.id, 'record'::text, x.table_id, 'admin'::public.permission_level
      from t x
      join custom.record tt on tt.id = x.table_id and tt.organization_id = x.org and tt.deleted_at is null
     -- (carrying_edges_of also asks the row's level here; leaving that out can only ADD an edge,
     -- and an edge to the row's own Table makes it walk alone below.)
     where x.table_id <> x.id
    union
    select a.source_id, 'record'::text, a.target_id, pt.conveys_max
      from platform.associations a
      join custom.portal_table pt on pt.names_via_field_id = a.relation_field_id
      join custom.portal p on p.id = pt.portal_id and p.is_active
     where a.deleted_at is null and a.source_type = 'record' and a.target_type = 'record'
       and a.source_id = any ((select tid.v from tid)::uuid[])
  ),
  cid as materialized (
    select array_agg(distinct te.c_id) as v from te where te.c_type = 'record'
  ),
  cx as materialized (
    select x.id, x.organization_id, x.table_id, x.deleted_at, (to_jsonb(x) - array['id','data','metadata','custom_fields','created_at','updated_at','updated_by','version','deleted_at']) as cols
      from custom.record x
     where x.id = any ((select cid.v from cid)::uuid[])
  ),
  ce as materialized (
    select a.target_id as item
      from platform.associations a
      join platform.association_types ty
        on ty.source_type = a.source_type and ty.target_type = a.target_type
       and (ty.label is null or ty.label = a.label)
     where a.deleted_at is null and ty.is_active and ty.container_side = 'source'
       and a.target_type = 'record' and a.target_id = any ((select cid.v from cid)::uuid[])
    union
    select a.source_id
      from platform.associations a
      join platform.association_types ty
        on ty.source_type = a.source_type and ty.target_type = a.target_type
       and (ty.label is null or ty.label = a.label)
     where a.deleted_at is null and ty.is_active and ty.container_side = 'target'
       and a.source_type = 'record' and a.source_id = any ((select cid.v from cid)::uuid[])
    union
    select a.target_id
      from platform.associations a
      join custom.carrying_rule cr on cr.role = a.role and cr.is_active
     where a.deleted_at is null and cr.container_side = 'source'
       and a.target_type = 'record' and a.target_id = any ((select cid.v from cid)::uuid[])
    union
    select a.source_id
      from platform.associations a
      join custom.carrying_rule cr on cr.role = a.role and cr.is_active
     where a.deleted_at is null and cr.container_side = 'target'
       and a.source_type = 'record' and a.source_id = any ((select cid.v from cid)::uuid[])
    union
    select x.id
      from cx x
      join custom.record tt on tt.id = x.table_id and tt.organization_id = x.organization_id and tt.deleted_at is null
     where x.table_id is not null and x.table_id <> x.id
       and x.deleted_at is null
    union
    select a.source_id
      from platform.associations a
      join custom.portal_table pt on pt.names_via_field_id = a.relation_field_id
      join custom.portal p on p.id = pt.portal_id and p.is_active
     where a.deleted_at is null and a.source_type = 'record' and a.target_type = 'record'
       and a.source_id = any ((select cid.v from cid)::uuid[])
  ),
  allid as materialized (
    select (select tid.v from tid) || coalesce((select cid.v from cid), '{}'::uuid[]) as v
  ),
  named as materialized (
    select p.resource_id as id from iam.permissions p
     where p.resource_type = 'record' and p.resource_id = any ((select allid.v from allid)::uuid[])
    union
    select m.container_id from iam.memberships m
     where m.container_type in ('record', 'scope') and m.container_id = any ((select allid.v from allid)::uuid[])
    union
    select g.entity_id from platform.entity_grants g
     where g.entity_type = 'record' and g.entity_id = any ((select allid.v from allid)::uuid[])
    union
    select rr.item_id from platform.reachability rr
     where rr.item_type = 'record' and rr.item_id = any ((select allid.v from allid)::uuid[])
    union
    select rr.container_id from platform.reachability rr
     where rr.container_type = 'record' and rr.container_id = any ((select allid.v from allid)::uuid[])
    union
    select a.source_id from platform.associations a
     where a.source_type = 'record' and a.source_id = any ((select allid.v from allid)::uuid[])
       and (a.target_type <> 'record' or a.relation_field_id is not null)
    union
    select a.target_id from platform.associations a
     where a.target_type = 'record' and a.target_id = any ((select allid.v from allid)::uuid[])
       and (a.source_type <> 'record' or a.relation_field_id is not null)
    union
    -- arm 3b's owned relation rows (custom.reaches_directly), found through the store's GIN index:
    -- every row that arm could match holds kind = owned.
    select nullif(rel.data ->> 'to', '')::uuid from custom.record rel
     where rel.organization_id = any (p_organization_ids)
       and rel.data @> '{"kind": "owned"}'::jsonb
       and rel.data ->> 'to' = any ((select tid.v from tid)::text[])
  ),
  cxa as materialized (
    select y.id, count(*) as n,
           (array_agg(jsonb_build_array(true, y.cols, y.deleted_at is null)))[1] as k
      from cx y
     group by y.id
  ),
  cattr as materialized (
    select c.c_id,
           coalesce(x.k, jsonb_build_array(false, null, null)) as k,
           coalesce(x.n, 0) as rows_with_id,
           (c.c_id in (select named.id from named) or c.c_id in (select ce.item from ce)) as unsimple
      from (select unnest((select cid.v from cid)::uuid[]) as c_id) c
      left join cxa x on x.id = c.c_id
  ),
  tdup as materialized (
    select d.id from custom.record d
     where d.id = any ((select tid.v from tid)::uuid[])
     group by d.id having count(*) > 1
  ),
  tagg as materialized (
    select te.item,
           -- more than one container: custom.addressed_cap_specific takes the FIRST container at the
           -- nearest depth, and two at one depth come out in an order their ids decide.
           (bool_or(te.c_type <> 'record' or ca.c_id is null or ca.unsimple or ca.rows_with_id <> 1
                    or te.c_id = te.item or te.c_id = t.table_id)
            or count(distinct (te.c_type, te.c_id)) > 1) as bad,
           jsonb_agg(jsonb_build_array(ca.k, te.conveys_max) order by jsonb_build_array(ca.k, te.conveys_max)::text) as sig
      from te
      join t on t.id = te.item
      left join cattr ca on ca.c_id = te.c_id and te.c_type = 'record'
     group by te.item
  ),
  keyed as materialized (
    select t.id, t.org,
           -- null: an id two rows carry (asked through custom.levels_of, which reads it the way the
           -- ladder does); ['alone', id]: walked on its own; otherwise the signature.
           case
             when t.id in (select tdup.id from tdup) then null
             when v_solo or t.id in (select named.id from named) or coalesce(g.bad, false) or not t.parent_ok
               then jsonb_build_array('alone', t.id)::text
             else jsonb_build_array(t.cols, coalesce(g.sig, '[]'::jsonb))::text
           end as key
      from t
      left join tagg g on g.item = t.id
  )
  select array_agg(k.id order by k.key nulls first, k.id), array_agg(k.org order by k.key nulls first, k.id),
         array_agg(k.key order by k.key nulls first, k.id)
    into v_ids, v_orgs, v_keys
    from keyed k;
  -- Sorted by signature: a signature's answer is the one just asked. A Table walked alone has a
  -- signature of its own. An id two rows carry is asked through custom.levels_of, all together.
  v_one := custom.levels_of(p_user_id,
             array(select v_ids[i] from generate_subscripts(v_ids, 1) i where v_keys[i] is null));
  -- PERF-FIX-2: each group's first Table (the one the loop below used to ask about on its own) is asked
  -- in one set call - the same custom.reaches_directly answer, through custom.reaches_directly_many.
  select coalesce(jsonb_object_agg(m.target::text, m.reaches), '{}'::jsonb) into v_reps
    from custom.reaches_directly_many(p_user_id,
           array(select v_ids[i] from generate_subscripts(v_ids, 1) i
                  where v_keys[i] is not null and (i = 1 or v_keys[i] is distinct from v_keys[i - 1])),
           'record', 'viewer'::public.permission_level) m;
  for v_i in 1 .. coalesce(cardinality(v_ids), 0) loop
    if v_keys[v_i] is null then
      v_r_org := v_r_org || v_orgs[v_i]; v_r_id := v_r_id || v_ids[v_i];
      v_r_seen := v_r_seen || coalesce((v_one -> v_ids[v_i]::text ->> 's')::boolean, false);
      continue;
    end if;
    if v_keys[v_i] is distinct from v_prev_k then
      v_prev_v := (v_reps ->> v_ids[v_i]::text)::boolean;
      v_prev_k := v_keys[v_i];
    end if;
    if v_prev_v then
      v_r_org := v_r_org || v_orgs[v_i]; v_r_id := v_r_id || v_ids[v_i]; v_r_seen := v_r_seen || true;
    else
      v_left_id := v_left_id || v_ids[v_i]; v_left_org := v_left_org || v_orgs[v_i];
    end if;
  end loop;

  if cardinality(v_left_id) > 0 then
    for v_arm in
      with l as materialized (select * from unnest(v_left_id, v_left_org) as l(id, org)),
      own as materialized (
        select distinct r.organization_id as org, r.table_id as id
          from custom.record r
         where (r.organization_id, r.table_id) in (select l.org, l.id from l)
           and r.deleted_at is null
           and r.created_by = p_user_id
      ),
      granted as materialized (
        select r.organization_id as org, r.table_id as tbl, array_agg(distinct r.id) as ids
          from (
            select p.resource_id as id from iam.permissions p where p.resource_type = 'record'
            union all select m.container_id from iam.memberships m where m.container_type = 'record'
            union all select g.entity_id from platform.entity_grants g where g.entity_type = 'record'
            union all select rr.item_id from platform.reachability rr where rr.item_type = 'record'
          ) h
          join custom.record r on r.id = h.id and r.deleted_at is null
           and (r.organization_id, r.table_id) in (select l.org, l.id from l)
         group by 1, 2
      ),
      ed as materialized (
        select o.org, e.container_type, e.container_id, e.item_id
          from (select distinct l.org from l) o
          cross join lateral custom.carrying_edges_in(o.org) e
         where e.item_type = 'record'
      ),
      carried as materialized (
        select r.organization_id as org, r.table_id as tbl, array_agg(distinct ed.item_id) as ids
          from ed
          join custom.record r on r.organization_id = ed.org and r.id = ed.item_id and r.deleted_at is null
         where (r.organization_id, r.table_id) in (select l.org, l.id from l)
           and not (ed.container_type = 'record' and ed.container_id = r.table_id)
         group by 1, 2
      )
      select l.id, l.org,
             exists (select 1 from own where own.org = l.org and own.id = l.id) as own,
             g.ids as g_ids, c.ids as c_ids
        from l
        left join granted g on g.org = l.org and g.tbl = l.id
        left join carried c on c.org = l.org and c.tbl = l.id
    loop
      v_seen := v_arm.own;
      if not v_seen and coalesce(cardinality(v_arm.c_ids), 0) > v_ceiling then
        -- more candidates than the function's own LIMIT: it chooses which; let it.
        v_seen := custom.table_has_a_visible_record(p_user_id, v_arm.org, v_arm.id);
      elsif not v_seen then
        if coalesce(cardinality(v_arm.g_ids), 0) <= v_ceiling then
          foreach v_cand in array coalesce(v_arm.g_ids, '{}'::uuid[]) loop
            if custom._seen_one(p_user_id, v_cand) then
              v_seen := true; exit;
            end if;
          end loop;
        end if;
        if not v_seen then
          foreach v_cand in array coalesce(v_arm.c_ids, '{}'::uuid[]) loop
            if custom._seen_one(p_user_id, v_cand) then
              v_seen := true; exit;
            end if;
          end loop;
        end if;
      end if;
      v_r_org := v_r_org || v_arm.org; v_r_id := v_r_id || v_arm.id; v_r_seen := v_r_seen || v_seen;
    end loop;
  end if;

  return query select u.org, u.id, u.seen from unnest(v_r_org, v_r_id, v_r_seen) as u(org, id, seen);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.data_home_tables(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(table_id uuid, table_name text, organization_id uuid, organization_name text, member boolean, visibility text, updated_at timestamp with time zone, mine boolean, shared_with_me boolean, kept_by_the_app boolean, kind text, team boolean, system boolean, created_by uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me     uuid := custom.query_principal();
  v_kernel uuid := custom.table_kernel_id();
begin
  -- THE DOOR DECIDES, FIRST, IN ITS OWN NAME (check:store-doors-decide, lane DATA-HOME-2): an
  -- organization named is one the caller may reach, or the call is refused here, naming this door
  -- — never an empty list that reads like "nothing there", and never a refusal from a door the
  -- person did not call. Named nobody, the walk below admits only organizations the caller
  -- reaches (the same custom.assert_client_may_reach arms: iam.has_org_access / portal_admits).
  if p_organization_id is not null then
    perform custom.assert_client_may_reach(p_organization_id, 'custom.data_home_tables');
  end if;
  if v_me is null then
    return;
  end if;

  -- STORE-READ-PERF-3 (2026-09-28): ONE WALK FOR EVERY ORGANIZATION. Ask which Tables she sees in
  -- all her organizations at once; the answer waits in this statement's memo, and each
  -- custom.query_visible_ids below (through custom.visible_set) reads its organization's part
  -- instead of walking the ladder again. It decides nothing: without it every answer is the same,
  -- only slower.
  -- DATA-HOME-2 (2026-09-29): an organization whose answer is already in THIS statement's memo is
  -- not walked again — custom.data_home asks once for the whole page and then calls this door.
  perform count(*)
     from custom.tables_seen_once_per_group(v_me, array(
            select m.organization_id
              from iam.organization_member m
              join iam.organizations o on o.id = m.organization_id and o.archived_at is null
             where m.user_id = v_me
               and (p_organization_id is null or m.organization_id = p_organization_id)
               -- PERF-FIX-2: the key the walk writes ends in the snapshot; without it this never matched
               and platform.memo_k_get('custom.tables_seen:' || v_me::text || ':' || m.organization_id::text
                                       || ':' || pg_catalog.pg_current_snapshot()::text) is null));


  return query
    with orgs as (
      select o.id, o.name::text as name, true as member
        from iam.organization_member m
        join iam.organizations o on o.id = m.organization_id and o.archived_at is null
       where m.user_id = v_me
      union
      select distinct o.id, o.name::text, false
        from iam.permissions g
        join custom.record t
          on t.id = g.resource_id
         and t.table_id = v_kernel
         and t.deleted_at is null
        join iam.organizations o on o.id = t.organization_id and o.archived_at is null
       where g.resource_type = 'record'
         and g.granted_to_user_id = v_me
         and g.status = 'active'
         and (g.expires_at is null or g.expires_at > now())
         and not exists (select 1 from iam.organization_member m2
                          where m2.organization_id = o.id and m2.user_id = v_me)
    ),
    admitted as materialized (
      select o.id, o.name, o.member
        from orgs o
       where (case when iam.has_org_access(o.id) then true else custom.portal_admits(o.id) end)
         and custom.store_is_open(o.id)
         -- THE ORGANIZATION FILTER, HONOURED HERE (lane DATA-HOME-2): one organization named,
         -- only its tables are walked, in every lane and kind; none named, every organization.
         -- A NARROWING only: an organization the walk would not admit stays unadmitted.
         and (p_organization_id is null or o.id = p_organization_id)
    ),
    visible as materialized (
      select a.id as org_id, v.v as id
        from admitted a
        cross join lateral custom.query_visible_ids(a.id, v_kernel) v
       where a.member
      union
      select a.id, g.resource_id
        from admitted a
        join iam.permissions g
          on g.resource_type = 'record'
         and g.granted_to_user_id = v_me
         and g.status = 'active'
         and (g.expires_at is null or g.expires_at > now())
       where not a.member
    ),
    options_ids as materialized (
      -- THE FIELD GRAPH, READ ONCE for every organization walked: which Tables a list column takes
      -- its choices from. custom.table_placement asks this per Table (an EXISTS over the Field
      -- kernel), which cost 21 s for a person in 46 organizations; asked once it is one scan.
      select distinct (f.data -> 'config' ->> 'options_table_id') as id
        from admitted a
        join custom.record f
          on f.organization_id = a.id
         and f.table_id = custom.field_kernel_id()
         and f.deleted_at is null
         and f.data ->> 'type' = 'list'
         and nullif(f.data -> 'config' ->> 'options_table_id', '') is not null
    ),
    team_reach as materialized (
      -- MY TEAM (lane DATA-HOME-2, 2026-09-30): (organization, person) pairs the signed-in person shares a
      -- live team with — iam.my_team_reach, the same answer every *_list_scoped RPC narrows My team by.
      select tr.organization_id, tr.user_id from iam.my_team_reach(null) tr
    ),
    granted as materialized (
      -- SHARED: a live grant on a Table naming the person, given by somebody else.
      select distinct g.resource_id as id
        from iam.permissions g
       where g.resource_type = 'record'
         and g.granted_to_user_id = v_me
         and g.status = 'active'
         and (g.expires_at is null or g.expires_at > now())
         and g.created_by is distinct from v_me
    )
    select t.id,
           coalesce(nullif(btrim(t.data ->> 'name'), ''), 'Untitled table'),
           a.id,
           a.name,
           a.member,
           t.visibility::text,
           t.updated_at,
           (t.created_by = v_me),
           (t.id in (select gr.id from granted gr)),
           coalesce((pl.p ->> 'kept_by_the_app')::boolean, false),
           -- THE KIND, from the store's own placement (custom.table_placement's kept_for): one word
           -- per thing a person would name. A table the app does not keep is a table.
           case
             when not coalesce((pl.p ->> 'kept_by_the_app')::boolean, false) then 'table'
             when pl.p ->> 'kept_for' = 'app' then
               case substring(coalesce(t.data ->> 'slug', '') from '^records_ui_([a-z]+)')
                 when 'form' then 'form'
                 when 'view' then 'view'
                 when 'comment' then 'comment'
                 when 'dashboard' then 'dashboard'
                 when 'action' then 'action'
                 when 'checklist' then 'checklist'
                 when 'slots' then 'booking'
                 when 'demo' then 'demo'
                 when 'shapeproof' then 'demo'
                 else 'list'
               end
             when pl.p ->> 'kept_for' = 'choices' then 'list'
             when pl.p ->> 'kept_for' = 'context' then 'scope'
             when pl.p ->> 'kept_for' = 'bookings' then 'booking'
             when pl.p ->> 'kept_for' = 'checklists' then 'checklist'
             when pl.p ->> 'kept_for' = 'workflow' then 'workflow'
             when pl.p ->> 'kept_for' = 'kits' then 'kit'
             when pl.p ->> 'kept_for' = 'store' then 'store'
             else coalesce(nullif(pl.p ->> 'kept_for', ''), 'app')
           end,
           -- MY TEAM: the Table's maker shares a live team with her in its organization.
           exists (select 1 from team_reach tr where tr.organization_id = a.id and tr.user_id = t.created_by),
           -- SYSTEM: the Table lives in an organization the platform itself keeps (iam.organizations.is_system).
           coalesce((select o2.is_system from iam.organizations o2 where o2.id = a.id), false),
           -- THE MAKER (lane DATA-HOME-2, 2026-09-30): the Table's own created_by, so a list outside the
           -- data home (the agent builder's picker) can run the shell's lanes on the same facts.
           t.created_by
      from admitted a
      join visible vis on vis.org_id = a.id
      join custom.record t
        on t.id = vis.id
       and t.organization_id = a.id
       and t.table_id = v_kernel
       and t.deleted_at is null
      cross join lateral (
        -- custom.table_placement's rule, word for word, with its one Field-graph question answered
        -- from options_ids above instead of per row: kept when the store derives a keeper word, or
        -- the document says kept_by_the_app / kept_for; kept_for = the stored word, else the
        -- derived one, else 'app'.
        select jsonb_build_object(
                 'kept_by_the_app', d.kept,
                 'kept_for', case when d.kept then coalesce(nullif(btrim(t.data ->> 'kept_for'), ''), d.word, 'app') end) as p
          from (select w.word,
                       (w.word is not null
                        or coalesce(t.data ->> 'kept_by_the_app', '') = 'true'
                        or coalesce(btrim(t.data ->> 'kept_for'), '') <> '') as kept
                  from (select custom.table_kept_for_derived(
                                 t.data, t.data_class = 'kernel',
                                 case when t.data_class = 'kernel' then false
                                      else exists (select 1 from options_ids o where o.id = t.id::text) end) as word offset 0) w) d offset 0
      ) pl
     -- APP TABLES WAIT BEHIND ONE SWITCH (lane CHAIR-DOORS-2, v6 N-C8): a Table the app keeps out of every
     -- default list (custom.table_kept_out_of_lists on its placement word) is listed only when the caller
     -- asks with p_include_app_tables. Every other Table the app keeps (lists, scopes, forms …) is unchanged.
     -- The switch travels as the transaction-local setting custom.include_app_tables, which only the
     -- two-argument overload sets (and puts back); unset, the Table stays out.
     where current_setting('custom.include_app_tables', true) is not distinct from 'on'
        or not custom.table_kept_out_of_lists(pl.p ->> 'kept_for');
end;
$function$;

CREATE OR REPLACE FUNCTION custom.data_home_changed_by(p_asks jsonb)
 RETURNS TABLE(organization_id uuid, id uuid, at timestamp with time zone, who text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_ask jsonb;
  v_org uuid;
begin
  -- WHO CHANGED EACH ROW, FOR EVERY ORGANIZATION THE HOME SHOWS, IN ONE CALL (lane DATA-HOME-2).
  -- p_asks = [{"organization_id": …, "kind": "structure"|"form"|"portal", "ids": [...]}, …].
  -- Each organization is decided HERE, in this door's own name, before custom.hub_changed_by —
  -- the store's own answer — is asked about it.
  if p_asks is null or jsonb_typeof(p_asks) <> 'array' then
    raise exception 'custom.data_home_changed_by takes a list of asks, one per organization and kind'
      using errcode = '22023',
            hint = 'Send [{"organization_id": "<uuid>", "kind": "structure", "ids": ["<uuid>", ...]}].';
  end if;
  if jsonb_array_length(p_asks) > 200 then
    raise exception 'custom.data_home_changed_by was asked % things at once', jsonb_array_length(p_asks)
      using errcode = '54000', hint = 'Ask about at most 200 (organization, kind) pairs at a time.';
  end if;
  -- STORE-READ-PERF-3 (2026-09-28): one walk for every organization asked (see
  -- custom.tables_seen_once_per_group); each custom.hub_changed_by below reads its organization's
  -- part from this statement's memo. It decides nothing: every organization is still decided in
  -- this door's name below, and without it every answer is the same, only slower.
  -- DATA-HOME-2 (2026-09-29): an organization whose answer is already in THIS statement's memo is
  -- not walked again — custom.data_home asks once for the whole page and then calls this door.
  perform count(*)
     from custom.tables_seen_once_per_group(custom.query_principal(), array(
            select distinct (e ->> 'organization_id')::uuid
              from jsonb_array_elements(p_asks) e
             where e ->> 'kind' in ('structure', 'form', 'portal')
               and (e ->> 'organization_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
               and exists (select 1 from iam.organization_member m
                            where m.organization_id = (e ->> 'organization_id')::uuid
                              and m.user_id = custom.query_principal())
               -- PERF-FIX-2: the key the walk writes ends in the snapshot; without it this never matched
               and platform.memo_k_get('custom.tables_seen:' || custom.query_principal()::text || ':'
                                       || (e ->> 'organization_id') || ':' || pg_catalog.pg_current_snapshot()::text) is null));
  for v_ask in select * from jsonb_array_elements(p_asks) loop
    v_org := (v_ask ->> 'organization_id')::uuid;
    perform custom.assert_client_may_reach(v_org, 'custom.data_home_changed_by');
    return query
      select v_org, c.id, c.at, c.who
        from custom.hub_changed_by(
               v_org,
               v_ask ->> 'kind',
               array(select (e #>> '{}')::uuid from jsonb_array_elements(coalesce(v_ask -> 'ids', '[]'::jsonb)) e)) c;
  end loop;
end;
$function$;
