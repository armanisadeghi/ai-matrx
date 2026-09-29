-- chair-step: it REPLACES the bodies of nine functions — custom.carrying_edges_in, custom.read_door_granted_ids, custom.visible_set, custom.tables_seen_once_per_group, custom.query_visible_ids, custom.hub_changed_by, custom.context_tree, custom.context_items and custom.context_values. Same signatures, grants and door rows; nothing is created, dropped or granted; no table, policy or data row is touched. Nothing a person sees changes: the scope tree and the data home ask the one ladder once per group of Tables it cannot tell apart, the field decision once per group of Fields, the Table list once for all organizations of a statement, and two organization-level helpers answer once per read-only statement.
-- lane: STORE-READ-PERF-4
-- based-on: custom.carrying_edges_in(uuid) cd27c63180613bd2ae8753f7fff085ce1131e6b1e5ec8ac3d38342b3574565ac
-- based-on: custom.read_door_granted_ids(uuid, uuid) 2a53a26445d59263ef8c3a73588b917ad4839f2d6f5db7d2588bb8ad10141c96
-- based-on: custom.visible_set(uuid, uuid, uuid, permission_level) f28f60d9687454798ece8064f6392de282349c6f2d02b8552055cc6828a09972
-- based-on: custom.tables_seen_once_per_group(uuid, uuid[]) 9b3f8f63038eb32afcdafc16c8ab3cd0179ff91a1ee8bd86e526b62376739290
-- based-on: custom.query_visible_ids(uuid, uuid, text) a0dd645a3d8a75beaf004d4fcc0a004e05d2dd53459855ac73a3bb207f335ed4
-- based-on: custom.hub_changed_by(uuid, text, uuid[]) 6b2ad23478f43d94c8e9a86ffab7b49402eabf262d0c117375a074f981674c93
-- based-on: custom.context_tree(uuid[]) c350da227b487bea14bd8266f5267ffb704cab8e50928fc535720ad094e7e279
-- based-on: custom.context_items(uuid[]) 86e0ee94a2d2c47fd72303387bb4557e8e1da7765428764f1c298b20044d4ae4
-- based-on: custom.context_values(uuid[]) 304da492827dc53fb9191d46ca05ac0d463a8beb193ee457e94b172e714fcd2d
--
-- STORE-READ-PERF-4 — THE SCOPE TREE AND THE DATA HOME ASK SHARED ANSWERS.
--
-- THE PROBLEM (dev clone, 2026-09-29, warm): custom.context_tree (L10, the scope screens' tree)
-- costs ~1.0 s for admin@admin.com (47 organizations, 44 scope types in 8 of them, 2,421 scopes) and
-- ~0.32 s for test@test.com, against 26 ms for the old read. Per call: custom.query_visible_ids over
-- the Table kernel once per organization (each a full Table walk), custom.visible_set's per-Table
-- setup for each of the 44 scope Tables — custom.carrying_edges_in(org) and
-- custom.read_door_granted_ids (a union over every grant) asked again for every Table although both
-- answer for the organization — and iam.may_touch_field once per column Field (184).
--
-- THE FIX:
--   1. custom.carrying_edges_in(org) and custom.read_door_granted_ids(org, table) answer from the
--      STATEMENT memo (platform.memo_k_*) after the first ask of a statement — the granted ids
--      worked out for every Table of the organization in one pass. The memo key names the statement
--      snapshot as well, and the memo is used ONLY while the transaction has written nothing (a
--      writing transaction asks every time, exactly as before). The same two fences are added to
--      STORE-READ-PERF-3's memos (custom.visible_set's reads, custom.tables_seen_once_per_group's
--      writes): plan-attack 2026-09-29 showed a volatile caller's later statements could otherwise
--      read an answer an earlier snapshot gave.
--   2. custom.context_tree, custom.context_items and custom.context_values ask
--      custom.tables_seen_once_per_group once for every organization they walk, so each
--      custom.query_visible_ids(org, Table kernel) reads the memo.
--   3. custom.context_tree asks iam.may_touch_field once per (organization, sensitivity) for the
--      Fields that answer alike — no grant row names the Field, it is not a formula, and the caller is
--      no portal principal of the organization; every other Field, and every second ask at the
--      caller's own level, is asked on its own. It reads the scope Tables' Fields and Records in one
--      pass each instead of per Table / per id.
--   4. custom.query_visible_ids(org, Table kernel, viewer): when custom.tables_seen_once_per_group has
--      named the statement's organizations, the first call works out this function's own answer —
--      the same visible_set per organization, the same filters and branches — for all of them in
--      one pass and memoizes each; custom.tables_seen_once_per_group answers a repeated ask of the
--      same statement from its memo. (The data home, one call since DATA-HOME-2, primed four times.)
--   5. custom.hub_changed_by: the structure arm answers every non-Table id through ONE
--      custom.levels_of call (its viewer answer is custom.has_visibility's, once per class), asks
--      the store-owner question once, and works out history_people once per call (MATERIALIZED).
--
-- The nine bodies never name the row level column (access ladder T-13's guard); custom.visible_set
-- was already on T-13's reader list, unchanged in identity.
--
-- Guard: matrx-frontend/scripts/campaign-tests/storereadperf4_green.sql (same answers),
--        storereadperf4_memo.sql (memo path = no-memo path), storereadperf4_timing.sql (budgets)
-- Inverse: migrations/inverse/storereadperf4_the_scope_tree_and_the_data_home_ask_shared_answers_down.sql

CREATE OR REPLACE FUNCTION custom.carrying_edges_in(p_organization_id uuid)
 RETURNS TABLE(container_type text, container_id uuid, item_type text, item_id uuid, conveys_max permission_level)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- THE CARRYING EDGES OF ONE ORGANIZATION THAT A RECORD WALK CAN USE (CARRYING-EDGES-PERF,
-- 2026-09-27): every edge whose item is a record, or is a container on some path down to a record.
-- An edge whose item can never lead to a record is left out — both callers walk to records only,
-- so no answer of theirs can depend on it. See the campaign file for the argument.
declare
  -- STORE-READ-PERF-4 (2026-09-29): THE SAME EDGES, ASKED ONCE PER ORGANIZATION PER READ-ONLY
  -- STATEMENT. The context tree and the data home ask this for every Table of an organization
  -- (custom.visible_set -> custom.read_door_carried_ids), and the answer is the organization's, not
  -- the Table's. It is kept in the statement memo (platform.memo_k_*: fenced by the statement,
  -- backend, seat and snapshot) and ONLY while the transaction has written nothing — a transaction that
  -- writes (and could add or remove an edge) asks every time, exactly as before.
  v_ro   boolean := pg_catalog.pg_current_xact_id_if_assigned() is null and p_organization_id is not null;
  -- The key names the SNAPSHOT too: a volatile caller running many statements in one client statement
  -- (each with its own snapshot under READ COMMITTED) never reads an answer an older snapshot gave.
  v_key  text := 'custom.carrying_edges_in:' || coalesce(p_organization_id::text, '-') || ':' || pg_catalog.pg_current_snapshot()::text;
  v_m    text;
  v_ct   text[];  v_ci uuid[];  v_it text[];  v_ii uuid[];  v_cm public.permission_level[];
begin
  if v_ro then
    v_m := platform.memo_k_get(v_key);
    if v_m is not null then
      return query
        select u.ct, u.ci, u.it, u.ii, u.cm
          from jsonb_to_recordset(v_m::jsonb)
            as u(ct text, ci uuid, it text, ii uuid, cm public.permission_level);
      return;
    end if;
  end if;

  select array_agg(q.ct), array_agg(q.ci), array_agg(q.it), array_agg(q.ii), array_agg(q.cm)
    into v_ct, v_ci, v_it, v_ii, v_cm
    from (
    with recursive
    -- arm 2's edges, once: the rule is a ROLE, so the types are the rows' own
    e2 as materialized (
      select case when cr.container_side = 'source' then a.source_type else a.target_type end as c_type,
             case when cr.container_side = 'source' then a.source_id   else a.target_id   end as c_id,
             case when cr.container_side = 'source' then a.target_type else a.source_type end as i_type,
             case when cr.container_side = 'source' then a.target_id   else a.source_id   end as i_id,
             cr.conveys_max as c_max
        from custom.carrying_rule cr
        -- one index probe per rule (idx_assoc_org_role_live), the organization's rows and the
        -- organization-less ones; never the organization's whole association set
        cross join lateral (
          select x.source_type, x.source_id, x.target_type, x.target_id
            from platform.associations x
           where x.organization_id = p_organization_id and x.role = cr.role and x.deleted_at is null
          union all
          select x.source_type, x.source_id, x.target_type, x.target_id
            from platform.associations x
           where x.organization_id is null and x.role = cr.role and x.deleted_at is null
        ) a
       where cr.is_active
    ),
    -- arm 1's rules, with the side each one names as the container
    r1 as materialized (
      select r.source_type, r.target_type, r.label, r.container_side, r.conveys_max,
             case when r.container_side = 'source' then r.source_type else r.target_type end as ct,
             case when r.container_side = 'source' then r.target_type else r.source_type end as it
        from platform.association_types r
       where r.is_active
         and r.container_side = any (array['source', 'target'])
    ),
    pairs as (
      select r1.ct, r1.it from r1
      union
      select e2.c_type, e2.i_type from e2
    ),
    -- the types that are a record, or can contain one at any depth
    reach (t) as (
      select 'record'::text
      union
      select p.ct from pairs p join reach on p.it = reach.t
    )
    -- arm 1 — platform.containment_edges, from the rules whose item can lead to a record
    select case when r.container_side = 'source' then a.source_type else a.target_type end,
           case when r.container_side = 'source' then a.source_id   else a.target_id   end,
           case when r.container_side = 'source' then a.target_type else a.source_type end,
           case when r.container_side = 'source' then a.target_id   else a.source_id   end,
           r.conveys_max
      from r1 r
      -- one index probe per rule (idx_assoc_org_pair_live), and only for a rule whose item can
      -- lead to a record
      cross join lateral (
        select x.source_type, x.source_id, x.target_type, x.target_id
          from platform.associations x
         where x.organization_id = p_organization_id
           and x.source_type = r.source_type and x.target_type = r.target_type
           and (r.label is null or r.label = x.label) and x.deleted_at is null
        union all
        select x.source_type, x.source_id, x.target_type, x.target_id
          from platform.associations x
         where x.organization_id is null
           and x.source_type = r.source_type and x.target_type = r.target_type
           and (r.label is null or r.label = x.label) and x.deleted_at is null
      ) a
     where r.it in (select reach.t from reach)
    union
    -- arm 2 — the custom.carrying_rule arm of custom.carrying_edges
    select e2.c_type, e2.c_id, e2.i_type, e2.i_id, e2.c_max
      from e2
     where e2.i_type in (select reach.t from reach)
    union
    -- arm 3 — A PORTAL'S NAMING FIELD (PORTAL, 2026-09-20). The record the Field points at is
    -- the container; the record holding the Field is the item. This is what makes "only theirs"
    -- answerable without a per-portal query: an outsider holding her own client record reaches
    -- exactly the records that name it, at the level the portal declared, through the same
    -- ladder as everything else on this platform.
    select 'record'::text, a.target_id, 'record'::text, a.source_id, pt.conveys_max
      from platform.associations a
      join custom.portal_table pt on pt.names_via_field_id = a.relation_field_id
      join custom.portal p on p.id = pt.portal_id and p.is_active
     where a.deleted_at is null
       and a.organization_id = p_organization_id
       and pt.organization_id = p_organization_id
       and a.source_type = 'record'
       and a.target_type = 'record'
    ) q(ct, ci, it, ii, cm);

  if v_ro then
    perform platform.memo_k_put(v_key,
      coalesce((select jsonb_agg(jsonb_build_object('ct', u.ct, 'ci', u.ci, 'it', u.it, 'ii', u.ii, 'cm', u.cm))
                  from unnest(v_ct, v_ci, v_it, v_ii, v_cm) as u(ct, ci, it, ii, cm)), '[]'::jsonb)::text);
  end if;
  return query select u.ct, u.ci, u.it, u.ii, u.cm from unnest(v_ct, v_ci, v_it, v_ii, v_cm) as u(ct, ci, it, ii, cm);
end
$function$;

CREATE OR REPLACE FUNCTION custom.read_door_granted_ids(p_organization_id uuid, p_table_id uuid)
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- The ids of this organization's live records (of p_table_id, or of every Table when it is null)
-- that something ADDRESSES: a grant on the record, a membership held on the record, a library grant,
-- a closure row. Sorted, each once.
--
-- STORE-READ-PERF-4 (2026-09-29): THE SAME IDS, WORKED OUT ONCE PER ORGANIZATION PER READ-ONLY
-- STATEMENT. custom.visible_set asks this once per Table, and the context tree and the data home
-- walk every Table of an organization: the answer for all of them is one pass, kept in the
-- statement memo (platform.memo_k_*: fenced by the statement, backend, seat and snapshot) and ONLY while the
-- transaction has written nothing — a transaction that writes asks every time, exactly as before.
declare
  v_ro  boolean := pg_catalog.pg_current_xact_id_if_assigned() is null and p_organization_id is not null;
  v_key text := 'custom.granted_ids:' || coalesce(p_organization_id::text, '-') || ':' || pg_catalog.pg_current_snapshot()::text;  -- (the snapshot: see custom.carrying_edges_in)
  v_m   jsonb;
begin
  if not v_ro then
    return (
      select coalesce(array_agg(distinct r.id), '{}'::uuid[])
        from (
          -- a grant on the record (public.has_permission_for, iam.granted_level, iam.grant_addressed_level)
          select p.resource_id as id from iam.permissions p where p.resource_type = 'record'
          union all
          -- a membership held ON the record itself
          select m.container_id from iam.memberships m where m.container_type = 'record'
          -- the open library (public.user_can_read_via_library_grant, public.library_is_open)
          union all
          select g.entity_id from platform.entity_grants g where g.entity_type = 'record'
          -- the platform closure the access kernel pushes onto its own frontier
          union all
          select rr.item_id from platform.reachability rr where rr.item_type = 'record'
        ) h
        join custom.record r
          on r.organization_id = p_organization_id
         and r.id = h.id
         and r.deleted_at is null
         and (p_table_id is null or r.table_id is not distinct from p_table_id)
    );
  end if;

  v_m := nullif(platform.memo_k_get(v_key), '')::jsonb;
  if v_m is null then
    select coalesce(jsonb_object_agg(z.tbl, z.ids), '{}'::jsonb) into v_m
      from (
        select coalesce(r.table_id::text, '-') as tbl, jsonb_agg(distinct r.id) as ids
          from (
            select p.resource_id as id from iam.permissions p where p.resource_type = 'record'
            union all
            select m.container_id from iam.memberships m where m.container_type = 'record'
            union all
            select g.entity_id from platform.entity_grants g where g.entity_type = 'record'
            union all
            select rr.item_id from platform.reachability rr where rr.item_type = 'record'
          ) h
          join custom.record r
            on r.organization_id = p_organization_id
           and r.id = h.id
           and r.deleted_at is null
         group by 1
      ) z;
    perform platform.memo_k_put(v_key, v_m::text);
  end if;

  if p_table_id is null then
    return array(select distinct e::uuid from jsonb_each(v_m) t, jsonb_array_elements_text(t.value) e order by 1);
  end if;
  return array(select e::uuid from jsonb_array_elements_text(coalesce(v_m -> p_table_id::text, '[]'::jsonb)) e order by 1);
end
$function$;

CREATE OR REPLACE FUNCTION custom.visible_set(p_user uuid, p_organization_id uuid, p_table_id uuid, p_required permission_level DEFAULT 'viewer'::permission_level, OUT o_all_visible boolean, OUT o_true_visibility platform.visibility[], OUT o_granted_all uuid[], OUT o_granted_visible uuid[], OUT o_carried_visible uuid[], OUT o_ladder_calls integer, OUT o_fallback boolean, OUT o_note text)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_label   text;
  v_vis     platform.visibility;
  v_rep     uuid;
  v_id      uuid;
  v_n       integer;
  v_window  integer;
  v_carried record;
  -- SHARED-ONLY (2026-09-19): does the caller reach the TABLE itself at this level? Asked
  -- ONCE, before anything else, because it answers for every row at once.
  v_table_carries boolean := false;
  v_tables        integer;
  v_seen_memo     text;   -- STORE-READ-PERF-3
begin
  o_all_visible     := false;
  o_true_visibility := '{}'::platform.visibility[];
  o_granted_all     := '{}'::uuid[];
  o_granted_visible := '{}'::uuid[];
  o_carried_visible := '{}'::uuid[];
  o_ladder_calls    := 0;
  o_fallback        := false;
  o_note            := null;

  if p_user is null or p_organization_id is null then
    o_fallback := true;
    o_note := 'READ-PERF: no principal, so the set-based shape has nobody to answer for. The door is walking the per-row ladder, which is what it did before this file.';
    return;
  end if;

  -- THE FOURTH THING THAT MAKES IT STOP (SHARED-ONLY). With no Table named, the answer spans
  -- the kernel Table as well as every ordinary one, and a Table is no longer a member of a
  -- visibility CLASS — it is visible when something inside it is (arm 4 of the one ladder),
  -- so two Tables of one class answer differently and no representative can speak for them.
  if p_table_id is null then
    o_fallback := true;
    o_note := 'SHARED-ONLY: no Table was named, so this answer spans the kernel Table, whose rows '
           || 'are Tables — and a Table is visible when a record inside it is, which is not a '
           || 'property of its visibility class. The door is walking the per-row ladder. REMEDY: '
           || 'name the Table, or give custom.visible_set a per-Table carry list the way '
           || 'custom.visible_predicate_sql would need to emit `table_id = any(...)`.';
    return;
  end if;

  -- THE FIRST THING THAT MAKES IT STOP. `iam.has_access_for_base` pushes a child's REGISTERED
  -- FK parents onto its frontier as well as the closure. There is no such registration for
  -- `record` today, so a record's containers come only from associations — which
  -- `custom.read_door_carried_ids` resolves. If one is ever registered, a row's container is a
  -- COLUMN of its own row, two rows of one class stop answering alike, and the argument this
  -- file rests on stops holding. So it says so and walks.
  if exists (select 1 from platform.entity_relationships er
              where er.child_type = 'record' and er.kind in ('composition', 'containment')) then
    o_fallback := true;
    o_note := 'READ-PERF: `record` now has a registered FK containment parent in '
           || 'platform.entity_relationships, so a row''s container is a column of its own row and '
           || 'two rows of one visibility class no longer answer alike. The door is walking the '
           || 'per-row ladder. REMEDY: teach custom.visible_set to classify on that column too, or '
           || 'seed custom.read_door_carried_ids from it the way it is seeded from associations.';
    return;
  end if;

  -- THE TABLE ITSELF, ONCE (SHARED-ONLY). A Table shared with somebody carries every row in it
  -- (arm 3 of `custom.carrying_edges_of`), so one ladder call about the TABLE answers for the
  -- whole page.
  --
  -- 🚨 AND THE QUESTION IS `iam.has_access_for`, NOT `custom.reaches_directly` (LEAK-T10,
  -- 2026-09-20). This is the whole of acceptance test 10 and it is a live cross-project leak.
  -- `custom.reaches_directly` treats the Table as the SUBJECT of the walk, so its arm 3 climbs
  -- from the Table into the Table's own HOMES — and a person shared ONE Home of a Table was
  -- handed every record of that Table in every other Home, with its contents, by this line,
  -- while `custom.read_record` refused her the same row.
  --
  -- What the PER-ROW ladder asks about this Table is one thing, and asking exactly it is what
  -- makes the two doors agree by construction instead of by agreement:
  -- `custom.visibility_ancestors` returns the Table as a TERMINAL ancestor of every row in it,
  -- at `admin`, and `custom.reaches_directly` arm 3 then asks
  -- `iam.has_access_for(user, 'record', <the Table>, required)` about it — ownership, a grant
  -- row, the organization lanes, the platform's own containment closure, and nothing above
  -- them. A whole Table shared through `custom.share_grant` writes the `iam.permissions` row
  -- that admits it, so the case this shortcut exists for is untouched.
  --
  -- The rows it does NOT speak for are the ones whose own `visibility` is below `internal`,
  -- which that edge deliberately does not carry; they fall through to their class below.
  --
  -- THE SAME-ORGANISATION, LIVE-ROW JOIN STAYS. The kernel Tables (`Table`, `Field`, and the
  -- home-record kernel every fixture hangs off) live in the SYSTEM organization, which is
  -- global_readable, so `iam.has_access_for` says yes about them to EVERY signed-in person.
  -- Without this line `p_table_id = 11111111-…-0002` — the Field kernel — made every Field row
  -- of a `shared_only` organization visible to every member.
  if p_table_id is distinct from custom.table_kernel_id()
     and exists (select 1 from custom.record t
                  where t.organization_id = p_organization_id
                    and t.id = p_table_id
                    and t.deleted_at is null) then
    o_ladder_calls := o_ladder_calls + 1;
    v_table_carries := custom.table_carries_its_rows(p_user, p_table_id, p_required);
  end if;

  -- THE GRANTED IDS, and the second thing that makes it stop.
  -- STORE-READ-PERF-3: for the Table kernel, the same ids may already be in this statement's memo,
  -- left by custom.tables_seen_once_per_group, which asked read_door_granted_ids' own query once for
  -- every organization of the door statement that called us.
  -- STORE-READ-PERF-4: only while the transaction has written nothing (a writing transaction may
  -- have changed the answer after the memo was taken).
  if p_table_id = custom.table_kernel_id() and pg_catalog.pg_current_xact_id_if_assigned() is null then
    v_seen_memo := platform.memo_k_get('custom.kernel_granted:' || p_organization_id::text || ':' || pg_catalog.pg_current_snapshot()::text);
  end if;
  if v_seen_memo is not null then
    o_granted_all := array(select g from unnest(string_to_array(nullif(v_seen_memo, ''), ',')::uuid[]) g order by g);
    v_seen_memo := null;
  else
    o_granted_all := custom.read_door_granted_ids(p_organization_id, p_table_id);
  end if;
  v_n := coalesce(array_length(o_granted_all, 1), 0);
  if v_n > custom.read_door_ladder_ceiling() then
    o_fallback := true;
    o_note := format('READ-PERF: %s ids of this Table carry a grant, a membership or a closure row, '
                  || 'which is over the ceiling of %s, so asking them one at a time is no cheaper '
                  || 'than the walk this replaces. The door is walking the per-row ladder. REMEDY: '
                  || 'raise custom.read_door_ladder_ceiling(), or resolve grants set-based the way '
                  || 'custom.read_door_carried_ids resolves containment.',
                  v_n, custom.read_door_ladder_ceiling());
    return;
  end if;

  -- THE TABLE LIST (SHARED-ONLY). The rows of the kernel Table are the organization's Tables,
  -- and a Table is visible when a record inside it is — one Table at a time, never by class.
  -- An organization holds a few hundred Tables at the very most (263 is the largest on this
  -- database today, against a ceiling of 5,000), so this enumerates them and asks the ladder
  -- once each. Over the ceiling it says so and walks, like every other stop here.
  if p_table_id = custom.table_kernel_id() then
    select count(*) into v_tables
      from custom.record r
     where r.organization_id = p_organization_id
       and r.table_id = custom.table_kernel_id()
       and r.deleted_at is null;
    if v_tables > custom.read_door_ladder_ceiling() then
      o_fallback := true;
      o_note := format('SHARED-ONLY: this organization holds %s Tables, over the ceiling of %s, and a '
                    || 'Table is visible when a record inside it is - which no representative can '
                    || 'answer for. The door is walking the per-row ladder. REMEDY: raise '
                    || 'custom.read_door_ladder_ceiling(), or index the "does this Table hold a row '
                    || 'this person reaches" question the way custom.visibility_cache intends.',
                    v_tables, custom.read_door_ladder_ceiling());
      return;
    end if;
    -- STORE-READ-PERF-3 (2026-09-28). At viewer the same answer — custom.has_visibility about every
    -- live Table — comes from custom.tables_seen_once_per_group: the one ladder asked once per group
    -- of Tables it cannot tell apart (its header has the argument), or, when the door statement
    -- that called us already asked it for this person and organization, from that statement's memo.
    -- Any other level walks every Table as before. o_ladder_calls still counts one answer per Table.
    if p_required = 'viewer'::public.permission_level then
      v_seen_memo := case when pg_catalog.pg_current_xact_id_if_assigned() is null
                          then platform.memo_k_get('custom.tables_seen:' || p_user::text || ':' || p_organization_id::text
                                                   || ':' || pg_catalog.pg_current_snapshot()::text) end;
      if v_seen_memo is null then
        select coalesce(array_agg(g.id) filter (where g.seen), '{}'::uuid[])
          into o_carried_visible
          from custom.tables_seen_once_per_group(p_user, array[p_organization_id]) g;
      else
        o_carried_visible := coalesce(string_to_array(nullif(v_seen_memo, ''), ',')::uuid[], '{}'::uuid[]);
      end if;
      o_ladder_calls := o_ladder_calls + v_tables;
    else
      for v_id in
        select r.id
          from custom.record r
         where r.organization_id = p_organization_id
           and r.table_id = custom.table_kernel_id()
           and r.deleted_at is null
      loop
        o_ladder_calls := o_ladder_calls + 1;
        if custom.has_visibility(p_user, 'record', v_id, p_required) then
          o_carried_visible := o_carried_visible || v_id;
        end if;
      end loop;
    end if;
    o_all_visible := (v_tables = coalesce(array_length(o_carried_visible, 1), 0));
    return;
  end if;

  -- CONTAINMENT, ONCE, DOWNWARD — and the third thing that makes it stop.
  v_carried := custom.read_door_carried_ids(p_user, p_organization_id, p_table_id, p_required);
  o_ladder_calls := o_ladder_calls + coalesce(v_carried.o_containers, 0);
  if v_carried.o_ids is null then
    o_fallback := true;
    o_note := format('READ-PERF: this Table''s records sit under %s distinct containers, which is '
                  || 'over the ceiling of %s, so asking the ladder about each of them is no cheaper '
                  || 'than the walk this replaces. The door is walking the per-row ladder. REMEDY: '
                  || 'raise custom.read_door_ladder_ceiling(), or give the containers an accessible-set '
                  || 'cache the way VIS-9''s epochs intend.',
                  v_carried.o_containers, custom.read_door_ladder_ceiling());
    return;
  end if;
  o_carried_visible := v_carried.o_ids;

  -- THE CLASSES. One ladder call for each label of `platform.visibility` this Table actually
  -- holds, asked about a row that is NOT the caller's own, NOT granted and NOT carried — the
  -- three things that would make a representative answer for a reason its class does not have.
  for v_label in select e.enumlabel
                   from pg_catalog.pg_enum e
                   join pg_catalog.pg_type t on t.oid = e.enumtypid
                   join pg_catalog.pg_namespace n on n.oid = t.typnamespace
                  where n.nspname = 'platform' and t.typname = 'visibility'
                  order by e.enumsortorder
  loop
    v_vis := v_label::platform.visibility;
    -- THE TABLE ALREADY ANSWERED FOR THIS CLASS (SHARED-ONLY). The Table edge carries every
    -- row at or above `internal`, so when the caller reaches the Table there is nothing left
    -- to ask about those classes and no representative to find.
    if v_table_carries and v_vis >= 'internal'::platform.visibility then
      o_true_visibility := o_true_visibility || v_vis;
      continue;
    end if;
    -- THE ROW THIS CLASS SPEAKS FOR, found in three bounded index scans instead of one scan of
    -- the class. `created_by is distinct from p_user` is two ranges and a null, and each of the
    -- three stops at its own first entry; the window is one row wider than the number of ids
    -- that may not represent their class, so it cannot miss a row it is allowed to choose.
    v_window := coalesce(array_length(o_granted_all, 1), 0)
              + coalesce(array_length(o_carried_visible, 1), 0) + 1;
    select c.id into v_rep
      from (
        (select r.id
           from custom.record r
          where r.organization_id = p_organization_id
            and r.table_id is not distinct from p_table_id
            and r.deleted_at is null
            and r.visibility = v_vis
            and r.created_by is null
          limit v_window)
        union all
        (select r.id
           from custom.record r
          where r.organization_id = p_organization_id
            and r.table_id is not distinct from p_table_id
            and r.deleted_at is null
            and r.visibility = v_vis
            and r.created_by < p_user
          order by r.created_by desc
          limit v_window)
        union all
        (select r.id
           from custom.record r
          where r.organization_id = p_organization_id
            and r.table_id is not distinct from p_table_id
            and r.deleted_at is null
            and r.visibility = v_vis
            and r.created_by > p_user
          order by r.created_by asc
          limit v_window)
      ) c
     where not (c.id = any (o_granted_all))
       and not (c.id = any (o_carried_visible))
     limit 1;
    if v_rep is not null then
      o_ladder_calls := o_ladder_calls + 1;
      if custom.has_visibility(p_user, 'record', v_rep, p_required) then
        o_true_visibility := o_true_visibility || v_vis;
      end if;
    end if;
  end loop;

  -- THE GRANTED IDS, ONE AT A TIME, ON THE ONE LADDER. Nothing here decides anything: it asks.
  foreach v_id in array o_granted_all loop
    o_ladder_calls := o_ladder_calls + 1;
    if custom.has_visibility(p_user, 'record', v_id, p_required) then
      o_granted_visible := o_granted_visible || v_id;
    end if;
  end loop;

  -- IS IT THE WHOLE TABLE? Then the page needs no visibility predicate at all and the LIMIT
  -- stops the scan at the first p_limit rows. This is the ordinary case — somebody reading a
  -- Table of their own organization — and it is the case that was costing seconds.
  o_all_visible := (v_n = 0)
                   and not exists (
                     select 1 from custom.record r
                      where r.organization_id = p_organization_id
                        and r.table_id is not distinct from p_table_id
                        and r.deleted_at is null
                        and not (r.visibility = any (o_true_visibility)));
  return;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.tables_seen_once_per_group(p_user_id uuid, p_organization_ids uuid[])
 RETURNS TABLE(organization_id uuid, id uuid, seen boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET plan_cache_mode TO 'force_generic_plan'
AS $function$
-- STORE-READ-PERF-3 (2026-09-28). WHICH TABLES THIS PERSON SEES IN THESE ORGANIZATIONS: the one
-- ladder's own viewer answer about every live row of the Table kernel, asked once per group of
-- Tables it cannot tell apart instead of once per Table.
--
-- `seen` is exactly what custom.visible_set's Table-kernel loop answered about each live Table at
-- viewer, one ladder walk per Table (0.55 ms for a Table she owns, 9 ms for one in an organization
-- that shares only what is shared, and the data home asks it for every organization she is in). On
-- a Table that answer is custom.reaches_directly (arms 1 to 3b and the scope arm) OR arm 4
-- (custom.table_has_a_visible_record: something inside it opens to her). The two halves:
--
-- 1. custom.reaches_directly ONCE PER SIGNATURE. What that walk reads about one record is (i) its
--    own columns; (ii) rows that NAME it by id: a grant (iam.permissions), a membership held on it
--    (record or scope), a library grant (platform.entity_grants), a closure row
--    (platform.reachability), a scope assignment or a portal relation (platform.associations), an
--    owned relation record (arm 3b, found from data->parent_id); (iii) its carrying edges
--    (custom.carrying_edges_of), recursing into each container through the same three. So a Table
--    named by nothing in (ii), whose id no second row carries, whose parent_id is well formed, and
--    whose ONE container is a record named by nothing, carried by one row and carried by nothing
--    itself, answers exactly like every other such Table whose own columns and whose container's
--    columns are the same. The signature is those columns: the whole row but its id, content and
--    clocks, a superset of what the ladder reads, so it can only split a group, never merge two
--    that differ. It is custom.levels_of's argument (STORE-READ-PERF-2) taken one carrying edge up
--    to a leaf container. One container only: custom.addressed_cap_specific takes the first
--    container at the nearest depth, and two at one depth come out in an order their ids decide.
--    Every other Table is asked on its own, through custom.levels_of (the same viewer answer).
--    EVERY Table is asked on its own when the registry gives `record` a per-row input no signature
--    carries: an FK containment parent, a reference gate, a detail or child parent pointer, a row
--    class column, the detail variant, owner-only trash.
-- 2. ARM 4, in its own terms and only where it could say yes: she created a live record in the
--    Table; else the viewer answer about each id custom.read_door_granted_ids names (when no more
--    than the ceiling) and about each record something other than the Table carries
--    (custom.carrying_edges_in, once per organization); more carried candidates than the ceiling,
--    where custom.table_has_a_visible_record's own LIMIT picks, are answered by it.
--
-- THE MEMO. Group answers live in this call's loop. As it returns it also leaves each
-- organization's answer in the STATEMENT memo (platform.memo_k_put: fenced by the statement, the
-- backend, the transaction's first write and the seat), so the per-organization custom.visible_set
-- calls the same door statement makes next read it instead of walking again. Nothing is stored
-- anywhere else, and nothing outlives the statement.
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
begin
  if p_organization_ids is null or cardinality(p_organization_ids) = 0 then
    return;
  end if;

  -- STORE-READ-PERF-4: ASKED AGAIN IN THE SAME STATEMENT (a door that primes, then a door it calls that
  -- primes again), the answer is the one this statement already worked out — read from the memo when
  -- every organization asked has its entry for this person, statement and snapshot.
  if pg_catalog.pg_current_xact_id_if_assigned() is null and p_user_id is not null
     and not exists (select 1 from unnest(p_organization_ids) x
                      where x is not null
                        and platform.memo_k_get('custom.tables_unseen:' || p_user_id::text || ':' || x::text
                                                || ':' || pg_catalog.pg_current_snapshot()::text) is null) then
    return query
      select x.org, y.id::uuid, true
        from (select distinct o as org from unnest(p_organization_ids) o where o is not null) x
        cross join lateral unnest(string_to_array(nullif(platform.memo_k_get(
               'custom.tables_seen:' || p_user_id::text || ':' || x.org::text || ':' || pg_catalog.pg_current_snapshot()::text), ''), ',')) y(id)
      union all
      select x.org, y.id::uuid, false
        from (select distinct o as org from unnest(p_organization_ids) o where o is not null) x
        cross join lateral unnest(string_to_array(nullif(platform.memo_k_get(
               'custom.tables_unseen:' || p_user_id::text || ':' || x.org::text || ':' || pg_catalog.pg_current_snapshot()::text), ''), ',')) y(id);
    perform platform.memo_k_put('custom.tables_seen_orgs:' || p_user_id::text || ':' || pg_catalog.pg_current_snapshot()::text,
                                coalesce((select string_agg(distinct x::text, ',') from unnest(p_organization_ids) x where x is not null), ''));
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
  for v_i in 1 .. coalesce(cardinality(v_ids), 0) loop
    if v_keys[v_i] is null then
      v_r_org := v_r_org || v_orgs[v_i]; v_r_id := v_r_id || v_ids[v_i];
      v_r_seen := v_r_seen || coalesce((v_one -> v_ids[v_i]::text ->> 's')::boolean, false);
      continue;
    end if;
    if v_keys[v_i] is distinct from v_prev_k then
      v_prev_v := custom.reaches_directly(p_user_id, 'record', v_ids[v_i], 'viewer'::public.permission_level);
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

  -- The statement memo, one pair of entries per organization asked (an organization with no live
  -- Table gets empty answers too, so its caller does not walk it again): the Tables she sees, and
  -- the Table-kernel ids custom.read_door_granted_ids names there — the same query, answered once
  -- for every organization, so custom.visible_set can take its grant ceiling from it.
  for v_arm in
    select o.org,
           coalesce((select string_agg(u.id::text, ',' order by u.id)
                       from unnest(v_r_org, v_r_id, v_r_seen) as u(org, id, seen)
                      where u.org = o.org and u.seen), '') as seen_ids,
           coalesce((select string_agg(u.id::text, ',' order by u.id)
                       from unnest(v_r_org, v_r_id, v_r_seen) as u(org, id, seen)
                      where u.org = o.org and not u.seen), '') as unseen_ids,
           coalesce(gr.ids, '') as granted_ids
      from (select distinct x as org from unnest(p_organization_ids) x where x is not null) o
      left join (
        select r.organization_id as org, string_agg(distinct r.id::text, ',') as ids
          from (
            select p.resource_id as id from iam.permissions p where p.resource_type = 'record'
            union all select m.container_id from iam.memberships m where m.container_type = 'record'
            union all select g.entity_id from platform.entity_grants g where g.entity_type = 'record'
            union all select rr.item_id from platform.reachability rr where rr.item_type = 'record'
          ) h
          join custom.record r
            on r.id = h.id and r.deleted_at is null
           and r.organization_id = any (p_organization_ids)
           and r.table_id is not distinct from custom.table_kernel_id()
         group by 1
      ) gr on gr.org = o.org
  loop
    -- STORE-READ-PERF-4: only while the transaction has written nothing (see custom.visible_set).
    exit when pg_catalog.pg_current_xact_id_if_assigned() is not null;
    perform platform.memo_k_put('custom.tables_seen:' || coalesce(p_user_id::text, '-') || ':' || v_arm.org::text
                                || ':' || pg_catalog.pg_current_snapshot()::text,
                                v_arm.seen_ids);
    perform platform.memo_k_put('custom.tables_unseen:' || coalesce(p_user_id::text, '-') || ':' || v_arm.org::text
                                || ':' || pg_catalog.pg_current_snapshot()::text,
                                v_arm.unseen_ids);
    perform platform.memo_k_put('custom.kernel_granted:' || v_arm.org::text || ':' || pg_catalog.pg_current_snapshot()::text, v_arm.granted_ids);
  end loop;

  if pg_catalog.pg_current_xact_id_if_assigned() is null and p_user_id is not null then
    -- The organizations this statement asked about, for custom.query_visible_ids' one pass over them.
    perform platform.memo_k_put('custom.tables_seen_orgs:' || p_user_id::text || ':' || pg_catalog.pg_current_snapshot()::text,
                                coalesce((select string_agg(distinct x::text, ',') from unnest(p_organization_ids) x where x is not null), ''));
  end if;
  return query select u.org, u.id, u.seen from unnest(v_r_org, v_r_id, v_r_seen) as u(org, id, seen);
end;
$function$;

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
      v_ctx := platform.shown_to_context('record');
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

  v_ctx := platform.shown_to_context('record');

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
$function$;

CREATE OR REPLACE FUNCTION custom.hub_changed_by(p_organization_id uuid, p_kind text, p_ids uuid[])
 RETURNS TABLE(id uuid, at timestamp with time zone, who text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_ids    uuid[] := coalesce(p_ids, array[]::uuid[]);
  v_people jsonb;
  v_set    record;
  -- STORE-READ-PERF-4: asked once per call, not once per row.
  v_owner  boolean := custom.query_is_store_owner();
  v_levels jsonb := '{}'::jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.hub_changed_by');

  if p_kind not in ('structure', 'form', 'portal') then
    raise exception 'custom.hub_changed_by does not know the kind %', coalesce(p_kind, '(null)')
      using errcode = '22023',
            hint = 'The kinds are: structure (a Table, dashboard, rule, checklist or work '
                   'template), form (a form, booking page or capture sheet) and portal.';
  end if;

  if array_length(v_ids, 1) is null then
    return;
  end if;
  if array_length(v_ids, 1) > 500 then
    raise exception 'custom.hub_changed_by was asked about % things at once', array_length(v_ids, 1)
      using errcode = '54000',
            hint = 'Ask about at most 500 at a time — that is one page of a hub, and more '
                   'than a person reads.';
  end if;

  if p_kind = 'structure' then
    -- STORE-READ-PERF-3: the organization's Tables are answered together, by custom.visible_set's
    -- Table-kernel answer (custom.has_visibility about every live Table, asked once per group of
    -- look-alike Tables); any other id, and every id when that answer stops, is asked on its own.
    if exists (select 1 from custom.record t
                where t.organization_id = p_organization_id and t.id = any (v_ids)
                  and t.table_id = custom.table_kernel_id() and t.deleted_at is null) then
      v_set := custom.visible_set(custom.query_principal(), p_organization_id, custom.table_kernel_id(),
                                  'viewer'::public.permission_level);
    else
      select true as o_fallback, '{}'::uuid[] as o_carried_visible into v_set;
    end if;
    -- STORE-READ-PERF-4: every other id (a dashboard, rule, checklist or template) is answered by the
    -- same ladder through custom.levels_of, all of them in one call (once per class of records the
    -- ladder cannot tell apart; its 's' is exactly custom.has_visibility at viewer).
    if not v_owner then
      v_levels := custom.levels_of(custom.query_principal(), array(
                    select r.id from custom.record r
                     where r.organization_id = p_organization_id and r.id = any (v_ids)
                       and coalesce(r.data_class, 'record') <> 'record'
                       -- only rows levels_of can answer by class (a row of a Table that is not the
                       -- Table kernel); every other id is asked on its own, as before
                       and r.table_id is not null
                       and r.table_id is distinct from custom.table_kernel_id()));
    end if;
    return query
      with people as materialized (
        select custom.history_people(
                 p_organization_id,
                 array(select distinct coalesce(r.updated_by, r.created_by)
                         from custom.record r
                        where r.organization_id = p_organization_id
                          and r.id = any (v_ids)
                          and coalesce(r.updated_by, r.created_by) is not null)) as m
      )
      select r.id,
             coalesce(r.updated_at, r.created_at),
             people.m #>> array[coalesce(r.updated_by, r.created_by)::text, 'name']
        from custom.record r cross join people
       where r.organization_id = p_organization_id
         and r.id = any (v_ids)
         -- THE BOUND. A person's own business row is never answered here.
         and coalesce(r.data_class, 'record') <> 'record'
         -- AND THE LADDER (ARGS-RULED-2, 2026-09-22). A structure the caller may not open is
         -- a structure this door does not describe — not when it last changed, not who changed
         -- it. Until this line the arm narrowed by organization only, so in an organization set
         -- to "only what is shared" a member was told who last edited a colleague's private
         -- Table that custom.read_record refuses her. The form arm below always asked.
         and (v_owner
              or case
                   when not v_set.o_fallback
                        and r.table_id = custom.table_kernel_id() and r.deleted_at is null
                     then r.id = any (v_set.o_carried_visible)
                   when v_levels ? r.id::text
                     then coalesce((v_levels -> r.id::text ->> 's')::boolean, false)
                   else custom.has_visibility(custom.query_principal(), 'record', r.id,
                                              'viewer'::public.permission_level)
                 end);

  elsif p_kind = 'form' then
    return query
      with people as materialized (
        select custom.history_people(
                 p_organization_id,
                 array(select distinct coalesce(f.updated_by, f.created_by)
                         from custom.anon_form f
                        where f.organization_id = p_organization_id
                          and f.id = any (v_ids)
                          and coalesce(f.updated_by, f.created_by) is not null)) as m
      )
      select f.id,
             coalesce(f.updated_at, f.created_at),
             people.m #>> array[coalesce(f.updated_by, f.created_by)::text, 'name']
        from custom.anon_form f cross join people
       where f.organization_id = p_organization_id
         and f.id = any (v_ids)
         and f.table_id in (select v from custom.query_visible_ids(p_organization_id,
                                                                   custom.table_kernel_id()) v);

  else
    return query
      with people as materialized (
        select custom.history_people(
                 p_organization_id,
                 array(select distinct p.created_by
                         from custom.portal p
                        where p.organization_id = p_organization_id
                          and p.id = any (v_ids)
                          and p.created_by is not null)) as m
      )
      select p.id,
             p.created_at,
             people.m #>> array[p.created_by::text, 'name']
        from custom.portal p cross join people
       where p.organization_id = p_organization_id
         and p.id = any (v_ids)
         -- A portal is described only to somebody who may see the Table its clients live in —
         -- the same set the form arm asks, for the same reason (ARGS-RULED-2).
         and (v_owner
              or p.client_table_id in (select v from custom.query_visible_ids(p_organization_id,
                                                                            custom.table_kernel_id()) v));
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.context_tree(p_organization_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me     uuid := custom.query_principal();
  v_tables uuid := custom.table_kernel_id();
  v_fields uuid := custom.field_kernel_id();
  v_orgs   uuid[];
  v_org    uuid;
  v_admin  uuid[] := '{}'::uuid[];
  v_types  jsonb := '[]'::jsonb;
  v_scopes jsonb := '[]'::jsonb;
begin
  -- THE DOOR DECIDES, FIRST, IN ITS OWN NAME (check:store-doors-decide): every organization named
  -- is one the caller may reach, or the call is refused here naming this door (42501) — never an
  -- empty tree that reads like "no scopes here".
  select coalesce(array_agg(distinct o), '{}'::uuid[]) into v_orgs
    from unnest(coalesce(p_organization_ids, '{}'::uuid[])) o where o is not null;
  foreach v_org in array v_orgs loop
    -- THE ADMIN LANE (parity with the platform_admin_select policies the old scope tables carry): on
    -- a request from /administration/** (public.is_platform_admin() is true only with the admin-lane
    -- header, for a platform admin) an organization the admin is not a member of is read whole,
    -- for the scope console. Everyone else, and every user page, meets the wall.
    if not (iam.has_org_access(v_org) or custom.portal_admits(v_org)) and public.is_platform_admin() then
      v_admin := v_admin || v_org;
      continue;
    end if;
    perform custom.assert_client_may_reach(v_org, 'custom.context_tree');
  end loop;
  if v_me is null or cardinality(v_orgs) = 0 then
    return jsonb_build_object('types', v_types, 'scopes', v_scopes);
  end if;

  -- STORE-READ-PERF-4 (2026-09-29): ONE TABLE WALK FOR EVERY ORGANIZATION THAT KEEPS A SCOPE TYPE.
  -- Which Tables she sees in those organizations is asked once, for all of them together
  -- (custom.tables_seen_once_per_group: the one ladder once per group of look-alike Tables); the
  -- answer waits in this statement's memo and each custom.query_visible_ids(org, Table kernel) below
  -- reads its organization's part. It decides nothing: without it every answer is the same.
  perform count(*)
     from custom.tables_seen_once_per_group(v_me, array(
            select distinct t.organization_id
              from custom.record t
             where t.organization_id = any (v_orgs)
               and not (t.organization_id = any (v_admin))
               and t.table_id = v_tables
               and t.deleted_at is null
               and t.data ->> 'kept_for' = 'context'));

  -- THE TWO-STEP SHAPE (SCOPES-CUTOVER-PLAN E7). Step 1: the scope types of these organizations —
  -- the live Tables the context system keeps — that the caller sees on the one ladder (asked only
  -- for organizations that keep a scope type at all). Step 2: their live Records the caller sees,
  -- by the (organization_id, table_id) index, and of each only the columns the caller may read.
  with t0 as materialized (
    select t.organization_id as org, t.id, t.data, t.created_at, t.updated_at, t.created_by
      from custom.record t
     where t.organization_id = any (v_orgs)
       and t.table_id = v_tables
       and t.deleted_at is null
       and t.data ->> 'kept_for' = 'context'
  ),
  t as materialized (
    select t0.* from t0
     where t0.org = any (v_admin)
        or t0.id in (select v.v from (select distinct t0.org from t0 where not (t0.org = any (v_admin))) o
                       cross join lateral custom.query_visible_ids(o.org, v_tables) v(v))
  ),
  -- The scope's own columns (name, description, slug, sort order) and each settings key are Fields
  -- the scope door derived on its Table (version-5 ids from custom._ctx_id). Each one is answered only
  -- where the one field decision (iam.may_touch_field, the step custom.read_mask_for takes for every
  -- Field) lets the caller read it: asked at viewer, the least a person who sees the Record holds,
  -- and — only where viewer may not — again at the caller's own level on the Table.
  -- STORE-READ-PERF-4: every column Field of these organizations, and every live Record of these
  -- Tables, read in ONE pass each (the same rows the per-Table and per-id lookups found).
  flds as materialized (
    -- found through the store's GIN index on the document: a Field whose entity_definition_id is
    -- this Table's id holds exactly that string there, so containment finds exactly those rows.
    select f0.id, f0.organization_id, f0.data, f0.metadata
      from t t1
      join custom.record f0
        on f0.organization_id = t1.org
       and f0.data @> jsonb_build_object('entity_definition_id', t1.id::text)
       and f0.table_id = v_fields and f0.deleted_at is null
       and substr(f0.id::text, 15, 1) = '5'
  ),
  recs as materialized (
    select r0.id, r0.organization_id, r0.table_id, r0.data, r0.created_by, r0.created_at, r0.updated_at
      from custom.record r0
     where r0.organization_id = any ((select array_agg(distinct t2.org) from t t2)::uuid[])
       and r0.table_id = any ((select array_agg(t3.id) from t t3)::uuid[])
       and r0.deleted_at is null
  ),
  colf as materialized (
    select t.org, t.id as tbl, f.id as fid, f.data ->> 'key' as key,
           f.id = custom._ctx_id('scope-column-field', t.id::text, 'description') as is_desc,
           substring(f.metadata -> 'moved_from' ->> 'note' from '^the ''(.+)'' key of this type''s scopes'' settings') as setting,
           f.data ->> 'sensitivity' as sens,
           -- STORE-READ-PERF-4: the ONE field decision reads a Field through its sensitivity, a grant
           -- naming it, the formula inputs it reads, and (for a portal principal of the organization)
           -- the portal's field list. A Field with none of the last three answers like every other
           -- Field of its organization and sensitivity, so the decision is asked once for them all;
           -- every other Field is asked on its own, exactly as before.
           (exists (select 1 from iam.permissions p where p.resource_type = 'record' and p.resource_id = f.id)
            or coalesce(f.data ->> 'type', '') = 'formula'
            or exists (select 1 from custom.portal_principal pp
                        where pp.user_id = v_me and pp.organization_id = t.org)) as alone
      from t
      join flds f
        on f.organization_id = t.org
       and f.data ->> 'entity_definition_id' = t.id::text
  ),
  fgroup as materialized (
    select g.org, g.sens,
           iam.may_touch_field(v_me, g.rep, g.org, 'viewer'::public.permission_level, 'read') as viewer_reads
      from (select c.org, c.sens, min(c.fid::text)::uuid as rep
              from colf c
             where not c.alone and not (c.org = any (v_admin))
             group by c.org, c.sens) g
  ),
  shown as materialized (
    select colf.*
      from colf
      left join fgroup g on g.org = colf.org and g.sens is not distinct from colf.sens and not colf.alone
     where case when colf.org = any (v_admin) then true
                when g.viewer_reads then true
                when not colf.alone and g.viewer_reads is not null then
                  iam.may_touch_field(v_me, colf.fid, colf.org, custom.effective_level(v_me, colf.org, colf.tbl), 'read')
                when iam.may_touch_field(v_me, colf.fid, colf.org, 'viewer'::public.permission_level, 'read') then true
                else iam.may_touch_field(v_me, colf.fid, colf.org, custom.effective_level(v_me, colf.org, colf.tbl), 'read') end
  ),
  cols as materialized (
    select t.org, t.id,
           -- The description column answers to scope_description on a Table with an item of that key.
           coalesce((select s.key from colf s where s.org = t.org and s.tbl = t.id and s.is_desc), 'description') as desc_key,
           coalesce((select jsonb_agg(s.key) from shown s where s.org = t.org and s.tbl = t.id and s.setting is null), '[]'::jsonb) as visible,
           coalesce((select jsonb_object_agg(s.key, s.setting) from shown s
                      where s.org = t.org and s.tbl = t.id and s.setting is not null), '{}'::jsonb) as setting_keys
      from t
  ),
  vis as materialized (
    select t.org, t.id as tbl, v.v as id
      from t cross join lateral custom.query_visible_ids(t.org, t.id) v(v)
     where not (t.org = any (v_admin))
    union all
    select t.org, t.id, r.id
      from t join custom.record r on r.organization_id = t.org and r.table_id = t.id and r.deleted_at is null
     where t.org = any (v_admin)
  )
  select
    coalesce((select jsonb_agg(jsonb_build_object(
                'id', t.id, 'organization_id', t.org,
                'label_singular', t.data -> 'label_singular', 'label_plural', t.data -> 'label_plural',
                'name', t.data -> 'name', 'icon', t.data -> 'icon', 'color', t.data -> 'color',
                'slug', t.data -> 'slug', 'description', t.data -> 'description',
                'sort_order', t.data -> 'sort_order',
                'max_assignments_per_entity', t.data -> 'max_assignments_per_entity',
                'default_variable_keys', t.data -> 'default_variable_keys',
                'created_by', t.created_by, 'created_at', t.created_at, 'updated_at', t.updated_at)
              order by coalesce((t.data ->> 'sort_order')::numeric, 0), t.data ->> 'label_plural', t.id)
                from t), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
                'id', r.id, 'scope_type_id', r.table_id, 'organization_id', r.organization_id,
                'name', case when c.visible ? 'name' then r.data -> 'name' end,
                'description', case when c.visible ? c.desc_key then r.data -> c.desc_key end,
                'slug', case when c.visible ? 'slug' then r.data -> 'slug' end,
                'sort_order', case when c.visible ? 'sort_order' then r.data -> 'sort_order' end,
                'parent_scope_id', r.data -> 'parent_id',
                'settings', coalesce((select jsonb_object_agg(s.value #>> '{}', r.data -> s.key)
                                        from jsonb_each(c.setting_keys) s
                                       where r.data ? s.key
                                         and jsonb_typeof(r.data -> s.key) <> 'null'), '{}'::jsonb),
                'created_by', r.created_by, 'created_at', r.created_at, 'updated_at', r.updated_at)
              order by coalesce((r.data ->> 'sort_order')::numeric, 0), r.data ->> 'name', r.id)
                from vis
                join recs r
                  on r.organization_id = vis.org and r.table_id = vis.tbl and r.id = vis.id
                join cols c on c.org = vis.org and c.id = vis.tbl), '[]'::jsonb)
    into v_types, v_scopes;

  return jsonb_build_object('types', v_types, 'scopes', v_scopes);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.context_items(p_scope_type_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me     uuid := custom.query_principal();
  v_tables uuid := custom.table_kernel_id();
  v_ids    uuid[];
  v_grp    record;
  v_out    jsonb := '[]'::jsonb;
begin
  select coalesce(array_agg(distinct i), '{}'::uuid[]) into v_ids
    from unnest(coalesce(p_scope_type_ids, '{}'::uuid[])) i where i is not null;
  if v_me is null or cardinality(v_ids) = 0 then
    return v_out;
  end if;

  -- STORE-READ-PERF-4 (2026-09-29): ONE TABLE WALK FOR EVERY ORGANIZATION ASKED. Which Tables she
  -- sees there is asked once for all of them (custom.tables_seen_once_per_group); the answer waits in
  -- this statement's memo and each custom.query_visible_ids(org, Table kernel) below reads its
  -- organization's part. It decides nothing: without it every answer is the same.
  perform count(*)
     from custom.tables_seen_once_per_group(v_me, array(
            select distinct t.organization_id
              from custom.record t
             where t.id = any (v_ids) and t.deleted_at is null));
  -- Each scope type opens in its own organization (read from the Table itself), decided in this
  -- door's name; the Fields come through custom.applicable_fields, the store's own Field door, which
  -- asks whether the caller may know the Table. A Field the scope door derived (the scope's own
  -- name / description / slug / sort-order columns, a settings key — a version-5 id from
  -- custom._ctx_id) was never a context item and is not answered.
  for v_grp in
    select t.organization_id as org, t.id as tbl
      from custom.record t
     where t.id = any (v_ids) and t.table_id = v_tables and t.deleted_at is null
       and t.data ->> 'kept_for' = 'context'
  loop
    continue when not (iam.has_org_access(v_grp.org) or custom.portal_admits(v_grp.org));
    perform custom.assert_client_may_reach(v_grp.org, 'custom.context_items');
    continue when not exists (select 1 from custom.query_visible_ids(v_grp.org, v_tables) v where v = v_grp.tbl);
    v_out := v_out || coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', f.id, 'scope_type_id', v_grp.tbl, 'organization_id', v_grp.org,
               'data', f.data, 'carried', f.metadata -> 'moved_from' -> 'carried',
               'created_by', f.created_by, 'created_at', f.created_at, 'updated_at', f.updated_at,
               'version', f.version)
             order by coalesce((f.data ->> 'sort')::numeric, 0), f.data ->> 'label', f.id)
        from custom.applicable_fields(v_grp.org, v_grp.tbl, null) f
       where f.deleted_at is null
         and substr(f.id::text, 15, 1) <> '5'), '[]'::jsonb);
  end loop;
  return v_out;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.context_values(p_scope_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me     uuid := custom.query_principal();
  v_tables uuid := custom.table_kernel_id();
  v_fields uuid := custom.field_kernel_id();
  v_ids    uuid[];
  v_grp    record;
  v_out    jsonb := '[]'::jsonb;
begin
  select coalesce(array_agg(distinct i), '{}'::uuid[]) into v_ids
    from unnest(coalesce(p_scope_ids, '{}'::uuid[])) i where i is not null;
  if v_me is null or cardinality(v_ids) = 0 then
    return v_out;
  end if;
  if cardinality(v_ids) > 200 then
    raise exception 'custom.context_values answers at most 200 scopes a call (% asked).', cardinality(v_ids)
      using errcode = '22023', hint = 'Ask in batches of 200 or fewer.';
  end if;

  -- STORE-READ-PERF-4 (2026-09-29): ONE TABLE WALK FOR EVERY ORGANIZATION ASKED. Which Tables she
  -- sees there is asked once for all of them (custom.tables_seen_once_per_group); the answer waits in
  -- this statement's memo and each custom.query_visible_ids(org, Table kernel) below reads its
  -- organization's part. It decides nothing: without it every answer is the same.
  perform count(*)
     from custom.tables_seen_once_per_group(v_me, array(
            select distinct t.organization_id
              from custom.record t
             where t.id = any (array(select r.table_id from custom.record r where r.id = any (v_ids))) and t.deleted_at is null));

  -- A value is a key of the scope's Record document; the document comes through
  -- custom.read_records_by_ids (the one ladder, the one read mask), so a key the caller may not see
  -- is simply absent. Beside each value: its version, when it was set, the source it came from and
  -- the old value id the copy carried (the Record's own value stamps).
  for v_grp in
    select r.organization_id as org, r.table_id as tbl, array_agg(r.id) as ids
      from custom.record r
      join custom.record t
        on t.organization_id = r.organization_id and t.id = r.table_id
       and t.table_id = v_tables and t.deleted_at is null and t.data ->> 'kept_for' = 'context'
     where r.id = any (v_ids) and r.deleted_at is null
     group by 1, 2
  loop
    continue when not (iam.has_org_access(v_grp.org) or custom.portal_admits(v_grp.org));
    perform custom.assert_client_may_reach(v_grp.org, 'custom.context_values');
    continue when not exists (select 1 from custom.query_visible_ids(v_grp.org, v_tables) v where v = v_grp.tbl);
    v_out := v_out || coalesce((
      with d as materialized (
        select x.id, x.document from custom.read_records_by_ids(v_grp.org, v_grp.tbl, v_grp.ids, false) x
      ),
      h as materialized (
        select r.id, r.data -> '_values' as stamps, r.data -> '_sources' as sources, r.updated_at
          from custom.record r where r.organization_id = v_grp.org and r.id = any (v_grp.ids)
      ),
      f as materialized (
        select x.id, x.data, x.metadata from custom.record x
         where x.organization_id = v_grp.org and x.table_id = v_fields and x.deleted_at is null
           and x.data ->> 'entity_definition_id' = v_grp.tbl::text
           and substr(x.id::text, 15, 1) <> '5'
      ),
      v as materialized (
        select d.id as scope_id, f.id as item_id, f.data ->> 'key' as key, f.data as fdoc, f.metadata as fmeta,
               d.document -> (f.data ->> 'key') as value,
               h.stamps -> (f.data ->> 'key') as stamp, h.sources, h.updated_at
          from d join h on h.id = d.id
          join f on d.document ? (f.data ->> 'key') and jsonb_typeof(d.document -> (f.data ->> 'key')) <> 'null'
      ),
      -- The names of the scopes a reference points at, for its chip — only scopes the caller sees
      -- (the one ladder's level on each, custom.levels_of, asked once for all of them).
      refs as materialized (
        select distinct (e #>> '{}')::uuid as id
          from v cross join lateral jsonb_array_elements(case jsonb_typeof(v.value)
                                                           when 'array' then v.value
                                                           when 'string' then jsonb_build_array(v.value)
                                                           else '[]'::jsonb end) e
         where v.fdoc ->> 'type' = 'relation' and jsonb_typeof(e) = 'string'
           and (e #>> '{}') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      ),
      lv as materialized (
        select custom.levels_of(v_me, (select array_agg(refs.id) from refs)) as l where exists (select 1 from refs)
      ),
      names as materialized (
        select x.id, x.data ->> 'name' as name
          from custom.record x, lv
         where x.organization_id = v_grp.org and x.id in (select refs.id from refs)
           and (lv.l -> x.id::text ->> 'l') is not null
      )
      select jsonb_agg(jsonb_build_object(
               'scope_id', v.scope_id, 'context_item_id', v.item_id, 'key', v.key, 'value', v.value,
               'field', jsonb_build_object(
                 'type', v.fdoc -> 'type', 'multi', v.fdoc -> 'multi', 'format', v.fdoc -> 'format',
                 'display_format', v.fdoc -> 'display_format', 'config', v.fdoc -> 'config',
                 'relation_target', v.fdoc -> 'relation_target',
                 'carried', v.fmeta -> 'moved_from' -> 'carried'),
               'version', coalesce((v.stamp ->> 'ver')::int, 1),
               'set_at', coalesce(v.stamp ->> 'at', v.updated_at::text),
               'source_type', v.sources -> (v.stamp ->> 'src') ->> 'source_type',
               'value_id', v.sources -> (v.stamp ->> 'src') ->> 'old_value_id',
               'authored_by', case when (v.stamp ->> 'actor') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                                   then v.stamp ->> 'actor' end,
               'labels', (select jsonb_object_agg(n.id, n.name) from names n
                           where v.fdoc ->> 'type' = 'relation'
                             and (n.id::text = v.value #>> '{}'
                                  or (jsonb_typeof(v.value) = 'array' and v.value ? n.id::text)))))
        from v), '[]'::jsonb);
  end loop;
  return v_out;
end;
$function$;

