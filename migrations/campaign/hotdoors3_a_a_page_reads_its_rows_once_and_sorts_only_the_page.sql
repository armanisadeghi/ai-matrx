-- lane: HOT-DOORS-3
-- based-on: custom.levels_of(uuid, uuid[]) ff3d7451fe7f077daae32c0b68c718d16b78804341a2b224ab81e9d9d91e060a
-- based-on: custom.read_door_granted_ids(uuid, uuid) 3bd74aac3709c2207c4faff60c086318a02443b2e8abb652c4881e61dc537230
-- based-on: custom.read_records_by_ids(uuid, uuid, uuid[], boolean) ac59a89951b0716a1040f8566198eaa34d6cbd9d454c18678cfa3b9ca1001768
-- based-on: custom.visible_predicate_sql(uuid, uuid, uuid, permission_level, text) 7f947cd500715fafc97a798aec5d9391fd66f7ce78af4c6be871134ca126c2e7
-- based-on: custom.read_records_page(uuid, uuid, jsonb, text, jsonb, uuid, boolean, integer, integer, text) eabbb505c931214758f31dde713228ed79fad79dde7a0514730a802e75678be3
--
-- HOT-DOORS-3 (2026-10-08). A Table page (custom.read_records_page) paid a ~200 ms floor even for 8 rows. Same
-- answers, less work:
--   a) the "listed for her" filter rides the page's own walk (custom.visible_predicate_sql, asked with the
--      "shown to" context in the statement memo) instead of a second walk of the whole Table through
--      custom.query_visible_ids, hashed; the context is worked out once for both arms of the page;
--   b) only the page is sorted: the matches carry their sort keys, the total counts them and the page is a
--      top-N of them (it numbered every match with row_number(), a full sort of all 25,000);
--   c) the Confidential header is asked only of an id the read door did not open (it was asked of all 50);
--   d) custom.read_door_granted_ids probes each named id by (organization, id) instead of hash-joining every
--      live record of the organization (26,000 rows read to keep 10);
--   e) custom.levels_of reads the page's rows in the page's organization (custom.read_records_by_ids hands it
--      over in the statement memo) and the ids it sends to the ladder carry the organization hint.
-- mx.read_page_set = off gives every one of these exactly as before (the proofs compare both on one snapshot).
-- No RLS policy and no iam kernel function changes. Function bodies only: any hour.
-- Inverse: migrations/inverse/hotdoors3_a_a_page_reads_its_rows_once_and_sorts_only_the_page_down.sql

set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION custom.levels_of(p_user_id uuid, p_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- HOT-DOORS-3 (2026-10-08). THE SAME ANSWER, READ IN THE ORGANIZATION THE CALLER ALREADY HOLDS. A door that knows
-- the organization its ids live in (a page of one Table: custom.read_records_by_ids) leaves it in the statement
-- memo ('custom.levels_of_org', platform.memo_k_*) around its one call here, and clears it after. Then two reads
-- change, nothing else:
--   * each id's row is read by its key (organization, id) — one partition — and only an id with no row there
--     is read by id alone across all sixteen, exactly as before (a hint, never a filter);
--   * the ids that go to the ladder carry the organization in the statement memo (custom.record_org_hint),
--     so the kernel's first read of each touches one partition too.
-- Record ids are unique across organizations (KERNEL.md, KERNEL-ORG-PRUNE), so the row read in the
-- organization is the row read by id, and "o" is that organization.
--
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
  -- HOT-DOORS-3: the organization the caller holds, or null (then every id is read by id alone, as before)
  p_organization_id uuid := case when coalesce(current_setting('mx.read_page_set', true), '') <> 'off'
                                 then nullif(platform.memo_k_get('custom.levels_of_org'), '')::uuid end;
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
      left join lateral (
             select x0.id, x0.organization_id, x0.table_id, x0.visibility, x0.deleted_at, x0.created_by, x0.data
               from custom.record x0
              where x0.organization_id = p_organization_id and x0.id = u.id
             union all
             select x1.id, x1.organization_id, x1.table_id, x1.visibility, x1.deleted_at, x1.created_by, x1.data
               from custom.record x1
              where x1.id = u.id
                and not exists (select 1 from custom.record x2
                                 where x2.organization_id = p_organization_id and x2.id = u.id)
           ) x on true
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
  -- HOT-DOORS-3: the organization rides the ladder's reads of the rows it is asked about.
  select coalesce(jsonb_object_agg(e.id::text, e.level), '{}'::jsonb) into v_lv
    from custom.effective_level_many(
           p_user_id,
           array(select case when p_organization_id is not null and v_a_org[k] = p_organization_id
                             then custom.record_org_hint(v_a_id[k], p_organization_id) else v_a_id[k] end
                   from generate_subscripts(v_a_id, 1) k
                  where v_a_id[k] = any (v_need)
                  order by k)) e;

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
  -- HOT-DOORS-3 (2026-10-08): THE SAME IDS, EACH PROBED BY ITS KEY. The named ids (about 1,200 on the whole
  -- platform) were hash-joined against every live record of the organization (26,000 rows read to keep 10,
  -- 43 ms); each is now looked up by (organization, id) in this organization's one partition. Same ids.
  -- mx.read_page_set = off: the join as before (the proofs compare both on one snapshot).
  if v_m is null and coalesce(current_setting('mx.read_page_set', true), '') <> 'off' then
    select coalesce(jsonb_object_agg(z.tbl, z.ids), '{}'::jsonb) into v_m
      from (
        select coalesce(r.table_id::text, '-') as tbl, jsonb_agg(distinct r.id) as ids
          from (
            select distinct h0.id
              from (
                select p.resource_id as id from iam.permissions p where p.resource_type = 'record'
                union all
                select m.container_id from iam.memberships m where m.container_type = 'record'
                union all
                select g.entity_id from platform.entity_grants g where g.entity_type = 'record'
                union all
                select rr.item_id from platform.reachability rr where rr.item_type = 'record'
              ) h0
             where h0.id is not null
          ) h
          cross join lateral (
            select r0.id, r0.table_id
              from custom.record r0
             where r0.organization_id = p_organization_id
               and r0.id = h.id
               and r0.deleted_at is null
            offset 0
          ) r
         group by 1
      ) z;
    perform platform.memo_k_put(v_key, v_m::text);
  end if;
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

CREATE OR REPLACE FUNCTION custom.read_records_by_ids(p_organization_id uuid, p_table_id uuid, p_record_ids uuid[], p_by_id boolean DEFAULT false)
 RETURNS TABLE(id uuid, document jsonb, level permission_level)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me       uuid := auth.uid();
  v_rec      record;
  v_set      record;
  v_mask     jsonb;
  v_visible  text[];
  v_declared text[];
  v_n        integer := coalesce(cardinality(p_record_ids), 0);
  v_rows     custom.record[];
  v_row      custom.record;
  v_levels   jsonb;
  v_cache    jsonb := '{}'::jsonb;
  v_vs       record;
  v_cr       jsonb;
  v_world_def boolean := false;
  v_seen     uuid[];  -- PERF-FIX-5
  v_mask_ready boolean := false;  -- HOT-DOORS-2
  v_mask_lvl   text;
begin
  if v_me is null then
    raise exception 'Nobody is signed in, so there is nothing to read.'
      using errcode = '42501',
            hint = 'DOOR-1: the read door resolves the reader from the session and takes no principal argument. Sign in, or call it from a lane that carries a person.';
  end if;
  -- CHAIR-WORLD-LANE-2: the wall first (as custom.assert_may_know_table asks it), then — for a person it admitted
  -- ONLY through the world lane — the one other way through: every row asked for is a definition row of a Public
  -- Table of this organization (the Table record itself, one of its Fields, or a choice of one of its Fields).
  -- Anything else, and every other person, meets custom.assert_may_know_table exactly as before.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.read_records_by_ids');
  v_world_def := custom.world_reader_reads_public_definition(p_organization_id, p_table_id, p_record_ids);
  if not v_world_def then
    perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.read_records_by_ids');
  end if;

  -- NOTHING ASKED FOR IS NOT AN ERROR — it is an empty answer, and it costs nothing.
  if v_n = 0 then
    return;
  end if;

  -- THE SAME CEILING THE PAGE DOORS DECLARE, and it refuses above it by name rather than
  -- handing back a short list the caller cannot tell from a complete one.
  perform custom.page_size(p_organization_id, 'custom.read_records_by_ids', v_n, 200);

  -- STEP 1, ONCE: THE ONE LADDER decides WHICH rows. Identical call, identical arguments to
  -- the page door's. This is the question that must never be asked twice in two ways.
  -- PERF-FIX-5 (2026-10-08). A READ OF N IDS ASKS ABOUT THOSE N ROWS, NOT ABOUT THE WHOLE TABLE. On the Table kernel
  -- (the Table's own row, which every table page reads) custom.visible_set answers by walking the one ladder over EVERY live
  -- Table of the organization, to return one. Its kernel branch hands back nothing but "every Table is seen" or the seen list
  -- (no class, no granted answer), so the rows asked for are visible when she created them or when custom.tables_seen_among
  -- - the very walk the set builds its list from, here for these ids only, asked through iam.has_access_for_many first -
  -- sees them. Only where visible_set does not stop (an archived organization, a registered FK containment parent for record)
  -- and for a person admitted through the world lane; everything else, every other Table, asks visible_set as before.
  -- mx.read_by_ids_set = off: the whole set, as before (the proofs compare both on one snapshot).
  if p_table_id = custom.table_kernel_id()
     and not v_world_def
     and coalesce(current_setting('mx.read_by_ids_set', true), '') <> 'off'
     and not exists (select 1 from platform.entity_relationships er
                      where er.child_type = 'record' and er.kind in ('composition', 'containment'))
     and not exists (select 1 from iam.organizations o
                      where o.id = p_organization_id and o.archived_at is not null) then
    select coalesce(array_agg(g.id), '{}'::uuid[]) into v_seen
      from custom.tables_seen_among(v_me, array[p_organization_id], p_record_ids) g
     where g.seen and g.organization_id = p_organization_id;
    select false as o_all_visible, '{}'::platform.visibility[] as o_true_visibility, '{}'::uuid[] as o_granted_all,
           '{}'::uuid[] as o_granted_visible, v_seen as o_carried_visible, 0 as o_ladder_calls,
           false as o_fallback, null::text as o_note
      into v_set;
  else
    v_set := custom.visible_set(v_me, p_organization_id, p_table_id, 'viewer'::public.permission_level);
  end if;

  if v_set.o_fallback then
    raise notice '%', v_set.o_note;
  end if;

  -- STORE-READ-PERF-2: the rows first, in the door's own order, so the ladder can be asked about
  -- the whole set at once (custom.levels_of) instead of once per row inside custom.read_mask.
  select coalesce(array_agg(r order by r.created_at desc, r.id), '{}'::custom.record[]) into v_rows
      from custom.record r
     where r.organization_id = p_organization_id
       and r.table_id = p_table_id
       and r.deleted_at is null
       and r.id = any (p_record_ids)
       and ( case
               -- CHAIR-WORLD-LANE-2: definition rows of a Public Table, every one checked above, read at viewer.
               when v_world_def then
                 true
               -- The ladder could not answer in a bounded way, so each row is asked directly —
               -- `read_records`' fallback arm, and the same single call.
               when v_set.o_fallback then
                 custom.has_visibility(v_me, 'record', custom.record_org_hint(r.id, r.organization_id), 'viewer')
               -- Every live row of this Table is hers.
               when v_set.o_all_visible then
                 true
               -- A class she holds, WITH EXCEPTIONS: a granted id is never answered by its
               -- class (VIS-19), and containment only ever adds (VIS-6).
               when coalesce(array_length(v_set.o_true_visibility, 1), 0) > 0 then
                 ( r.created_by = v_me
                   or (r.visibility = any (v_set.o_true_visibility)
                       and not (r.id = any (v_set.o_granted_all)))
                   or r.id = any (v_set.o_granted_visible)
                   or r.id = any (v_set.o_carried_visible) )
               -- Nothing by class — `shared_only`, or a Table nobody shared with her.
               else
                 ( r.created_by = v_me
                   or r.id = any (v_set.o_granted_visible)
                   or r.id = any (v_set.o_carried_visible) )
             end )
  ;
  -- HOT-DOORS-3 (2026-10-08): every row here is a row of p_organization_id, so the levels are read in it
  -- (custom.levels_of, handed the organization in the statement memo: same answers, one partition). mx.read_page_set = off: as before.
  if coalesce(current_setting('mx.read_page_set', true), '') = 'off' then
    v_levels := custom.levels_of(v_me, (select array_agg(x.id) from unnest(v_rows) x));
  else
    perform platform.memo_k_put('custom.levels_of_org', p_organization_id::text);
    v_levels := custom.levels_of(v_me, (select array_agg(x.id) from unnest(v_rows) x));
    perform platform.memo_k_put('custom.levels_of_org', '');
  end if;

  foreach v_row in array v_rows
  loop
    select * into v_vs from custom.record_values_step(v_row, v_cache);
    v_cache := v_vs.o_cache;
    if v_cr is null then
      v_cr := custom.choice_render_plan(p_organization_id, p_table_id);
    end if;
    -- STEP 2, PER ROW: THE ONE MASK decides which FIELDS of it she may see, at the level she
    -- holds ON THIS RECORD. The same call `custom.read_record` makes for its one row.
    -- The row is in p_organization_id and p_table_id (the query above says so), which is the
    -- organization and Table custom.read_mask took the mask in; the rung is the set's answer.
    -- HOT-DOORS-2 (2026-10-08): THE FIELD QUESTION ONCE PER LEVEL, NOT ONCE PER ROW. The mask depends on the
    -- table, the reader and the level only; a page of 50 rows at one level asked it 50 times (0.6 ms each,
    -- 29 ms of a page). The rows are the same; a row at another level asks again.
    if not v_mask_ready
       or v_mask_lvl is distinct from (case when v_world_def then 'viewer' else (v_levels -> v_row.id::text ->> 'l') end) then
      v_mask_lvl := case when v_world_def then 'viewer' else (v_levels -> v_row.id::text ->> 'l') end;
      v_mask := custom.read_mask_for(v_me, p_organization_id, p_table_id,
                                     case when v_world_def then 'viewer'::public.permission_level
                                          else (v_levels -> v_row.id::text ->> 'l')::public.permission_level end, 'read');
      -- DOOR-N-5: id-keyed on request means EVERY declared Field's key, as the page doors do.
      select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_visible
        from jsonb_array_elements(v_mask -> 'visible') x;
      select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_declared
        from jsonb_array_elements(v_mask -> 'declared') x;
      v_mask_ready := true;
    end if;

    id := v_row.id;
    document := custom.choice_render_with(p_organization_id, p_table_id,
                  custom.mask_document(v_vs.o_doc, v_visible, v_mask -> 'notices', p_by_id,
                                       v_mask -> 'all_key_ids', v_declared), v_cr);
    -- BIG-VALUES-READERS: a value kept as a file carries its pointer, so every reader finds it.
    document := custom.with_whole_value_pointers(document, v_row.data -> '_values', v_row.data -> '_sources', v_visible, p_by_id, v_mask -> 'all_key_ids');
    -- CHAIR-RETIRED-VALUES: the values a tightened rule set aside, masked like the value they were.
    document := custom.with_retired(document, v_row.data -> '_retired', v_visible, v_declared);
    level := (v_mask ->> 'level')::public.permission_level;
    return next;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.visible_predicate_sql(p_user uuid, p_organization_id uuid, p_table_id uuid, p_required permission_level DEFAULT 'viewer'::permission_level, p_alias text DEFAULT 'r'::text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_set   record;
  v_alias text;
  v_out   text;
  v_lctx  text;   -- HOT-DOORS-3
begin
  -- The alias is an IDENTIFIER and is quoted as one. It is the door's own word — never a
  -- caller's — and quoting it is what keeps that true of every future caller too.
  v_alias := quote_ident(coalesce(nullif(btrim(p_alias), ''), 'r'));

  if p_user is null then
    -- No principal: the same answer `custom.query_visible_ids` gives, which is the campaign's
    -- own maintenance connection judged by its ROLE.
    return format('(custom.query_is_store_owner())');
  end if;

  -- CD-LADDER (2026-10-03): AN ARCHIVED ORGANIZATION IS CLOSED TO EVERYONE (access ladder T-33),
  -- its owner included: the kernel and custom.read_record refuse every row, so no list carries one.
  if exists (select 1 from iam.organizations o
              where o.id = p_organization_id and o.archived_at is not null) then
    return 'false';
  end if;

  v_set := custom.visible_set(p_user, p_organization_id, p_table_id, p_required);

  -- HOT-DOORS-3 (2026-10-08): THE OPEN PREDICATE WITH THE LIST FILTER, FOR A DOOR THAT ASKS FOR BOTH ON ONE WALK.
  -- custom.read_records_page leaves the "shown to" context of this person, organization and Table in the statement
  -- memo ('custom.visible_predicate_listed:<person>:<organization>:<Table>') around its one call here; then the
  -- predicate below is ANDed with platform.shown_to_lists over the row's own columns and that context - exactly
  -- the filter custom.query_visible_ids puts on every row it lists. Nobody else leaves the key, so every other
  -- caller (custom.assert_may_know_table, custom.visible_record_ids, the parity censuses) gets the open predicate
  -- alone, word for word as before.
  if p_table_id is not null then
    v_lctx := nullif(platform.memo_k_get('custom.visible_predicate_listed:' || p_user::text || ':'
                                         || p_organization_id::text || ':' || p_table_id::text), '');
  end if;

  if v_set.o_fallback then
    -- THE PER-ROW LADDER, verbatim — the same sentence the two doors fall back to.
    v_out := format('custom.has_visibility(%L::uuid, ''record'', %s.id, %L::public.permission_level)',
                    p_user, v_alias, p_required);
  elsif v_set.o_all_visible then
    v_out := 'true';
  else
    v_out := format(
    '(%s.created_by = %L::uuid'
    ' or (%s.visibility = any (%L::platform.visibility[]) and not (%s.id = any (%L::uuid[])))'
    ' or %s.id = any (%L::uuid[])'
    ' or %s.id = any (%L::uuid[]))',
    v_alias, p_user,
    v_alias, v_set.o_true_visibility, v_alias, v_set.o_granted_all,
    v_alias, v_set.o_granted_visible,
    v_alias, v_set.o_carried_visible);
  end if;

  if v_lctx is null then
    return v_out;
  end if;
  return format('((%s) and platform.shown_to_lists(%s.shown_to, %s.visibility, %s.created_by, %s.organization_id, %L::uuid, %L::jsonb))',
                v_out, v_alias, v_alias, v_alias, v_alias, p_user, v_lctx);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.read_records_page(p_organization_id uuid, p_table_id uuid, p_filter jsonb DEFAULT '{}'::jsonb, p_search text DEFAULT NULL::text, p_sort jsonb DEFAULT '[]'::jsonb, p_view_id uuid DEFAULT NULL::uuid, p_by_id boolean DEFAULT false, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_time_zone text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me        uuid := auth.uid();
  v_level     public.permission_level;
  v_mask      jsonb;
  v_visible   text[];
  v_computed  text[];
  v_choices   jsonb;
  v_limit     integer;
  v_offset    integer := greatest(coalesce(p_offset, 0), 0);
  v_where     text;
  v_order     text := '';
  v_term      text := nullif(btrim(coalesce(p_search, '')), '');
  v_sort      jsonb;
  v_key       text;
  v_dir       text;
  v_as        text;
  v_expr      text;
  v_labels    jsonb;
  v_view      record;
  v_positions jsonb := null;
  v_total     bigint;
  v_ids       uuid[];
  v_rows      jsonb;
  v_ignored   jsonb := '[]'::jsonb;
  v_plain     boolean;   -- CHAIR-ACCESS b: a page that asks nothing of the rows' values
  -- HOT-DOORS-3 (2026-10-08)
  v_new       boolean := coalesce(current_setting('mx.read_page_set', true), '') <> 'off';
  v_ctx       jsonb;
  v_listed    text;
  v_ksel      text := '';
  v_kord      text := '';
  v_ki        integer := 0;
begin
  if v_me is null then
    raise exception 'Nobody is signed in, so there is nothing to read.'
      using errcode = '42501',
            hint = 'DOOR-1: the read door resolves the reader from the session and takes no principal argument. Sign in, or call it from a lane that carries a person.';
  end if;
  -- THE ORGANIZATION WALL, THEN THE TABLE — the same two questions, in the same order, that
  -- custom.read_records_matching asks on its first lines.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.read_records_page');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.read_records_page');
  v_limit := custom.page_size(p_organization_id, 'custom.read_records_page', p_limit, 50);

  -- The field question, once: which columns this reader may see (search and sort read ONLY these).
  v_level := custom.effective_level(v_me, p_organization_id, p_table_id);
  v_mask := custom.read_mask_for(v_me, p_organization_id, p_table_id, v_level, 'read');
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_visible
    from jsonb_array_elements(v_mask -> 'visible') x;
  -- A column worked out on every read keeps no value in the record, so nothing can sort by it.
  select coalesce(array_agg(k.key), '{}'::text[]) into v_computed
    from jsonb_each_text(coalesce(v_mask -> 'all_key_ids', '{}'::jsonb)) k
    join custom.record f on f.id = k.value::uuid
   where f.data ->> 'type' = 'formula'
     and coalesce(f.data ->> 'compute_on', 'read') = 'read';
  v_choices := coalesce(custom.choice_field_map(p_organization_id, p_table_id), '{}'::jsonb);

  -- ── the rows this reader may see that answer the question ──
  -- CHAIR-ACCESS b: on a PLAIN page (no search, no filter, no sort, no view) a row of a Confidential
  -- Table this person may not open, but which is listed for her ("Shown to"), is a row of the page
  -- too - as its HEADER only, {id, exists: true, submitted_at} (HR proof gap 4). Never when the page
  -- asks a question of the rows: a search hit, a filter match or a sort position on a row she may
  -- not read would say something about its values.
  v_plain := v_term is null
             and coalesce(p_filter, '{}'::jsonb) = '{}'::jsonb
             and (p_sort is null or jsonb_typeof(p_sort) <> 'array' or jsonb_array_length(p_sort) = 0)
             and p_view_id is null;
  -- HOT-DOORS-3 (2026-10-08): THE LIST FILTER IN THE SAME PASS AS THE PAGE. custom.listed_predicate_sql asks
  -- "is it listed for her" as `r.id in (select from custom.query_visible_ids(..))`: a second walk of the whole
  -- Table (25,000 rows through the "shown to" filter, then hashed) before the page's own walk. For one ordinary
  -- Table that list is, row for row, the rows the open predicate admits (custom.visible_set's answer, the same
  -- memoised answer custom.visible_predicate_sql reads) that are live, not quarantined and "shown to" her
  -- (platform.shown_to_lists with custom._record_shown_to_ctx for this organization and Table); the page's own
  -- WHERE already says live, not quarantined, this organization and this Table. So the page asks
  -- custom.visible_predicate_sql for the open predicate WITH the "shown to" filter (the context handed over in
  -- the statement memo around that one call: 'custom.visible_predicate_listed:<person>:<organization>:<Table>'),
  -- both are asked on the page's one walk, and the context is worked out once for both arms. The Table kernel
  -- (its list has memo branches of its own) and a principal that is not the session's person (the builder
  -- refuses that by name) still go through custom.listed_predicate_sql. mx.read_page_set = off: the page
  -- exactly as before (the proofs compare both on one snapshot).
  if v_new and p_table_id is not null and p_table_id is distinct from custom.table_kernel_id()
     and custom.query_principal() is not distinct from v_me then
    v_ctx := custom._record_shown_to_ctx(array[p_organization_id], p_table_id);
    perform platform.memo_k_put('custom.visible_predicate_listed:' || v_me::text || ':' || p_organization_id::text
                                || ':' || p_table_id::text, v_ctx::text);
    v_listed := custom.visible_predicate_sql(v_me, p_organization_id, p_table_id, 'viewer'::public.permission_level, 'r');
    perform platform.memo_k_put('custom.visible_predicate_listed:' || v_me::text || ':' || p_organization_id::text
                                || ':' || p_table_id::text, '');
  else
    v_listed := custom.listed_predicate_sql(v_me, p_organization_id, p_table_id,
                                            'viewer'::public.permission_level, 'r');
    if v_new and v_plain then
      v_ctx := custom._record_shown_to_ctx(array[p_organization_id], p_table_id);
    end if;
  end if;
  v_where := format($w$
      from custom.record r
     where r.organization_id = %L::uuid
       and r.table_id = %L::uuid
       and r.deleted_at is null
       and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
       and ((%s) or (%s))
       and %s$w$,
    p_organization_id, p_table_id,
    v_listed,
    case when v_plain
         -- (the second argument of shown_to_lists is the row column T-13 retires - a legacy fallback
         -- for rows with no shown_to; this door never read it and does not start now: null)
         then format('custom.confidential_header(%L::uuid, r.id) is not null and platform.shown_to_lists(r.shown_to, null, r.created_by, r.organization_id, %L::uuid, %L::jsonb)',
                     v_me, v_me, coalesce(v_ctx, custom._record_shown_to_ctx(array[p_organization_id], p_table_id)))
         else 'false' end,
    custom.record_filter_sql(p_organization_id, p_table_id,
      case when custom.filter_is_rule(coalesce(p_filter, '{}'::jsonb)) then p_filter
           else custom.choice_filter_normalize(v_choices, coalesce(p_filter, '{}'::jsonb)) end));

  -- ── the search: THE ONE SHARED PREDICATE (CHAIR-GRID). custom.record_search_sql is this door's own older
  -- ILIKE over the visible columns and the choice words, plus the typed matches (a date as a person writes
  -- it, a phone by its digits, an amount as the grid shows it), judged for this reader. custom.record_aggregate
  -- asks the same function with the same arguments, so a footer counts exactly the rows this page shows.
  if v_term is not null then
    v_where := v_where || ' and ' || custom.record_search_sql(p_organization_id, p_table_id, p_search, 'r', p_time_zone);
  end if;

  -- ── the order ──
  if p_sort is not null and jsonb_typeof(p_sort) = 'array' and jsonb_array_length(p_sort) > 0 then
    for v_sort in select s from jsonb_array_elements(p_sort) s loop
      v_key := v_sort ->> 'field';
      v_dir := case when lower(coalesce(v_sort ->> 'direction', 'asc')) = 'desc' then 'desc' else 'asc' end;
      v_as  := lower(coalesce(v_sort ->> 'as', 'text'));
      -- MONITOR-TRIAGE (2026-10-01): a sort on a column this reader cannot see — removed, or masked
      -- from their seat — is SKIPPED and named in `sort_ignored`, never a refused page. Ordering by
      -- it would leak the masked values' order, so it is not applied; the rest of the sort stands.
      if v_key is null or not (v_key = any (v_visible)) then
        v_ignored := v_ignored || to_jsonb(coalesce(v_key, ''));
        continue;
      end if;
      if v_key = any (v_computed) then
        raise exception 'The column "%" is worked out each time it is read, so the store keeps no value to sort the whole table by.', v_key
          using errcode = '0A000',
                hint = 'Sort by one of the columns it is worked out from, or have the column worked out when a record is saved (compute_on: write) so its value is kept. Nothing was read.';
      end if;
      if v_choices ? v_key then
        select coalesce(jsonb_object_agg(o.key, o.value ->> 'label'), '{}'::jsonb) into v_labels
          from jsonb_each(coalesce(v_choices -> v_key -> 'options', '{}'::jsonb)) o;
        v_expr := format('lower(coalesce(%L::jsonb ->> (r.data ->> %L), r.data ->> %L))', v_labels, v_key, v_key);
      elsif v_as in ('number', 'integer') then
        v_expr := format($x$case when (r.data ->> %L) ~ '^-?[0-9]+\.?[0-9]*$' then (r.data ->> %L)::numeric end$x$, v_key, v_key);
      elsif v_as in ('date', 'datetime') then
        -- An ISO date or instant sorts as its own text; anything else is not a date and sorts last.
        v_expr := format($x$case when (r.data ->> %L) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then (r.data ->> %L) end$x$, v_key, v_key);
      else
        v_expr := format('lower(r.data ->> %L)', v_key);
      end if;
      v_order := v_order || v_expr || ' ' || v_dir || ' nulls last, ';
      -- HOT-DOORS-3: the same key, kept beside the id so the page can be taken from the matches without
      -- numbering all of them.
      v_ki := v_ki + 1;
      v_ksel := v_ksel || ', ' || v_expr || ' as k' || v_ki;
      v_kord := v_kord || 'm.k' || v_ki || ' ' || v_dir || ' nulls last, ';
    end loop;
    -- Every key skipped: the read door's own order, exactly as if no sort was asked.
    if v_order = '' then
      v_ksel := ', r.created_at as k0';
      v_kord := 'm.k0 desc, m.id';
    else
      v_kord := v_kord || 'm.id';
    end if;
    v_order := case when v_order = '' then 'r.created_at desc, r.id' else v_order || 'r.id' end;
  elsif p_view_id is not null then
    select sv.* into v_view from platform.saved_view sv
     where sv.id = p_view_id and sv.organization_id = p_organization_id
       and sv.surface_key = 'custom/records' and sv.deleted_at is null
       and coalesce(sv.subject_id, nullif(sv.definition ->> 'table_id', '')::uuid) = p_table_id;
    if v_view.id is null then
      raise exception 'There is no such saved view on this table.' using errcode = '23503',
              hint = 'It may have been removed, or it may belong to another table or organization. Nothing was read.',
            detail = jsonb_build_object('view_id', p_view_id)::text;
    end if;
    if v_view.definition ->> 'order' is distinct from 'manual' then
      raise exception 'This view is ordered by its sort, not by hand.' using errcode = '22023',
        hint = 'Ask for its sort in p_sort instead of naming the view. Nothing was read.';
    end if;
    v_positions := coalesce(v_view.metadata -> 'record_positions', '{}'::jsonb);
    v_order := '($1 ->> r.id::text)::numeric nulls last, r.created_at, r.id';
    v_ksel := ', ($1 ->> r.id::text)::numeric as k1, r.created_at as k2';
    v_kord := 'm.k1 nulls last, m.k2, m.id';
  else
    -- No question about order: the read door's own order.
    v_order := 'r.created_at desc, r.id';
    v_ksel := ', r.created_at as k0';
    v_kord := 'm.k0 desc, m.id';
  end if;

  -- HOT-DOORS (2026-10-08): THE COUNT AND THE PAGE IN ONE PASS. The rows the page may show are found once
  -- (every predicate above, the visible-set walk inside it included) and both the total and this page's ids
  -- are read from that one set. Asked as two statements, custom.query_visible_ids walked the whole Table
  -- twice per page (a 25,000-row Table: 2 x 25,000 rows through the "shown to" filter). Same total, same
  -- ids in the same order. mx.read_page_one_pass = off: the two statements as before (the proofs compare
  -- both on one snapshot).
  if v_new and coalesce(current_setting('mx.read_page_one_pass', true), '') <> 'off' then
    -- HOT-DOORS-3 (2026-10-08): ONLY THE PAGE IS SORTED. The matches are found once, each with the keys it is
    -- ordered by; the total counts them and the page is the first v_limit after v_offset in that order (a
    -- top-N sort), instead of numbering every match with row_number() (a full sort of all 25,000) to keep
    -- 50. Every order ends in the row's id, so the order is total and the page holds the same ids in the
    -- same order.
    execute format('with m as materialized (select r.id%s %s) '
                   'select (select count(*) from m), '
                   'array(select m.id from m order by %s limit %s offset %s)',
                   v_ksel, v_where, v_kord, v_limit, v_offset)
       into v_total, v_ids
      using v_positions;
    if cardinality(v_ids) = 0 then
      v_ids := null;
    end if;
  elsif coalesce(current_setting('mx.read_page_one_pass', true), '') = 'off' then
    execute 'select count(*) ' || v_where into v_total;

    execute format('select array_agg(q.id order by q.n) from (select r.id, row_number() over (order by %s) as n %s order by n limit %s offset %s) q',
                   v_order, v_where, v_limit, v_offset)
       into v_ids
      using v_positions;
  else
    execute format('with m as materialized (select r.id, row_number() over (order by %s) as n %s) '
                   'select (select count(*) from m), '
                   '(select array_agg(q.id order by q.n) from (select m.id, m.n from m order by m.n limit %s offset %s) q)',
                   v_order, v_where, v_limit, v_offset)
       into v_total, v_ids
      using v_positions;
  end if;

  if v_ids is null then
    v_rows := '[]'::jsonb;
  else
    -- CHAIR-ACCESS b: an id the read door does not open is a header row (a Confidential row this
    -- person is not named on); an id that is neither is simply not a row of the page.
    select coalesce(jsonb_agg(x.row order by x.n), '[]'::jsonb)
      into v_rows
      from (select o.n,
                   case when d.id is not null
                        then jsonb_build_object('id', d.id, 'document', d.document, 'level', d.level)
                        when h.hdr is not null
                        then jsonb_build_object('id', o.rid, 'document', h.hdr, 'level', null) end as row
              from unnest(v_ids) with ordinality o(rid, n)
              left join custom.read_records_by_ids(p_organization_id, p_table_id, v_ids, coalesce(p_by_id, false)) d on d.id = o.rid
              -- HOT-DOORS-3: the header is asked only of an id the read door did not open (it was asked of every
              -- id of the page and then thrown away: 50 calls, ~26 ms).
              left join lateral (select custom.confidential_header(v_me, o.rid) as hdr
                                  where d.id is null or not v_new) h on d.id is null) x
     where x.row is not null;
  end if;

  return jsonb_build_object('total', v_total, 'limit', v_limit, 'offset', v_offset, 'rows', v_rows,
                            'sort_ignored', v_ignored);
end;
$function$;
