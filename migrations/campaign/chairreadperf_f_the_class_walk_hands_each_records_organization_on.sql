-- chair-step: it REPLACES the bodies of two internal store doors, custom.levels_of and custom._where_ids_open_with (signatures, SECURITY DEFINER, search_path and grants unchanged; neither has a client grant). custom.levels_of adds the row's organization ("o") to the answer of an id exactly one row carries; custom._where_ids_open_with reads a row by (organization, id) when it was handed that organization and asks the kernel-Table question once per Table. Every answer of custom._where_ids_open_with is the same bytes; `l` and `s` of custom.levels_of are the same for every id. No client-callable signature, table, index, policy, grant, door row or data row is touched.
-- lane: CHAIR-READPERF
-- based-on: custom.levels_of(uuid, uuid[]) 297b0c7c548540d57f516d57f623559d92c6f50e09be60c58691f971ab61620c
-- based-on: custom._where_ids_open_with(uuid[], uuid, jsonb) eb7d5e290b2b7dd734cfea2942aa2d0ef3538f3087b50031a375649d1602339c
-- lock: custom
--
-- Inverse: migrations/inverse/chairreadperf_f_the_class_walk_hands_each_records_organization_on_down.sql.
--
-- WHY (chair ruling (b), round 2 of CHAIR-READPERF, 2026-10-03). custom._where_ids_open_with looked every
-- id up `on x.id = u.id` — no organization key, so all 16 partitions of custom.record are probed per id
-- (40 ms for 627 ids, 69 ms for 936), and asked `exists (… kr.id = x.table_id …)`, again by id alone,
-- once per ROW. custom.levels_of has already read each id's home the same way one statement earlier.
--
-- THE CONTRACT CHANGE IS INTERNAL. custom.levels_of's answer gains one key per id; its readers:
--   custom._where_ids_open_with   reads `s` — and now `o` (this file)
--   custom._read_record_with      reads `? id`, `s`, `l`             unchanged
--   custom.read_records_by_ids    reads `l`                          unchanged
--   custom.resolve_context        passes the object on               unchanged
--   custom._seen_one, custom.seen_among, custom.tables_seen_among, custom.data_home_items,
--   custom.hub_changed_by, public.get_scope_context   read `s`       unchanged
--   custom.context_values         reads `s` / `l` by name            unchanged
-- None returns the object to a caller, compares it whole, or iterates its keys.

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
                           or a.relation_field_id is not null and exists (
                                select 1 from custom.portal_table pt where pt.names_via_field_id = a.relation_field_id)
                           or exists (select 1 from platform.association_types t
                                       where t.source_type = a.source_type and t.target_type = a.target_type
                                         and (t.label is null or t.label = a.label)
                                         and t.is_active and t.container_side = 'target')
                           or exists (select 1 from custom.carrying_rule cr
                                       where cr.role = a.role and cr.is_active and cr.container_side = 'target'))) ) as named
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
    end if;

    if v_key is not null and v_memo ? v_key then
      v_ks := v_ks || r.id::text;
      v_vs := v_vs || case when r.n = 1 then (v_memo -> v_key) || jsonb_build_object('o', r.organization_id)
                           else v_memo -> v_key end;
      continue;
    end if;

    v_l := custom.effective_level(p_user_id, r.organization_id, r.id);
    v_s := v_l is not null;
    v_v := jsonb_build_object('l', v_l, 's', v_s);
    v_ks := v_ks || r.id::text;
    v_vs := v_vs || case when r.found and r.n = 1 then v_v || jsonb_build_object('o', r.organization_id)
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

CREATE OR REPLACE FUNCTION custom._where_ids_open_with(p_ids uuid[], p_user_id uuid DEFAULT NULL::uuid, p_levels jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
-- STORE-READ-PERF-3 (2026-09-25). custom.where_id_opens FOR A SET OF IDS, in one pass.
--
-- Answers {"<id>": <exactly what custom.where_id_opens(<id>) answers>} for every id whose answer
-- is not null (an id it would answer null for is simply absent, so `-> id` is null for both).
--
-- THE SET ARM. The ids are looked up in custom.record in ONE query (their organization, Table,
-- class and liveness, and whether their Table is a kernel Table), not once per id. For a record
-- that is a Table, a part of how a Table is built (a Field, a Rule, a Person row) or an ordinary
-- record, custom.where_id_opens's wall is the record itself in its own organization, and
-- custom._where_id_may_open asks exactly two things about it: the organization wall
-- (custom.assert_client_may_reach, asked here once per organization and caught the same way) and
-- custom.assert_client_may_open, which for a row that lives where it is asked about and a signed-in
-- person is: the store's own role, else custom.has_visibility(person, 'record', id, 'viewer'). That
-- viewer answer is `s` in custom.levels_of — handed in by the calling door when it already asked
-- custom.levels_of for the SAME person (p_user_id = the query principal), asked here once for the
-- set otherwise.
--
-- EVERYTHING ELSE IS ASKED ON ITS OWN, through custom.where_id_opens itself: an id that is not a
-- record (a merged id, a form, a booking page, a portal, a rendered document), a dashboard, a
-- digest rule (its recipient-or-admin check), an id that more than one row carries, and every id
-- if the set arm's ladder question raises (so a refusal is the single door's refusal, verbatim).
declare
  v_me     uuid := custom.query_principal();
  v_tables uuid := custom.table_kernel_id();
  v_shows  uuid := custom.presentation_kernel_id();
  v_dash   text := custom.dashboard_class();
  v_owner  boolean;
  v_out    jsonb := '{}'::jsonb;
  v_rows   jsonb := '{}'::jsonb;    -- id -> {org, kind, path, live}, the set arm
  v_slow   uuid[] := array[]::uuid[];
  v_reach  jsonb := '{}'::jsonb;    -- organization -> may the person reach it
  v_levels jsonb := '{}'::jsonb;
  v_ask    uuid[];
  v_ok     boolean;
  v_w      jsonb;
  v_id     uuid;
  v_key    text;
  r        record;
begin
  -- A signed-out caller is nobody's (custom.where_id_opens answers null for every id).
  if p_ids is null or v_me is null then
    return v_out;
  end if;

  -- ── THE ONE LOOKUP: every id's home, grouped by the Table it lives in ────────────────────
  -- SCOPES-HANDOFF-BUDGET: one statement, not one jsonb append per id (appending to a jsonb
  -- object copies it whole, so a set of n ids cost n^2 bytes). An id more than one row carries,
  -- and a 'slow' kind, go to the single door exactly as before.
  -- CHAIR-READPERF (round 2): an id whose organization the calling door already knows (custom.levels_of
  -- hands it in as `o`, for an id exactly one row carries) is read by its key (organization, id) — one
  -- partition; any other id is looked up by id as before. An id not found under the organization it
  -- was handed with is 'slow' and goes to the single door, as an id with no row always did. And
  -- whether a row's Table is a kernel Table is asked once per Table met, not once per row.
  with u as materialized (
    select distinct s.id, (p_levels -> s.id::text ->> 'o')::uuid as o
      from unnest(p_ids) s(id) where s.id is not null
  ), h as materialized (
    select u.id, x.organization_id, x.table_id, x.data_class, x.deleted_at,
           x.data ? 'subscription' as subscribes, x.metadata ->> 'quarantine' as quarantine
      from u left join custom.record x on x.organization_id = u.o and x.id = u.id
     where u.o is not null
    union all
    select u.id, x.organization_id, x.table_id, x.data_class, x.deleted_at,
           x.data ? 'subscription' as subscribes, x.metadata ->> 'quarantine' as quarantine
      from u left join custom.record x on x.id = u.id
     where u.o is null
  ), k as materialized (
    select t.table_id,
           exists (select 1 from custom.record kr
                    where kr.id = t.table_id and kr.table_id = v_tables and kr.data_class = 'kernel') as kernel
      from (select distinct h.table_id from h where h.table_id is not null) t
  )
  select coalesce(jsonb_object_agg(q.id::text, jsonb_build_object(
           'org', q.org, 'kind', q.kind, 'live', coalesce(q.live, true),
           'path', case q.kind
                     when 'table'  then '/data-v2/' || q.id::text
                     when 'record' then '/data-v2/' || q.table_id::text || '?record=' || q.id::text
                   end)) filter (where q.n = 1 and q.kind <> 'slow'), '{}'::jsonb),
         coalesce(array_agg(distinct q.id) filter (where q.n > 1 or q.kind = 'slow'), array[]::uuid[])
    into v_rows, v_slow
    from (
      select h.id, h.organization_id as org, h.table_id,
             case
               when h.organization_id is null then 'slow'
               when h.table_id = v_tables then 'table'
               when h.table_id = v_shows and h.data_class = v_dash then 'slow'
               when h.data_class = 'rule' and h.subscribes then 'slow'
               when k.kernel then 'table_part'
               when coalesce(h.quarantine, 'false') = 'true' then 'none'
               else 'record'
             end as kind,
             h.deleted_at is null as live,
             count(*) over (partition by h.id) as n
        from h
        left join k on k.table_id = h.table_id
    ) q;

  -- ── THE LADDER'S VIEWER ANSWER, once for the set ─────────────────────────────────────────
  v_owner := custom.query_is_store_owner();
  if not v_owner then
    select array_agg(e.key::uuid) into v_ask
      from jsonb_each(v_rows) e
     where e.value ->> 'kind' <> 'none'
       and not (p_user_id is not distinct from v_me and coalesce(p_levels, '{}'::jsonb) ? e.key);
    if p_user_id is not distinct from v_me and p_levels is not null then
      v_levels := p_levels;
    end if;
    if v_ask is not null then
      begin
        -- SCOPES-HANDOFF-BUDGET: a Table is always walked on its own by custom.levels_of (its row
        -- lives in the kernel Table, which has no class), and this door reads only its viewer answer
        -- `s` = custom.has_visibility(person, 'record', id, 'viewer') — so a Table is asked exactly
        -- that, and not the rung above it as well (custom.effective_level's halving: two or three
        -- more walks of the whole ladder for every active Table a turn names).
        v_levels := v_levels
          || custom.levels_of(v_me, array(select a.id from unnest(v_ask) a(id)
                                           where v_rows -> a.id::text ->> 'kind' <> 'table'))
          || coalesce((select jsonb_object_agg(a.id::text, jsonb_build_object('s',
                          custom.has_visibility(v_me, 'record', a.id, 'viewer'::public.permission_level)))
                         from unnest(v_ask) a(id)
                        where v_rows -> a.id::text ->> 'kind' = 'table'), '{}'::jsonb);
      exception when others then
        -- the single door, verbatim, for every id of the set arm
        v_slow := v_slow || (select array_agg(e.key::uuid) from jsonb_each(v_rows) e);
        v_rows := '{}'::jsonb;
      end;
    end if;
  end if;

  -- the organization wall, once per organization (custom._where_id_may_open's first question)
  -- (asked in the order the rows are met, as before: the first time an id of that organization is)
  for r in select e.value ->> 'org' as org from jsonb_each(v_rows) e
            where e.value ->> 'kind' <> 'none'
            group by e.value ->> 'org' order by min(e.key) loop
    begin
      perform custom.assert_client_may_reach(r.org::uuid, 'platform.resolve_id');
      v_ok := true;
    exception when insufficient_privilege or null_value_not_allowed then
      v_ok := false;
    end;
    v_reach := v_reach || jsonb_build_object(r.org, v_ok);
  end loop;
  -- the row: the store's own role, else the one ladder at viewer — every answer in one statement
  select coalesce(jsonb_object_agg(e.key, jsonb_build_object(
           'kind',            e.value ->> 'kind',
           'organization_id', e.value -> 'org',
           'path',            e.value -> 'path',
           'live',            e.value -> 'live',
           'resolved_id',     e.key)), '{}'::jsonb)
    into v_out
    from jsonb_each(v_rows) e
   where e.value ->> 'kind' <> 'none'   -- DOOR-17: a quarantined submission
     and (v_reach ->> (e.value ->> 'org'))::boolean
     and (v_owner or coalesce((v_levels -> e.key ->> 's')::boolean, false));

  -- ── EVERYTHING ELSE: the single door ────────────────────────────────────────────────────
  -- SCOPES-HANDOFF-BUDGET: an id held by NOTHING custom.where_id_opens reads — no record row, no
  -- live merge alias, no form or booking page, no portal, no rendered document — is answered null
  -- by it (it looks in exactly those, in that order, and returns null when all miss), so it is
  -- left out here in one statement instead of five lookups an id. A scope not yet copied into the
  -- store is such an id.
  v_slow := array(
    select s.id from unnest(v_slow) s(id)
     where exists (select 1 from custom.record hr where hr.id = s.id)
        or exists (select 1 from custom.record_alias ha where ha.old_id = s.id and ha.revoked_at is null)
        or exists (select 1 from custom.anon_form hf where hf.id = s.id)
        or exists (select 1 from custom.portal hp where hp.id = s.id)
        or exists (select 1 from custom.doc_render hd where hd.id = s.id));
  foreach v_id in array v_slow loop
    v_w := custom.where_id_opens(v_id);
    if v_w is not null then
      v_out := v_out || jsonb_build_object(v_id::text, v_w);
    end if;
  end loop;
  return v_out;
end;
$function$;
