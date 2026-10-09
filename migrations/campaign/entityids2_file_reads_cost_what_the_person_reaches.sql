-- lane: ENTITY-IDS-2 (Unified Data program)
-- based-on: iam.accessible_child_parents(text) 389d69f4eae6a15d4533816836e77833ede24553d590b77b2855de73214ac5a9
-- based-on: iam.accessible_entity_ids(text, permission_level, integer, boolean) 85e54adb3a55d752caae4626f47e5aa15f9922c68ecaded9fa19708605073cfe
-- based-on: iam.has_access_for_many_in(uuid, uuid[], uuid[], text, text) e049a33bae07af8eadfb16277025425f5275259eb43eec3d10bc797110738416
-- based-on: platform.kernel_equivalence_answers() a211d1f793b278432333417b5ee186d4d30259937e2d8b73a7b3572dde86ebc0
-- based-on: platform.kernel_equivalence_expected() 3a4144b2500c6139d58f62e159a775f314e953a146dfc9148e6feb8e072f7773
-- based-on: iam.kernel_shadow_sweep(integer, integer) 1eaf3aee6e6d1ec0ee4998f6a74b5f189ede44c8e50a4bb9f1c96480db3cdccb
-- based-on: iam.kernel_memo_compare(integer, integer) 0e2798cfc1467ab9eac5722eba356b0c735755dcd4d42df652d032577ee2f07f
-- based-on: iam.entity_read_kernel_expected() 07a8782d4111dd824f389114e84f98e6e24259bb6e7d8df5c080d862e9077fe2
-- based-on: iam.entity_read_kernel_members_expected() 7c1ff66ae061349953efd752c4c40f9feae4b1ad3e2c4a6ec4123fcd73ed58d2
-- lock: iam, platform
--
-- ENTITY-IDS-2 (2026-10-08): A FILE READ COSTS WHAT THE PERSON CAN REACH, NOT EVERY RECORD-PARENTED FILE ON THE PLATFORM.
--
-- WHY. entityids_a asked the access kernel about every record id any file on the platform names, on every files
-- query and every files component policy read (~0.8 ms an id). Measured 2026-10-08 on live with synthetic
-- record-parented files across ~1,500 organizations (rolled back): test@test.com's newest-50 file page 0.3 s at 1,000,
-- 10.4 s at 10,000, 16.6 s at 20,000. And the knob access/child_parent_asks_ids could be set to {"types": []} while such
-- files exist, which lists every record a person reaches before any file read answers (> 20 s): entityids_a called that
-- a one-statement revert. It is not one.
--
-- THE CHANGE (same answers, no RLS policy and no generator changes):
--  1. iam.accessible_child_parents: for a type the knob lists it returns every parent id the table names, unasked. Its
--     one reader is the child lane iam.entity_read_expr writes, which ANDs it with iam.has_access(<child>, id) on the
--     same row, so the kernel is asked about the rows a query reads, not every parent on the platform.
--  2. iam.accessible_entity_ids (final for every files component policy): only the record ids that could be this
--     person's are asked (new iam.child_parent_records_worth_asking, a superset of what the kernel's set form can say
--     yes to); its child read joins the parent ids as a hashed set instead of `= any(<array>)`.
--  3. iam.has_access_for_many_in: two plan fixes, same answers - the Confidential anchor test reads the Table on its key
--     (the generic plan read every Table of the organization per target, ~1.7 ms each), and the two per-organization
--     admin/member questions are asked only for the person's own (and global-readable) organizations.
--  4. The knob cannot drop a parent type while a child row names it (trigger on platform.feature_knob); its
--     description says so.
--  5. A record-parented-file stratum: platform.kernel_equivalence_answers v3 (two files under the fixture's store rows,
--     asked of the kernel, the files read policy and the file set), iam.kernel_shadow_sweep (sampled or synthetic,
--     rolled back) and iam.kernel_memo_compare (the parent ids files name in a seat's organizations).
-- The kernel fingerprint is re-recorded (33d13ee5c2f25e1462af8d56d0bcea94 -> 5b5ae42d8a6cc11b4df2f1701fe6a800).
--
-- PROOF (2026-10-08, live, rolled back, 20,026 synthetic record-parented files over ~1,480 organizations incl. every
-- Confidential row and one planted cross-organization reader): scripts/campaign-tests/entityids2_file_parents_cost_follows_the_person_proof.sql.
-- See the lane report for the numbers table.
--
-- REVERT: migrations/inverse/entityids2_file_reads_cost_what_the_person_reaches_down.sql.

do $pre$
declare v_chk jsonb;
begin
  if iam.entity_read_kernel_fingerprint() is distinct from '33d13ee5c2f25e1462af8d56d0bcea94' then
    raise exception 'entityids2: the live access-kernel fingerprint is % but this file was proved against 33d13ee5c2f25e1462af8d56d0bcea94; re-derive the file.', iam.entity_read_kernel_fingerprint();
  end if;
  v_chk := platform.kernel_equivalence_check();
  if not coalesce((v_chk->>'ok')::boolean, false) or (v_chk->>'lost')::int <> 0 or (v_chk->>'gained')::int <> 0 or (v_chk->>'missing')::int <> 0 then
    raise exception 'entityids2: the kernel equivalence check is not ok before this file: %', v_chk - 'answers';
  end if;
end $pre$;

CREATE OR REPLACE FUNCTION iam.has_access_for_many_in(p_person uuid, p_targets uuid[], p_orgs uuid[], p_level text, p_type text DEFAULT 'record'::text)
 RETURNS TABLE(target uuid, allowed boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- HOT-DOORS-6 (2026-10-09). iam.has_access_for_many WITH THE ORGANIZATION EACH TARGET LIVES IN, when the
-- caller already holds it (p_orgs, parallel to p_targets; null, shorter, or a null element = not known). It is
-- a HINT, never a filter, exactly like custom.record_org_hint: a target found in its hinted organization is
-- read there (one partition of custom.record instead of sixteen: ~280 ms -> ~10 ms for admin@admin.com's 1,537
-- Tables); a target not found there, or with no hint, is read by id alone as before. A hinted hit counts as
-- the one row carrying that id - the same trust the kernel's own hinted row read (KERNEL-ORG-PRUNE) gives it,
-- true while record ids are unique across organizations (no constraint enforces it; KERNEL.md says so).
-- iam.has_access_for_many is this function with no hints, so the two never drift apart.
--
-- KERNEL-SHADOW (2026-10-07). THE SET FORM OF THE ACCESS KERNEL: one row per distinct non-null
-- target, `allowed` = iam.has_access_for(p_person, p_type, target, p_level) — the same answer,
-- resolved once for the whole set instead of once per target. The rule it implements, lane by lane,
-- is common-docs/systems/platform/access/KERNEL.md. It is SHADOW ONLY until Arman decides the swap:
-- iam.has_access_for_shadow asks both forms and returns the old one.
--
-- WHAT IS SET-BASED. The person is resolved once (organizations, admin seats, store switch,
-- member-lane level per organization and Table). The target rows are read in ONE statement. Grants,
-- record memberships, scope assignments and Library grants are one semi-join each over the set.
-- Every clock clause (a grant's expiry) is the statement's own now().
--
-- WHAT IS NOT, AND GOES TO THE ONE-AT-A-TIME KERNEL (iam.has_access_for, unchanged), so the answer is
-- the kernel's by construction:
--   * every type but `record` (the hot path; other types are a later wave, KERNEL.md § Waves);
--   * the whole call, when the registry no longer says what this body assumes about `record`
--     (a reference gate, an owner-only trash rule, a detail or child pointer, a containment or
--     composition parent, or a class whose "Only me" rows do not open to the organization);
--   * one target, when its id is carried by more than one row, when it sits in a global-readable
--     system organization (those arms read the row column T-13 retires, which this body may not), or
--     when platform.reachability holds a container for it.
-- A Confidential row is answered by custom.confidential_answer itself, exactly as the kernel asks it.
--
-- THE PUBLIC LANE: the kernel asks the row column T-13 retires (= 'public'), which this body may not
-- read. A row published_to_web marks, that no other lane opens, is asked of the kernel (KERNEL-SHADOW h).
-- Known one-way gap, fail-closed: a row the kernel would open ONLY because its row column says public
-- while published_to_web says false (possible only with the T-13 dual-write trigger bypassed) is
-- refused here; the shadow and the sweep report it as a disagreement.
declare
  v_req     public.permission_level;
  v_lanes   platform.lane_set;
  v_set_ok  boolean;
  v_pcm     text;  -- HOT-DOORS-4
begin
  if p_targets is null or cardinality(p_targets) = 0 then
    return;
  end if;
  -- KERNEL-SHADOW h: a NULL level is NOT viewer - the kernel answers a NULL level its own way (owner and
  -- organization admins only), so a NULL level, like a NULL or non-record type, goes to the kernel.
  v_req := p_level::public.permission_level;

  if p_person is null then
    return query select distinct x, false from unnest(p_targets) x where x is not null;
    return;
  end if;

  -- The registry facts this body is written against, asked of the same functions the kernel asks.
  v_set_ok := coalesce(p_type = 'record' and v_req is not null
    and exists (select 1 from platform.entity_types et
                 where et.token = 'record' and et.is_active
                   and et.schema_name = 'custom' and et.table_name = 'record'
                   and et.rls_variant is distinct from 'detail')
    and platform.reference_gate_columns('record') is null
    and not coalesce(platform.trash_is_owner_only('record'), false)
    and platform.detail_parent_columns('record') is null
    and platform.child_parent_columns('record') is null
    and not exists (select 1 from platform.entity_relationships er
                     where er.child_type = 'record' and er.kind in ('composition', 'containment'))
    and coalesce(iam.personal_opens_row('record', 'custom', 'record', null), false), false);

  if not v_set_ok then
    return query
      select u.x, coalesce(iam.has_access_for(p_person, p_type, u.x, v_req), false)
        from (select distinct x from unnest(p_targets) x where x is not null) u(x);
    return;
  end if;

  v_lanes := iam.class_lanes('record');

  -- HOT-DOORS-4 (2026-10-08): one cached plan per statement of this call (partitions pruned at run time) instead of
  -- a custom plan per call; put back when it returns. A plan choice, never an answer.
  if iam.kernel_batch_on(p_person) then
    v_pcm := pg_catalog.current_setting('plan_cache_mode');
    perform pg_catalog.set_config('plan_cache_mode', 'force_generic_plan', true);
  end if;
  return query
  with
  t as materialized (
    -- an id handed two different organizations gets no hint (read by id alone, as before)
    select u.x as id, case when count(distinct u.o) = 1 then min(u.o::text)::uuid end as hint
      from unnest(p_targets, p_orgs) u(x, o)
     where u.x is not null
     group by u.x
  ),
  -- The person, once.
  my_orgs as materialized (
    select distinct om.organization_id as org
      from iam.organization_member om
     where om.user_id = p_person
  ),
  global_orgs as materialized (
    select s.organization_id as org from iam.system_orgs s where s.global_readable
  ),
  -- The rows, once.
  -- HOT-DOORS-6: a hinted target read in its organization; every other target read by id alone, as before
  hit as materialized (
    select t.id, r.organization_id as org, r.created_by as owner, r.published_to_web as pub, r.table_id as tbl
      from t
      join custom.record r on r.organization_id = t.hint and r.id = t.id
     where t.hint is not null
  ),
  w as materialized (
    select h.id, h.org, h.owner, h.pub, h.tbl, 1::bigint as n_rows
      from hit h
    union all
    select t.id,
           r.organization_id as org,
           r.created_by      as owner,
           r.published_to_web as pub,
           r.table_id        as tbl,
           count(r.id) over (partition by t.id) as n_rows
      -- HOT-DOORS-6 b: the targets no hint found, as one hashed set difference (a per-row NOT EXISTS over the
      -- materialized hit list was planned as a nested loop: 1,855 x 928 comparisons, ~360 ms for admin@admin.com)
      from (select t2.id from t t2 except select h.id from hit h) t
      left join custom.record r on r.id = t.id
  ),
  -- Per organization the targets live in: archived, admin seat, member access, store switch.
  orgs as materialized (
    select o.org,
           exists (select 1 from iam.organizations x where x.id = o.org and x.archived_at is not null) as archived,
           -- ENTITY-IDS-2: both answer no outside the person's organizations (and, for has_org_access_for, the
           -- global-readable ones), so they are asked only there (~1.2 ms per organization otherwise)
           case when o.org in (select m.org from my_orgs m) then public.is_org_admin_for(p_person, o.org) else false end as is_admin,
           case when o.org in (select m.org from my_orgs m) or o.org in (select g.org from global_orgs g)
                then iam.has_org_access_for(p_person, o.org) else false end as has_access,
           custom.store_is_open(o.org)              as store_open
      from (select distinct w.org from w where w.org is not null and w.n_rows = 1) o
  ),
  -- Per target: the semi-joins.
  x as materialized (
    select w.id, w.org, w.owner, w.pub, w.tbl, w.n_rows,
           o.archived, o.is_admin, o.has_access, o.store_open,
           (w.org in (select g.org from global_orgs g)) as in_global_org,
           exists (select 1 from platform.reachability rc
                    where rc.item_type = 'record' and rc.item_id = w.id) as has_container,
           -- the Confidential anchor is provably absent when no row of class `record` carries the
           -- id, or exactly one does whose Table is not Confidential and whose document names no
           -- parent (custom.confidential_anchor's own loop stops at that first row)
           (select count(c.id) = 0
                   or (count(c.id) = 1
                       and not coalesce(bool_or((select ct.data ->> 'level' from custom.record ct
                                                  where ct.organization_id = c.organization_id and ct.id = c.table_id
                                                    and ct.table_id = custom.table_kernel_id()) = 'confidential'), false)
                       and not coalesce(bool_or(jsonb_typeof(c.data -> 'parent_id') = 'string'), false))
              from custom.record c
             -- ENTITY-IDS-2: the Table read on its key (a scalar subquery, at most one row, the same answer as the
             -- left join it replaces); as a join the generic plan read every Table of the organization per target
             -- (~1.7 ms each)
             where c.organization_id = w.org and c.id = w.id and c.data_class = 'record') as anchor_free,
           exists (select 1 from platform.entity_grants eg
                    where eg.entity_type = 'record' and eg.entity_id = w.id) as has_library_row,
           -- public.has_permission_for, as a semi-join
           exists (select 1 from iam.permissions p
                    where p.resource_type = 'record' and p.resource_id = w.id
                      and coalesce(p.status, 'active') <> 'rejected'
                      and (p.expires_at is null or p.expires_at > now())
                      and (p.granted_to_user_id = p_person
                           or (p.granted_to_organization_id is not null
                               and p.granted_to_organization_id in (select m.org from my_orgs m)))
                      and case v_req
                            when 'viewer' then p.permission_level in ('viewer', 'commenter', 'edit_content', 'editor', 'admin')
                            when 'commenter' then p.permission_level in ('commenter', 'edit_content', 'editor', 'admin')
                            when 'edit_content' then p.permission_level in ('edit_content', 'editor', 'admin')
                            when 'editor' then p.permission_level in ('editor', 'admin')
                            when 'admin' then p.permission_level = 'admin'
                          end) as grant_hit,
           -- iam.grant_addressed_level(...) is not null: a grant addressed to this person speaks
           -- for this row, so the member lane's default does not (VIS-19)
           exists (select 1 from iam.permissions p
                    where p.resource_type = 'record' and p.resource_id = w.id
                      and p.status <> 'rejected'
                      and (p.expires_at is null or p.expires_at > now())
                      and coalesce(p.is_public, false) = false
                      and (p.granted_to_user_id = p_person
                           or p.granted_to_organization_id in (select m.org from my_orgs m))
                      and p.permission_level is not null) as addressed,
           -- a record membership (iam.membership_grant)
           exists (select 1 from iam.memberships m
                     join iam.membership_grant g
                       on g.member_role = m.role and g.container_type in ('record', '*')
                    where m.container_type = 'record' and m.container_id = w.id
                      and m.user_id = p_person and m.deleted_at is null
                      and g.confers >= v_req) as membership_hit,
           -- public._edu_can_read_via_assignment (the record arm)
           exists (select 1 from platform.associations_live a
                     join iam.memberships m
                       on m.container_type = 'scope' and m.container_id = a.target_id
                      and m.user_id = p_person and m.status = 'active' and m.deleted_at is null
                    where a.source_type = 'record' and a.source_id = w.id
                      and a.target_type = 'scope' and a.role = 'assignment') as edu_hit
      from w
      left join orgs o on o.org = w.org
  ),
  -- Which targets this body answers, and which still need the member lane's level.
  y as materialized (
    select x.*,
           (x.n_rows > 1 or x.in_global_org or x.has_container) as to_kernel,
           case when x.n_rows = 1 and not x.archived and not x.anchor_free
                     and not x.in_global_org and not x.has_container
                then custom.confidential_answer(p_person, x.id, v_req) end as conf
      from x
  ),
  early as materialized (
    select y.*,
           coalesce(y.n_rows = 1 and not y.to_kernel and not y.archived and y.conf is null
            and (
              (v_req = 'viewer' and y.has_library_row
                 and (public.user_can_read_via_library_grant(p_person, 'record', y.id)
                      or public.library_is_open('record', y.id)))
              or y.owner = p_person
              or y.grant_hit
              or y.membership_hit
              or (v_req = 'viewer' and y.edu_hit)
              or (v_lanes.org_role_lane and y.is_admin)
              or (v_lanes.org_member_lane and y.has_access and not y.store_open
                  and v_req <= 'editor'::public.permission_level)
            ), false) as early_yes  -- a row with no creator makes `owner = p_person` null, never yes
      from y
  ),
  -- The member lane's level (iam.member_lane_confers), per organization and Table, asked only
  -- where nothing earlier answered and only where the kernel itself would reach that arm.
  confers as materialized (
    select q.org, q.tbl,
           iam.member_lane_confers(p_person, q.org, 'record', null, q.tbl, true) as lvl
      from (select distinct e.org, e.tbl from early e
             where e.n_rows = 1 and not e.to_kernel and not e.archived and e.conf is null
               and not e.early_yes
               and not (v_req = 'viewer' and e.pub)
               and v_lanes.org_member_lane and e.has_access and e.store_open
               and not e.addressed) q
  )
  -- KERNEL-SHADOW h: one row per target (an id two rows carry is asked of the kernel once).
  select distinct on (e.id) e.id,
         case
           when e.to_kernel then coalesce(iam.has_access_for(p_person, 'record', e.id, v_req), false)
           when e.n_rows = 0 then false
           when e.archived then false
           when e.conf is not null then e.conf
           when e.early_yes then true
           -- KERNEL-SHADOW h: the public lane is never granted on published_to_web alone. A row it
           -- would open, and nothing else opens, is asked of the kernel, which reads the row column
           -- itself - so a row written with the T-13 dual-write trigger bypassed answers exactly as before.
           when v_req = 'viewer' and e.pub then coalesce(iam.has_access_for(p_person, 'record', e.id, v_req), false)
           else coalesce(
                  v_lanes.org_member_lane and e.has_access and e.store_open and not e.addressed
                  and v_req <= (select c.lvl from confers c
                                 where c.org = e.org and c.tbl is not distinct from e.tbl),
                  false)
         end
    from early e
   order by e.id;
  if v_pcm is not null then
    perform pg_catalog.set_config('plan_cache_mode', v_pcm, true);
  end if;
end;
$function$;
CREATE OR REPLACE FUNCTION iam.child_parent_records_worth_asking(p_person uuid, p_ids uuid[], p_orgs uuid[])
 RETURNS TABLE(pid uuid, org uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  -- ENTITY-IDS-2 (2026-10-08): OF THE STORE RECORD IDS CHILD FILES NAME (p_ids, each with the organization its file
  -- names in p_orgs), THE ONES ANY LANE OF THE ACCESS KERNEL COULD OPEN TO THIS PERSON. A superset of what
  -- iam.has_access_for_many_in answers yes: its lanes, in its own words, each widened to "could". Every id left out is
  -- one the kernel answers no, so iam.accessible_entity_ids asks the kernel about these only and gets the same set.
  -- Kept: the row is not in the organization its file names (read by id, like the kernel); its organization is one
  -- of the person's (archived or not) or global-readable; they made it; it is published; it has a container
  -- (platform.reachability), a Library row, a grant on it or its Table to them or one of their organizations, a
  -- membership of theirs, or a scope assignment; it names a parent row; or its Table is Confidential and they own the
  -- Table or the row's document carries one of their names (account, a team they are on, a Person row that is theirs).
  -- Proof: scripts/campaign-tests/entityids2_file_parents_cost_follows_the_person_proof.sql.
  with n as (
    select distinct on (u.pid) u.pid, u.org from unnest(p_ids, p_orgs) u(pid, org) where u.pid is not null
  ),
  mine as materialized (select om.organization_id as org from iam.organization_member om where om.user_id = p_person
                        union select s.organization_id from iam.system_orgs s where s.global_readable),
  names as materialized (
    select p_person::text as nm
    union select m.container_id::text from iam.memberships m
           where m.container_type = 'team' and m.user_id = p_person and m.deleted_at is null
    union select pr.id::text from custom.record pr
           where pr.table_id = '11111111-0000-4000-8000-000000000005'::uuid
             and pr.data @> jsonb_build_object('user_id', p_person::text)),
  -- the registry facts iam.has_access_for_many_in is written against; when one fails it hands the whole call to the
  -- one-at-a-time kernel, and so does this: every id is kept
  set_ok as materialized (
    select coalesce(exists (select 1 from platform.entity_types et
                             where et.token = 'record' and et.is_active and et.schema_name = 'custom'
                               and et.table_name = 'record' and et.rls_variant is distinct from 'detail')
      and platform.reference_gate_columns('record') is null
      and not coalesce(platform.trash_is_owner_only('record'), false)
      and platform.detail_parent_columns('record') is null
      and platform.child_parent_columns('record') is null
      and not exists (select 1 from platform.entity_relationships er
                       where er.child_type = 'record' and er.kind in ('composition', 'containment')), false) as ok
  ),
  r as (
    select n.pid, n.org, x.organization_id as rorg, x.created_by, x.published_to_web, x.table_id, x.data
      from n left join custom.record x on x.organization_id = n.org and x.id = n.pid
  )
  select r.pid, r.org from r
   where not (select s.ok from set_ok s)
      or r.rorg is null
      or r.rorg in (select m.org from mine m)
      or r.created_by = p_person
      or r.published_to_web
      or jsonb_typeof(r.data -> 'parent_id') = 'string'
      or exists (select 1 from platform.reachability rc where rc.item_type = 'record' and rc.item_id = r.pid)
      or exists (select 1 from platform.entity_grants eg where eg.entity_type = 'record' and eg.entity_id = r.pid)
      or exists (select 1 from iam.permissions g
                  where g.resource_type = 'record' and g.resource_id in (r.pid, r.table_id)
                    and (g.granted_to_user_id = p_person
                         or g.granted_to_organization_id in (select om.organization_id from iam.organization_member om
                                                              where om.user_id = p_person)))
      or exists (select 1 from iam.memberships m
                  where m.container_type = 'record' and m.container_id = r.pid and m.user_id = p_person)
      or exists (select 1 from platform.associations_live a
                  where a.source_type = 'record' and a.source_id = r.pid and a.target_type = 'scope' and a.role = 'assignment')
      or exists (select 1 from custom.record t
                  where t.organization_id = r.rorg and t.id = r.table_id and t.table_id = custom.table_kernel_id()
                    and t.data ->> 'level' = 'confidential'
                    and (t.created_by = p_person
                         or exists (select 1 from names nm where strpos(r.data::text, nm.nm) > 0)));
$function$;
insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
                                          non_client_lane, signed_in_callers, anonymous_callers)
values ('iam', 'child_parent_records_worth_asking', 'p_person uuid, p_ids uuid[], p_orgs uuid[]',
        array['uuid'::regtype, 'uuid[]'::regtype, 'uuid[]'::regtype]::oid[],
        'p_person is the caller iam.accessible_entity_ids already resolved (auth.uid()); p_ids are record ids files.files names and p_orgs their files'' organizations, only narrowed (a subset is returned, never widened); null person keeps nothing but rows not found.',
        'entityids2_file_reads_cost_what_the_person_reaches.sql',
        'server_only: called only inside iam.accessible_entity_ids (the files set form) to choose which parent ids to ask the kernel about; no client calls it.',
        false, false);

CREATE OR REPLACE FUNCTION iam.accessible_child_parents(p_child_type text)
 RETURNS TABLE(parent_type text, parent_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_cols text[];
  v_schema text; v_table text; v_ptype text;
  v_uid uuid := auth.uid();
  -- ENTITY-IDS (2026-10-08): parent types asked by the ids present (see the loop).
  v_ask_types text[]; v_knob jsonb; v_cols_ask text[]; v_has_org boolean;
begin
  if v_uid is null then return; end if;
  v_cols := platform.child_parent_columns(p_child_type);
  if v_cols is null then return; end if;
  select et.schema_name, et.table_name into v_schema, v_table
  from platform.entity_types et where et.token = p_child_type and et.is_active;
  if v_schema is null then return; end if;
  select exists (select 1 from pg_catalog.pg_attribute a
                  where a.attrelid = format('%I.%I', v_schema, v_table)::regclass
                    and a.attname = 'organization_id' and not a.attisdropped) into v_has_org;
  v_cols_ask := v_cols;
  -- ENTITY-IDS (2026-10-08) / ENTITY-IDS-2: a parent type the knob access/child_parent_asks_ids lists (default:
  -- record) is not enumerated; its ids are the ones this table names (see the loop). The knob cannot drop a type
  -- while a child row names it (trigger platform_feature_knob_child_parent_asks_ids_guard on platform.feature_knob).
  -- mx.child_parent_asks_ids = 'off' (session) forces the enumeration for every type; the proofs compare both.
  begin
    if coalesce(current_setting('mx.child_parent_asks_ids', true), '') = 'off' then
      v_ask_types := '{}'::text[];
    else
      v_knob := platform.knob_resolve('access', 'child_parent_asks_ids', null);
      v_ask_types := case when v_knob ? 'types'
                          then array(select jsonb_array_elements_text(v_knob -> 'types'))
                          else array['record'] end;
    end if;
  exception when others then
    raise warning 'ENTITY-IDS: knob access/child_parent_asks_ids unreadable (%); record parents are asked by the ids present', sqlerrm;
    v_ask_types := array['record'];
  end;
  for v_ptype in execute format(
      'with recursive d(v) as ('
      || ' (select t.%1$I::text from %2$I.%3$I t where t.%1$I is not null and t.%4$I is not null order by 1 limit 1)'
      || ' union all'
      || ' select (select t.%1$I::text from %2$I.%3$I t where t.%1$I > d.v and t.%4$I is not null order by 1 limit 1)'
      || ' from d where d.v is not null'
      || ') select v from d where v is not null',
      v_cols[1], v_schema, v_table, v_cols[2])
  loop
    continue when v_ptype = p_child_type;
    if v_ptype = any(v_ask_types) then
      -- ENTITY-IDS-2 (2026-10-08): EVERY PARENT ID OF THIS TYPE THE TABLE NAMES, UNASKED. The one reader of this set
      -- is the child lane iam.entity_read_expr writes, and that lane ANDs it with iam.has_access(<child>, id) on the
      -- same row (the kernel walks a child to its parent). So the kernel is asked about exactly the rows a query
      -- reads, and the cost follows those rows instead of every parent named anywhere on the platform (asking about
      -- all of them cost ~0.8 ms each: 16 s for a member's file page at 20,000 record-parented files). Same rows:
      -- every row this lets through still needs the kernel's yes on that row.
      return query execute format(
          'select distinct $1, t.%1$I from %2$s t where t.%3$I = $1 and t.%1$I is not null',
          v_cols_ask[2], format('%I.%I', v_schema, v_table), v_cols_ask[1]) using v_ptype;
      continue;
    end if;
    return query
      select v_ptype, u
      from unnest(iam.accessible_entity_ids(v_ptype, 'viewer'::public.permission_level, 1, true)) u;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION iam.accessible_entity_ids(p_type text, p_required permission_level, p_depth integer, p_include_public boolean)
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- DD-171: containment never carries a personal row (see iam._dd171_containment_filter).

declare
  v_uid uuid := auth.uid();
  v_schema text; v_table text; v_tbl text; v_owner_col text;
  v_has_org boolean; v_has_vis boolean;
  v_parent_ids uuid[]; v_nonpublic_parent_ids uuid[]; v_more uuid[];
  v_trusted text; v_sql text;
  v_ids uuid[] := '{}';
  -- 🚨 DD-175 (2026-09-12) — THE SET FORM ASKS THE SAME QUESTION THE KERNEL ASKS.
  -- iam.has_access_for_base and iam.entity_read_expr both gate the organization and
  -- platform-staff lanes on iam.class_lanes (DD-137b). This function never learned that,
  -- so it returned ids the parent's own policy refuses. On the parent's own std_select that
  -- is harmless — the set is only a CANDIDATE there and iam.has_access confirms every id —
  -- but a generated COMPONENT lane takes this set as FINAL with nothing behind it, so the
  -- component read rows its parent refuses. Measured live, 2026-09-12, before this change:
  -- arman@titaniumsuccess.com read 2,313 docproc.processed_document_pages whose parent
  -- processed_document its own policy refuses; admin@admin.com 106 udt_document_snapshots
  -- and 87 udt_workbook_snapshots; users.credential_attachments leaked all 3 of its rows
  -- under a refused credential_item; workbench.udt_structured_list_items all 15 of its.
  v_lanes platform.lane_set;
  -- 🚨 DD-175e (2026-09-13) — THE `restricted` VARIANT HIDES ITS SOFT-DELETED ROWS AND THIS
  -- FUNCTION DID NOT. iam._apply_rls_unchecked's restricted branch emits std_select with its
  -- own `deleted_at is null and …` prefix (v_delpfx). The set form had no soft-delete arm, so
  -- a component under a restricted parent read rows whose parent the parent's own policy
  -- hides: measured live, admin@admin.com read 101 chat.coding_session_entry rows under one
  -- soft-deleted chat.coding_session. Scoped to `restricted` ON PURPOSE — every other variant
  -- keeps archived rows readable (the archived-items law), and cutting them out here would
  -- empty every archive view on the platform.
  v_soft_deleted_hidden boolean;
  rec record;
  -- AEI-MEMO (2026-09-26): cache each nested parent question within a depth-0
  -- cascade only. The frame is restored before returning, so it cannot leak to
  -- a later policy or caller.
  v_memo_prev text;
  v_memo_key text;
  v_memo jsonb;
  -- Access ladder T-11 leak fixes: the parent lane (platform.child_parent_columns).
  v_child_cols text[]; v_ptype text;
  -- ENTITY-IDS (2026-10-08): parent types asked by the ids present (see the parent lane).
  v_ask_types text[]; v_knob jsonb; v_cols_ask text[]; v_ask_ids uuid[]; v_ask_orgs uuid[];
  -- ACCESS LADDER T-13 2.3e (2026-09-28): the parent cascade's child gate (see the cascade).
  v_child_gate text := '';
begin
  -- ACCESS LADDER T-33 (2026-09-28): every organization-membership read below joins
  -- iam.organizations and skips an ARCHIVED organization, which is closed to its members.
  if v_uid is null then return '{}'::uuid[]; end if;
  -- NOTHING FAILS SILENTLY (2026-10-05). p_depth is the parent cascade's recursion level, not a row limit.
  -- 13 is one past the ceiling: a cascade deeper than 12 parents stops there (answered empty, announced).
  -- Anything larger is a caller passing a limit: announced, and clamped to the ceiling (pass 0 for the full set).
  if p_depth = 13 then
    raise notice 'iam.accessible_entity_ids(%): the parent cascade reached its depth ceiling (12); parents deeper than that are not followed.', p_type;
    return '{}'::uuid[];
  elsif p_depth > 13 then
    raise warning 'iam.accessible_entity_ids(%, depth %): depth is the parent-cascade level, not a row limit; clamped to the ceiling 12. Pass 0 for the full set.', p_type, p_depth;
    p_depth := 12;
  end if;

  -- 🚨 W2-PRED / VIS-N-1 — THE CUSTOM-RECORD ARM, AND NOTHING ELSE IN THIS BODY.
  -- One set-based join per request instead of one function call per row. The knob is the whole
  -- switch: while it resolves false this block falls through and the old body below answers, which
  -- is why the OFF path is the old behaviour rather than a copy of it.
  if p_type = 'record'
     and coalesce(
           platform.knob_resolve('custom', 'accessible_entity_ids_guard', null)::text::boolean,
           false)
  then
    return coalesce(
      (select array_agg(distinct v.id) from custom.visible_record_ids(v_uid, p_required) v),
      '{}'::uuid[]);
  end if;

  select et.schema_name, et.table_name into v_schema, v_table
  from platform.entity_types et
  where et.token = p_type and et.is_active;
  if v_schema is null then return '{}'::uuid[]; end if;
  -- 🚨 RC-A2b (2026-09-25) — A DETAIL'S SET IS WHAT THE KERNEL SAYS, ROW BY ROW. The trusted
  -- arms below read a row's own visibility and organization, which is exactly the answer a
  -- detail (platform.comments) must never get: it listed comments on colleagues' personal notes
  -- to every member. A detail's access is its record's, which only the kernel resolves, so the
  -- set form asks it per row and cannot disagree with it. Cost: one kernel call per detail row;
  -- every client read of a detail goes through a door already filtered to one record.
  if platform.token_is_detail(p_type) then  -- RC-A2e: every declared detail
    execute format('select coalesce(array_agg(t.id), ''{}'') from %I.%I t '
                   'where iam.has_access_for_base($1, $2, t.id, $3, $4)', v_schema, v_table)
      into v_ids using v_uid, p_type, p_required, p_include_public;
    return coalesce(v_ids, '{}'::uuid[]);
  end if;
  v_tbl := format('%I.%I', v_schema, v_table);
  -- 🚨 SCOPES-READS-ACCESS (2026-09-30) — A SCOPE IS LISTED FROM THE RECORD STORE. A scope is the Record of its
  -- context Table under the same id, with the same organization, creator, row level and archive (proved equal for
  -- every scope); the scopes cutover moves the old scopes table to the deprecated, after which the registry's table would
  -- be gone. Every arm below reads only those five columns for this token (it has no containment edge, no child
  -- columns and no reference gate), so the Records stand in for the rows, found Table first through the store's
  -- index. The column questions above still read the old scopes table's catalogue, which names the same five.
  if p_type = 'scope' then
    v_tbl := '(select r.id, r.organization_id, r.created_by, r.visibility, r.deleted_at'
          || ' from custom.record tt join custom.record r on r.organization_id = tt.organization_id and r.table_id = tt.id'
          || ' where tt.table_id = custom.table_kernel_id() and tt.data @> ''{"kept_for": "context"}''::jsonb'
          || ' and r.data_class = ''record'')';
  end if;
  v_lanes := iam.class_lanes(p_type);
  select coalesce(et.rls_variant = 'restricted', false)
         and exists (select 1 from information_schema.columns c
                      where c.table_schema = v_schema and c.table_name = v_table
                        and c.column_name = 'deleted_at')
    into v_soft_deleted_hidden
    from platform.entity_types et where et.token = p_type and et.is_active;
  v_soft_deleted_hidden := coalesce(v_soft_deleted_hidden, false);

  select c.column_name into v_owner_col
  from information_schema.columns c
  where c.table_schema = v_schema and c.table_name = v_table
    and c.column_name in ('created_by', 'owner_id', 'user_id')
  order by case c.column_name
    when 'created_by' then 1 when 'owner_id' then 2 else 3 end
  limit 1;
  select exists (
    select 1 from information_schema.columns c
    where c.table_schema = v_schema and c.table_name = v_table
      and c.column_name = 'organization_id'
  ) into v_has_org;
  select exists (
    select 1 from information_schema.columns c
    where c.table_schema = v_schema and c.table_name = v_table
      and c.column_name = 'visibility'
      and c.udt_schema = 'platform' and c.udt_name = 'visibility'
  ) into v_has_vis;

  v_trusted := case
    when v_owner_col is not null then format('t.%I = $1', v_owner_col)
    else 'false' end;
  if v_has_vis and v_has_org then
    if p_required <= 'editor'::public.permission_level and v_lanes.org_member_lane then
      v_trusted := v_trusted
        || ' or (' || iam.org_lane_visibility_sql(p_type, 't.') || ' and t.organization_id in ('
        || 'select om.organization_id from iam.organization_member om join iam.organizations om_org on om_org.id = om.organization_id and om_org.archived_at is null where om.user_id = $1))';
    elsif p_required > 'editor'::public.permission_level and v_lanes.org_role_lane then
      v_trusted := v_trusted
        || ' or (' || iam.org_lane_visibility_sql(p_type, 't.') || ' and t.organization_id in ('
        || 'select om.organization_id from iam.organization_member om join iam.organizations om_org on om_org.id = om.organization_id and om_org.archived_at is null '
        || 'where om.user_id = $1 and om.role in (''owner'', ''admin'')))';
    end if;
  end if;
  if v_has_org and v_lanes.platform_admin_lane and public.is_super_admin_for(v_uid) then
    if v_has_vis then
      v_trusted := v_trusted
        || ' or (t.organization_id in (select so.organization_id '
        || 'from iam.system_orgs so where so.global_readable)'
        || ' and t.visibility >= ''internal'')';
    elsif not iam.token_is_parented_component(p_type) then
      v_trusted := v_trusted
        || ' or t.organization_id in (select so.organization_id '
        || 'from iam.system_orgs so where so.global_readable)';
    end if;
  end if;
  if p_required = 'viewer'::public.permission_level then
    if p_include_public and v_has_vis then
      v_trusted := v_trusted || ' or t.visibility = ''public''';
      -- 🚨 DD-185 (2026-09-13) — THE SECOND COPY OF THE §6e ARM, and the one the generated
      -- policy's bounded `iam.has_access` lane is asked about. Gated on the same two classes as
      -- the kernel and the mirror: an every-signed-in-user arm is not a lane a `confidential` or
      -- `private` token has. Server-side lists call this function directly, so leaving it here
      -- would have been a safe path beside an unsafe one.
      if v_has_org and v_lanes.resolved_class in ('organization','public') then
        v_trusted := v_trusted
          || ' or (t.visibility >= ''internal'' and t.organization_id in ('
          || 'select so.organization_id from iam.system_orgs so where so.global_readable))';
      end if;
    end if;
    -- 🚨 DD-136b (2026-09-12) — THE THIRD COPY OF THE ORG-ADMIN LANE.
    -- Unguarded, it handed an organization's admins every id in the
    -- organization at viewer, including `personal` rows, and a component's
    -- generated read lane takes this set as final with no has_access behind it.
    -- Guarded to match iam.has_access_for_base and iam.entity_read_expr; a
    -- parented component still gets nothing by role here, because its access is
    -- its parent's (db-rules §6d-1).
    if v_has_org and v_has_vis and v_lanes.org_role_lane then
      v_trusted := v_trusted
        || ' or (' || iam.org_lane_visibility_sql(p_type, 't.') || ' and t.organization_id in ('
        || 'select om.organization_id from iam.organization_member om join iam.organizations om_org on om_org.id = om.organization_id and om_org.archived_at is null '
        || 'where om.user_id = $1 and om.role in (''owner'', ''admin'')))';
    elsif v_has_org and v_lanes.org_role_lane and not iam.token_is_parented_component(p_type) then
      v_trusted := v_trusted
        || ' or t.organization_id in (select om.organization_id '
        || 'from iam.organization_member om join iam.organizations om_org on om_org.id = om.organization_id and om_org.archived_at is null where om.user_id = $1 '
        || 'and om.role in (''owner'', ''admin''))';
    end if;
  end if;

  -- ACCESS LADDER (2026-09-28): an Organization table with no visibility column opens to every member,
  -- exactly as iam.has_access_for_base's member lane admits it (personal_opens_row); the generated
  -- policy carries the same arm (iam.entity_read_expr).
  if v_has_org and not v_has_vis and v_schema <> 'custom' and v_lanes.org_member_lane
     and v_lanes.resolved_class = 'organization' and p_required <= 'editor'::public.permission_level
     and not iam.token_is_parented_component(p_type) then
    v_trusted := v_trusted || ' or (t.organization_id in (select om.organization_id from iam.organization_member om '
      || 'join iam.organizations om_org on om_org.id = om.organization_id and om_org.archived_at is null '
      || 'where om.user_id = $1)'
      || case when platform.child_parent_columns(p_type) is null then ''
              else format(' and t.%I is null', (platform.child_parent_columns(p_type))[1]) end
      || case when platform.row_class_column(p_type) is null then ''
              else format(' and coalesce(t.%I::text, ''organization'') not in (''private'', ''confidential'')',
                          platform.row_class_column(p_type)) end
      || ')';
  end if;
  -- ACCESS LADDER T-33 (2026-09-28): nothing in an archived organization is trusted — not even its
  -- author's or its public rows (the same question as the org_open_gate policy).
  if v_has_org then
    v_trusted := '(t.organization_id is null or t.organization_id not in (select o.id from iam.organizations o '
      || 'where o.archived_at is not null)) and (' || v_trusted || ')';
  end if;
  v_sql := format(
    'select coalesce(array_agg(t.id), ''{}'') from %s t where %s',
    v_tbl, v_trusted
  );
  execute v_sql into v_ids using v_uid;
  v_ids := coalesce(v_ids, '{}'::uuid[]);

  -- Candidate lanes. THE ANTIJOIN IS HASHED, NEVER `= any(<param array>)`:
  -- a param array is not a Const, so PostgreSQL cannot use a hashed
  -- ScalarArrayOpExpr and falls back to a linear scan of the array PER ROW.
  -- Against v_ids of 32,697 that is what made this function quadratic.
  for rec in
    with have as materialized (select iam.unnest_uuids(v_ids) as id),
    -- AEI-REACH survives this rebase: ask the kernel once per distinct container,
    -- then still confirm every candidate row with the kernel below.
    reach_cand as materialized (
      select r.item_id, r.container_type, r.container_id
      from platform.reachability r
      where r.item_type = p_type and r.max_level >= p_required
        and not exists (select 1 from have h where h.id = r.item_id)
    ),
    reach_containers as materialized (
      select distinct rc.container_type, rc.container_id from reach_cand rc
    ),
    -- 1320: THE KERNEL IS ASKED ONLY ABOUT CONTAINERS THAT COULD CONVEY. Before this, every distinct
    -- container of every reachability row outside the caller's own set was walked by the kernel —
    -- 3,540 file containers (~2.2 ms each) for admin@admin.com on processed_document, 8 s per call,
    -- almost all refusals (documents of other organizations reached through their own files).
    -- iam.reach_containers_worth_asking keeps the containers the caller holds a direct lane on, or
    -- one of whose own containers they do; the kernel still decides each one.
    reach_worth as materialized (
      select w.container_type, w.container_id
        from iam.reach_containers_worth_asking(v_uid,
               array(select k.container_type from reach_containers k),
               array(select k.container_id from reach_containers k)) w
    ),
    reach_ok as materialized (
      select k.container_type, k.container_id
      from reach_worth k
      where iam.has_access_for_base(v_uid, k.container_type, k.container_id, p_required, p_include_public)
    )
    select distinct c.id
    from (
      select p.resource_id as id
      from iam.permissions p
      where p.resource_type = p_type
        and (
          p.granted_to_user_id = v_uid
          or p.granted_to_organization_id in (
            select om.organization_id
            from iam.organization_member om join iam.organizations om_org on om_org.id = om.organization_id and om_org.archived_at is null where om.user_id = v_uid
          )
        )
        and p.status <> 'rejected'
        and (p.expires_at is null or p.expires_at > now())
      union
      select m.container_id
      from iam.memberships m
      where m.container_type = p_type and m.user_id = v_uid and m.deleted_at is null
      union
      select rc.item_id
      from reach_cand rc
      where exists (select 1 from reach_ok k
                     where k.container_type = rc.container_type and k.container_id = rc.container_id)
      union
      select a.source_id
      from platform.associations_live a
      where a.source_type = p_type and a.role = 'assignment'
        and a.target_type = 'scope'
      -- D261 (2026-08-23): THE LIBRARY LANES. iam.has_access_for_base opens with
      -- two token-agnostic viewer lanes — public.user_can_read_via_library_grant
      -- and public.library_is_open ("THE OPEN LIBRARY") — that both read
      -- platform.entity_grants. This function never learned them, so a row
      -- readable ONLY through a library grant was never even a CANDIDATE, and
      -- the set form disagreed with the per-row form for the same (type, id).
      -- Measured before this change: 15 disagreements across the three tokens
      -- that have entity_grants rows (rag.data_stores 6, platform.rulebook 6,
      -- seo.starter_pack 3).
      --
      -- This can only ever ADD ids, and only ids the loop below then confirms
      -- with has_access_for_base — the authority. A wider candidate SET cannot
      -- grant anything the per-row resolver denies; it can only stop the two
      -- forms from disagreeing. That asymmetry is what makes this landable on
      -- machinery every component parent arm depends on.
      union
      select g.entity_id
      from platform.entity_grants g
      where g.entity_type = p_type
      -- ...and the two curator lanes, for the same reason: has_access_for_base
      -- grants a curator every row in their industry, and none of those ids
      -- appear in permissions, memberships, reachability or assignments.
      union
      select rb.id
      from platform.rulebook rb
      join iam.industry_curators ic on ic.industry_id = rb.industry_id
      where p_type = 'rulebook' and ic.user_id = v_uid and ic.deleted_at is null
        and rb.deleted_at is null
      union
      select sp.id
      from seo.starter_pack sp
      join iam.industry_curators ic on ic.industry_id = sp.industry_id
      where p_type = 'seo_starter_pack' and ic.user_id = v_uid and ic.deleted_at is null
    ) c
    where not exists (select 1 from have h where h.id = c.id)
  loop
    if iam.has_access_for_base(v_uid, p_type, rec.id, p_required, p_include_public)
    then v_ids := v_ids || rec.id; end if;
  end loop;

  -- Parent cascade. SELF-CONTAINMENT EDGES ARE A TRANSITIVE CLOSURE, NOT A
  -- RECURSION: `folder -> folder` made a depth-0 call fan out to ~91
  -- invocations (12 levels, doubled at every level by the include_public /
  -- non-public pair), each one re-deriving the SAME base set over the whole
  -- table. Ordered so self edges run LAST, over the fully accumulated v_ids.
  -- 🚨 ACCESS LADDER T-13 2.3e (2026-09-28) — A CHILD NEVER OPENS THROUGH A CONTAINER, SET-WISE.
  -- iam.has_access_for_base pushes no containment and no composition edge for a row that names its
  -- parent record (T-33: "a file with a parent record never opens through its folder"); this cascade
  -- did, so the set held child files the per-row kernel and files.files refuse, and every generated
  -- child read that takes this set as final (files.file_versions: file_id in the 'file' set) opened
  -- them. Measured: test@test.com read 26 file_versions rows of admin@admin.com's Confidential
  -- study-session recordings through their folder. A child row enters the set only through the
  -- parent lane below (or its own owner / grant / candidate lanes above).
  if platform.child_parent_columns(p_type) is not null then
    v_child_gate := format(' and t.%I is null', (platform.child_parent_columns(p_type))[1]);
  end if;
  if p_depth = 0 and p_include_public and v_has_vis then
    v_memo_prev := current_setting('iam.aei_cascade_memo', true);
    perform set_config('iam.aei_cascade_memo', '{}', true);
  end if;
  for rec in
    select er.parent_type, er.fk_column
    from platform.entity_relationships er
    where er.child_type = p_type
      and er.kind in ('composition', 'containment')
      -- ACCESS LADDER T-35 (2026-09-28): a containment edge carries only an Organization or Public
      -- row, as iam.has_access_for_base says (reachability candidates are confirmed by it below).
      and (er.kind = 'composition' or v_lanes.resolved_class in ('organization', 'public'))
    order by (er.parent_type = p_type), er.kind, er.parent_type, er.fk_column
  loop
    if exists (
      select 1 from information_schema.columns c
      where c.table_schema = v_schema and c.table_name = v_table
        and c.column_name = rec.fk_column
    ) then
      if rec.parent_type = p_type then
        -- T-11 leak fixes (2026-09-28), speed only: each closure step below probes the parent-id
        -- index once per row it just added (a LATERAL fenced with OFFSET 0). As a plain join the
        -- planner merge-joined the WHOLE table on every step — measured on files.folders as
        -- test@test.com: eight steps x 104k index rows = 505 ms, now 20 ms. Same rows, same filters.
        -- P = closure_public(S_T u N) where N is the non-public closure.
        -- Proof that this equals the old recursion's fixpoint: N is closed
        -- under ALL children (its own branch takes the else arm), so every
        -- non-public row the old code admitted via `parent in N` is already
        -- IN N; only the public arm still needs iterating. N costs exactly one
        -- nested call, and that call takes this same branch with
        -- p_include_public = false, so it does not fan out either.
        if p_include_public and v_has_vis then
          v_memo_key := concat_ws('|', v_uid, p_type, p_required, p_depth + 1, false);
          v_memo := nullif(current_setting('iam.aei_cascade_memo', true), '')::jsonb;
          if v_memo ? v_memo_key then
            v_more := (v_memo ->> v_memo_key)::uuid[];
          else
            v_more := iam.accessible_entity_ids(
              p_type, p_required, p_depth + 1, false);
            if nullif(current_setting('iam.aei_cascade_memo', true), '') is not null then
              perform set_config('iam.aei_cascade_memo',
                (current_setting('iam.aei_cascade_memo', true)::jsonb
                   || jsonb_build_object(v_memo_key, v_more::text))::text, true);
            end if;
          end if;
          v_ids := v_ids || v_more;
          v_sql := format(
            'with recursive clo(id) as ('
            || ' select u from iam.unnest_uuids($1) u'
            || ' union'
            || ' select t.id from clo c cross join lateral'
            || '  (select t.id from %s t where t.%I = c.id and t.visibility = ''public''%s offset 0) t'
            || ') select coalesce(array_agg(id), ''{}'') from clo',
            v_tbl, rec.fk_column, v_child_gate);
        else
          v_sql := format(
            'with recursive clo(id) as ('
            || ' select u from iam.unnest_uuids($1) u'
            || ' union'
            || ' select t.id from clo c cross join lateral'
            || '  (select t.id from %s t where t.%I = c.id%s%s offset 0) t'
            || ') select coalesce(array_agg(id), ''{}'') from clo',
            v_tbl, rec.fk_column, iam._dd171_containment_filter(v_has_vis, 't', ' and '), v_child_gate);
        end if;
        execute v_sql into v_more using v_ids;
        v_ids := coalesce(v_more, '{}'::uuid[]);
      else
        v_memo_key := concat_ws('|', v_uid, rec.parent_type, p_required, p_depth + 1, p_include_public);
        v_memo := nullif(current_setting('iam.aei_cascade_memo', true), '')::jsonb;
        if v_memo ? v_memo_key then
          v_parent_ids := (v_memo ->> v_memo_key)::uuid[];
        else
          v_parent_ids := iam.accessible_entity_ids(
            rec.parent_type, p_required, p_depth + 1, p_include_public);
          if nullif(current_setting('iam.aei_cascade_memo', true), '') is not null then
            perform set_config('iam.aei_cascade_memo',
              (current_setting('iam.aei_cascade_memo', true)::jsonb
                 || jsonb_build_object(v_memo_key, v_parent_ids::text))::text, true);
          end if;
        end if;
        if p_include_public and v_has_vis then
          v_memo_key := concat_ws('|', v_uid, rec.parent_type, p_required, p_depth + 1, false);
          v_memo := nullif(current_setting('iam.aei_cascade_memo', true), '')::jsonb;
          if v_memo ? v_memo_key then
            v_nonpublic_parent_ids := (v_memo ->> v_memo_key)::uuid[];
          else
            v_nonpublic_parent_ids := iam.accessible_entity_ids(
              rec.parent_type, p_required, p_depth + 1, false);
            if nullif(current_setting('iam.aei_cascade_memo', true), '') is not null then
              perform set_config('iam.aei_cascade_memo',
                (current_setting('iam.aei_cascade_memo', true)::jsonb
                   || jsonb_build_object(v_memo_key, v_nonpublic_parent_ids::text))::text, true);
            end if;
          end if;
          v_sql := format(
            'with have as materialized (select iam.unnest_uuids($3) as id) '
            || 'select coalesce(array_agg(t.id), ''{}'') from %s t '
            || 'where ('
            || '(t.visibility = ''public'' and t.%I = any($1)) '
            || 'or ((t.visibility is null or t.visibility >= ''internal''::platform.visibility)'
            || ' and t.visibility is distinct from ''public'' and t.%I = any($2))'
            || ')%s and not exists (select 1 from have h where h.id = t.id)',
            v_tbl, rec.fk_column, rec.fk_column, v_child_gate
          );
          execute v_sql into v_more using v_parent_ids, v_nonpublic_parent_ids, v_ids;
        else
          v_sql := format(
            'with have as materialized (select iam.unnest_uuids($2) as id) '
            || 'select coalesce(array_agg(t.id), ''{}'') from %s t '
            || 'where t.%I = any($1) %s%s '
            || 'and not exists (select 1 from have h where h.id = t.id)',
            v_tbl, rec.fk_column, iam._dd171_containment_filter(v_has_vis, 't', ' and '), v_child_gate
          );
          execute v_sql into v_more using v_parent_ids, v_ids;
        end if;
        v_ids := v_ids || coalesce(v_more, '{}'::uuid[]);
      end if;
    end if;
  end loop;

  if p_depth = 0 and p_include_public and v_has_vis then
    perform set_config('iam.aei_cascade_memo', coalesce(v_memo_prev, ''), true);
  end if;

  -- DD-175e: one filter over every lane at once, so no arm can reintroduce a row the
  -- parent's own std_select hides.
  -- 🚨 ACCESS LADDER T-11 (2026-09-28) — THE PARENT LANE, SET-WISE. The kernel's twin
  -- (iam.has_access_for_base): a child row is in the set when its parent record is in the
  -- caller's set for the parent's type. Only the parent types actually present are asked (a
  -- loose index scan over files_files_parent_record_idx), each once, through this same function
  -- at depth + 1; the rows come back through the same index. A same-type pointer (a file variant
  -- written before T-11 part n) is left to the kernel row by row. The trash rule and the
  -- reference gate below still apply to these rows.
  v_child_cols := platform.child_parent_columns(p_type);
  if v_child_cols is not null and p_depth < 12 then
    -- ENTITY-IDS (2026-10-08) / ENTITY-IDS-2: a parent type the knob access/child_parent_asks_ids lists (default:
    -- record) is not enumerated. Its ids are the ones this table names, cut to the ones that could be this person's
    -- (for record: iam.child_parent_records_worth_asking), and the kernel is asked about exactly those
    -- (iam.has_access_for_many_in, the set form, with each id's organization as a hint; the one-at-a-time kernel
    -- when the set form is off for the person or the question excludes the public lane). Same answer as the
    -- enumeration for every id the table names. The knob cannot drop a type while a child row names it.
    -- mx.child_parent_asks_ids = 'off' (session) forces the enumeration for every type; the proofs compare both.
    begin
      if coalesce(current_setting('mx.child_parent_asks_ids', true), '') = 'off' then
        v_ask_types := '{}'::text[];
      else
        v_knob := platform.knob_resolve('access', 'child_parent_asks_ids', null);
        v_ask_types := case when v_knob ? 'types'
                            then array(select jsonb_array_elements_text(v_knob -> 'types'))
                            else array['record'] end;
      end if;
    exception when others then
      raise warning 'ENTITY-IDS: knob access/child_parent_asks_ids unreadable (%); record parents are asked by the ids present', sqlerrm;
      v_ask_types := array['record'];
    end;
    v_cols_ask := v_child_cols;
    for v_ptype in execute format(
        'with recursive d(v) as ('
        || ' (select t.%1$I::text from %2$s t where t.%1$I is not null and t.%3$I is not null order by 1 limit 1)'
        || ' union all'
        || ' select (select t.%1$I::text from %2$s t where t.%1$I > d.v and t.%3$I is not null order by 1 limit 1)'
        || ' from d where d.v is not null'
        || ') select v from d where v is not null',
        v_child_cols[1], v_tbl, v_child_cols[2])
    loop
      continue when v_ptype = p_type;
      if v_ptype = any(v_ask_types) then
        execute format(
            'select array_agg(q.pid), array_agg(q.org) from (select t.%1$I as pid, %4$s as org from %2$s t '
            || 'where t.%3$I = $1 and t.%1$I is not null group by t.%1$I) q',
            v_cols_ask[2], v_tbl, v_cols_ask[1],
          case when v_has_org then '(array_agg(t.organization_id))[1]' else 'null::uuid' end)
          into v_ask_ids, v_ask_orgs using v_ptype;
        -- ENTITY-IDS-2 (2026-10-08): ONLY THE PARENT IDS THAT COULD BE THIS PERSON'S ARE ASKED. This set is final
        -- for every files component policy, so the kernel still decides each id; what changes is which ids it is
        -- asked about (iam.child_parent_records_worth_asking: an id no lane of the kernel could open to this person
        -- is answered no without asking). Before: every record id any file on the platform names, ~0.8 ms each.
        if v_ptype = 'record' and coalesce(cardinality(v_ask_ids), 0) > 0 then
          select array_agg(b.pid), array_agg(b.org) into v_ask_ids, v_ask_orgs
            from iam.child_parent_records_worth_asking(v_uid, v_ask_ids, v_ask_orgs) b;
        end if;
        v_parent_ids := '{}'::uuid[];
        if coalesce(cardinality(v_ask_ids), 0) > 0 then
          begin
            if p_include_public and iam.kernel_set_form_on(v_uid) then
              select coalesce(array_agg(m.target), '{}'::uuid[]) into v_parent_ids
                from iam.has_access_for_many_in(v_uid, v_ask_ids, v_ask_orgs, (p_required)::text, v_ptype) m
               where m.allowed;
            else
              select coalesce(array_agg(x), '{}'::uuid[]) into v_parent_ids
                from unnest(v_ask_ids) x
               where iam.has_access_for_base(v_uid, v_ptype, x, p_required, p_include_public);
            end if;
          exception when others then
            raise warning 'ENTITY-IDS: the set form failed for % parents (%); asking one at a time', v_ptype, sqlerrm;
            select coalesce(array_agg(x), '{}'::uuid[]) into v_parent_ids
              from unnest(v_ask_ids) x
             where iam.has_access_for_base(v_uid, v_ptype, x, p_required, p_include_public);
          end;
        end if;
      else
        v_parent_ids := iam.accessible_entity_ids(v_ptype, p_required, p_depth + 1, p_include_public);
      end if;
      continue when coalesce(cardinality(v_parent_ids), 0) = 0;
      -- ENTITY-IDS-2: the parent ids as a hashed set, never `= any(<param array>)` (a linear scan of the array per
      -- row: 20,000 files x 8,000 parent ids did not return in 10 minutes). Same rows.
      execute format(
        'with have as materialized (select iam.unnest_uuids($3) as id), '
        || 'par as materialized (select distinct iam.unnest_uuids($2) as id) '
        || 'select coalesce(array_agg(t.id), ''{}'') from %s t join par p on p.id = t.%I where t.%I = $1 '
        || 'and not exists (select 1 from have h where h.id = t.id)',
        v_tbl, v_child_cols[2], v_child_cols[1])
        into v_more using v_ptype, v_parent_ids, v_ids;
      v_ids := v_ids || coalesce(v_more, '{}'::uuid[]);
    end loop;
  end if;

  if v_soft_deleted_hidden and coalesce(array_length(v_ids,1),0) > 0 then
    v_sql := format(
      'select coalesce(array_agg(t.id), ''{}'') from %s t' ||
      ' where t.id = any($1) and t.deleted_at is null', v_tbl);
    execute v_sql into v_more using v_ids;
    v_ids := coalesce(v_more, '{}'::uuid[]);
  end if;
  -- 🚨 RC-A1 (2026-09-25): the kernel's trash rule, set-wise — a row in its owner's trash is in
  -- nobody else's set (platform.trash_hides; declared by platform.trash_is_owner_only).
  if platform.trash_is_owner_only(p_type) and coalesce(array_length(v_ids, 1), 0) > 0 then
    execute format('select coalesce(array_agg(t.id), ''{}'') from %s t where t.id = any($1) '
                   'and not platform.trash_hides($2, t.deleted_at, t.created_by, $3)', v_tbl)
      into v_more using v_ids, p_type, v_uid;
    v_ids := coalesce(v_more, '{}'::uuid[]);
  end if;
  -- 🚨 RC-A2c (2026-09-25): a row that points at another record (platform.reference_gate) is in
  -- the set only when the caller can view that record — the kernel's gate, set-wise.
  if coalesce(array_length(v_ids, 1), 0) > 0 then
    for rec in select g.type_column, g.id_column from platform.reference_gate(p_type) g loop
      execute format(
        'select coalesce(array_agg(t.id), ''{}'') from %s t where t.id = any($1) and '
        '(t.%I is null or t.%I is null or iam.has_access_for($2, t.%I, t.%I, ''viewer''::public.permission_level))',
        v_tbl, rec.type_column, rec.id_column, rec.type_column, rec.id_column)
        into v_more using v_ids, v_uid;
      v_ids := coalesce(v_more, '{}'::uuid[]);
    end loop;
  end if;
  return coalesce((
    select array_agg(distinct x) from unnest(v_ids) x
  ), '{}'::uuid[]);
end;
$function$;

CREATE OR REPLACE FUNCTION platform.kernel_equivalence_answers()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  -- v2 (lane KERNEL-1294, 2026-09-27): the fixture's interview_session is Organization-class since
  -- access ladder T-8c08 (2026-09-26 20:26Z). Same world, same questions; one recorded answer moved.
  -- v3 (lane ENTITY-IDS-2, 2026-10-08): two files under the store's rows (a file whose parent is a `record`), asked
  -- of the kernel, the files read policy and the set every files component policy takes as final. Each person's set
  -- is asked once per token (it was asked once per thing); a file set only for the member (sets_people).
  c_version constant text := 'v3';
  c_org     constant uuid := 'f1ce0000-0000-4000-8000-0000000000d1';
  c_home    constant uuid := 'f1ce0000-0000-4000-8000-0000000000f0';
  c_people  constant text[] := array['author', 'org_owner', 'member', 'grantee', 'stranger'];
  c_names   constant text[] := array['Marisol Vega', 'Owen Pruitt', 'Keiko Tran', 'Rafael Duarte', 'Lena Holt'];
  c_ids     constant uuid[] := array['f1ce0000-0000-4000-8000-0000000000a1', 'f1ce0000-0000-4000-8000-0000000000a2',
                                     'f1ce0000-0000-4000-8000-0000000000a3', 'f1ce0000-0000-4000-8000-0000000000a4',
                                     'f1ce0000-0000-4000-8000-0000000000a5']::uuid[];
  c_levels  constant public.permission_level[] := array['viewer', 'commenter', 'editor', 'admin']::public.permission_level[];
  v_t0      timestamptz := clock_timestamp();
  v_ans     jsonb := '{}'::jsonb;
  v_things  jsonb := '[]'::jsonb;
  v_err     text;
  v_qual    text;
  v_b       boolean;
  v_set     uuid[];
  v_tbl     uuid;
  v_fields  jsonb := jsonb_build_array(jsonb_build_object('name', 'title', 'kind', 'text'));
  i         integer;
  t         jsonb;
  lvl       public.permission_level;
  v_sets    jsonb := '{}'::jsonb;
begin
  -- Two callers never build the world at once (fixed ids); held to the caller's commit.
  perform pg_advisory_xact_lock(hashtext('platform.kernel_equivalence_fixture'));
  begin
    perform set_config('app.actor_system', 'kernel_equivalence_fixture', true);
    -- THE WORLD IS BUILT BY NOBODY (lane PROVISION-BATCH-FIX, 2026-09-26). The fixture used to
    -- inherit the CALLER's signed-in identity, so a provision run by a person (request.jwt.claims
    -- sub set, e.g. admin@admin.com) could never heal: inserting the fixture's people fired the
    -- signup-organization guard (42501)
    -- and the heal refused an equivalent kernel. Cleared here, inside the subtransaction, so the
    -- rollback below gives the caller its identity back untouched.
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
    for i in 1 .. 5 loop
      insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
      values (c_ids[i], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
              lower(replace(c_names[i], ' ', '.')) || '.kernel-fixture@aimatrx.com',
              jsonb_build_object('display_name', c_names[i]), now(), now());
    end loop;
    insert into iam.organizations (id, name, slug, abbreviation, created_by)
    values (c_org, 'Harbor Point Dental Studio', 'harbor-point-dental-kernel-fixture', 'HPD', c_ids[2]);
    insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
      (c_org, 'organization', c_org, c_ids[2], 'owner',  'active'),
      (c_org, 'organization', c_org, c_ids[1], 'member', 'active'),
      (c_org, 'organization', c_org, c_ids[3], 'member', 'active');

    insert into code.code_repositories (id, organization_id, name, created_by, visibility) values
      ('f1ce0000-0000-4000-8000-0000000000b1', c_org, 'patient-reminder-scripts', c_ids[1], 'internal'),
      ('f1ce0000-0000-4000-8000-0000000000b2', c_org, 'marisol-scratch-notes',    c_ids[1], 'personal'),
      ('f1ce0000-0000-4000-8000-0000000000b3', c_org, 'public-booking-widget',    c_ids[1], 'public'),
      ('f1ce0000-0000-4000-8000-0000000000b4', c_org, 'insurance-claim-exports',  c_ids[1], 'personal'),
      ('f1ce0000-0000-4000-8000-0000000000b5', c_org, 'front-desk-templates',     c_ids[1], 'internal');
    insert into interview.session (id, organization_id, created_by, visibility) values
      ('f1ce0000-0000-4000-8000-0000000000c1', c_org, c_ids[1], 'internal'),
      ('f1ce0000-0000-4000-8000-0000000000c2', c_org, c_ids[1], 'personal'),
      ('f1ce0000-0000-4000-8000-0000000000c3', c_org, c_ids[1], 'personal');
    -- fixture shares through the one writer (T-32e), inside this rolled-back probe
    perform iam.share_with_person(f.t, f.id, f.u, f.l, c_ids[1], false, 'fixture')
       from (values ('code_repository',   'f1ce0000-0000-4000-8000-0000000000b4'::uuid, c_ids[4], 'viewer'::public.permission_level),
                    ('code_repository',   'f1ce0000-0000-4000-8000-0000000000b5'::uuid, c_ids[4], 'editor'::public.permission_level),
                    ('interview_session', 'f1ce0000-0000-4000-8000-0000000000c3'::uuid, c_ids[3], 'commenter'::public.permission_level)) f(t, id, u, l);
    insert into platform.comments (id, organization_id, entity_type, entity_id, body, created_by) values
      ('f1ce0000-0000-4000-8000-0000000000e1', c_org, 'code_repository', 'f1ce0000-0000-4000-8000-0000000000b1',
       'Can we move the reminder send to 9am?', c_ids[3]),
      ('f1ce0000-0000-4000-8000-0000000000e2', c_org, 'code_repository', 'f1ce0000-0000-4000-8000-0000000000b4',
       'Claim export for Q3 looks right.', c_ids[4]);

    -- The record store: a home, an open Table and a "mine" Table (its record personal, its rows
    -- internal — the shape SHARE-LANE-2 walled the organization roles out of).
    insert into custom.record (id, organization_id, table_id, data_class, data, created_by)
    values (c_home, c_org, '11111111-0000-4000-8000-000000000004', 'record', '{"name": "Front desk"}', c_ids[2]);
    v_tbl := custom.table_declare(c_org, jsonb_build_object(
      'name', 'Patient recall list', 'slug', 'kf_recall', 'label_singular', 'Patient', 'label_plural', 'Patients',
      'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light', 'retention_days', 30,
      'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true, 'fields', v_fields,
      'title_field', 'title', 'parent_id', c_home::text));
    update custom.record set created_by = c_ids[1] where organization_id = c_org and id = v_tbl;
    insert into custom.record (id, organization_id, table_id, data_class, data, created_by)
    values ('f1ce0000-0000-4000-8000-0000000000f1', c_org, v_tbl, 'record',
            '{"title": "Recall: Jonah Ellis, 6-month cleaning"}', c_ids[1]);
    v_tbl := custom.table_declare(c_org, jsonb_build_object(
      'name', 'My chairside notes', 'slug', 'kf_notes', 'label_singular', 'Note', 'label_plural', 'Notes',
      'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light', 'retention_days', 30,
      'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true, 'fields', v_fields,
      'title_field', 'title', 'parent_id', c_home::text));
    update custom.record set created_by = c_ids[1], visibility = 'personal' where organization_id = c_org and id = v_tbl;
    insert into custom.record (id, organization_id, table_id, data_class, data, created_by)
    values ('f1ce0000-0000-4000-8000-0000000000f2', c_org, v_tbl, 'record',
            '{"title": "Crown prep went long, book 90 min next time"}', c_ids[1]);
    -- ENTITY-IDS-2: a file under each row (its parent is the row; the author made both). It opens exactly as its row:
    -- never through the organization lane a top-level file has.
    insert into files.files (id, created_by, organization_id, file_path, file_name, storage_uri,
                             parent_record_type, parent_record_id) values
      ('f1ce0000-0000-4000-8000-0000000001a1', c_ids[1], c_org, 'kernel-fixture/recall-call-recording.webm',
       'Recall call recording.webm', 's3://kernel-fixture/recall-call-recording.webm', 'record', 'f1ce0000-0000-4000-8000-0000000000f1'),
      ('f1ce0000-0000-4000-8000-0000000001a2', c_ids[1], c_org, 'kernel-fixture/crown-prep-photo.jpg',
       'Crown prep photo.jpg', 's3://kernel-fixture/crown-prep-photo.jpg', 'record', 'f1ce0000-0000-4000-8000-0000000000f2');

    v_things := '[
      {"token":"code_repository","schema":"code","table":"code_repositories","thing":"repo_internal","id":"f1ce0000-0000-4000-8000-0000000000b1","sets":true},
      {"token":"code_repository","schema":"code","table":"code_repositories","thing":"repo_personal","id":"f1ce0000-0000-4000-8000-0000000000b2","sets":true},
      {"token":"code_repository","schema":"code","table":"code_repositories","thing":"repo_public","id":"f1ce0000-0000-4000-8000-0000000000b3","sets":true},
      {"token":"code_repository","schema":"code","table":"code_repositories","thing":"repo_personal_shared_viewer","id":"f1ce0000-0000-4000-8000-0000000000b4","sets":true},
      {"token":"code_repository","schema":"code","table":"code_repositories","thing":"repo_internal_shared_editor","id":"f1ce0000-0000-4000-8000-0000000000b5","sets":true},
      {"token":"interview_session","schema":"interview","table":"session","thing":"session_internal","id":"f1ce0000-0000-4000-8000-0000000000c1","sets":true},
      {"token":"interview_session","schema":"interview","table":"session","thing":"session_personal","id":"f1ce0000-0000-4000-8000-0000000000c2","sets":true},
      {"token":"interview_session","schema":"interview","table":"session","thing":"session_personal_shared_commenter","id":"f1ce0000-0000-4000-8000-0000000000c3","sets":true},
      {"token":"comment","schema":"platform","table":"comments","thing":"comment_on_internal_repo","id":"f1ce0000-0000-4000-8000-0000000000e1","sets":false},
      {"token":"comment","schema":"platform","table":"comments","thing":"comment_on_shared_personal_repo","id":"f1ce0000-0000-4000-8000-0000000000e2","sets":false},
      {"token":"record","schema":"custom","table":"record","thing":"row_of_an_open_table","id":"f1ce0000-0000-4000-8000-0000000000f1","sets":false},
      {"token":"record","schema":"custom","table":"record","thing":"row_of_a_mine_table","id":"f1ce0000-0000-4000-8000-0000000000f2","sets":false},
      {"token":"file","schema":"files","table":"files","thing":"file_under_an_open_table_row","id":"f1ce0000-0000-4000-8000-0000000001a1","sets":true,"sets_people":["member"]},
      {"token":"file","schema":"files","table":"files","thing":"file_under_a_mine_table_row","id":"f1ce0000-0000-4000-8000-0000000001a2","sets":true,"sets_people":["member"]}
    ]'::jsonb;

    for t in select x from jsonb_array_elements(v_things) x loop
      select p.qual into v_qual from pg_policies p
       where p.schemaname = t->>'schema' and p.tablename = t->>'table' and p.policyname = 'std_select';
      for i in 1 .. 5 loop
        perform set_config('request.jwt.claims',
          json_build_object('sub', c_ids[i], 'role', 'authenticated')::text, true);
        foreach lvl in array c_levels loop
          v_ans := v_ans || jsonb_build_object(
            format('k:%s:%s:%s:%s', t->>'token', t->>'thing', c_people[i], lvl),
            iam.has_access_for(c_ids[i], t->>'token', (t->>'id')::uuid, lvl));
        end loop;
        if v_qual is null then
          v_b := null;
        else
          execute format('select exists (select 1 from %I.%I where id = $1 and (%s))', t->>'schema', t->>'table', v_qual)
            into v_b using (t->>'id')::uuid;
        end if;
        v_ans := v_ans || jsonb_build_object(format('p:%s:%s:%s', t->>'token', t->>'thing', c_people[i]), v_b);
        -- a file set is a whole-platform question (~2.5 s a person), so it is asked for the people a thing names
        if (t->>'sets')::boolean and (not (t ? 'sets_people') or (t->'sets_people') ? c_people[i]) then
          if not (v_sets ? (t->>'token' || '|' || i)) then
            v_sets := v_sets || jsonb_build_object(t->>'token' || '|' || i,
              to_jsonb(iam.accessible_entity_ids(t->>'token', 'viewer'::public.permission_level, 0, true)));
          end if;
          v_set := array(select x::uuid from jsonb_array_elements_text(v_sets -> (t->>'token' || '|' || i)) x);
          v_ans := v_ans || jsonb_build_object(format('s:%s:%s:%s', t->>'token', t->>'thing', c_people[i]),
                                               (t->>'id')::uuid = any (coalesce(v_set, '{}'::uuid[])));
        end if;
      end loop;
    end loop;

    -- Everything above is undone here, every time: the world never outlives the question.
    raise exception using errcode = 'KF000', message = 'kernel equivalence fixture rolled back';
  exception
    when sqlstate 'KF000' then null;
    when others then
      v_err := sqlstate || ': ' || sqlerrm;
  end;
  return jsonb_build_object('version', c_version, 'answers', v_ans, 'error', v_err,
                            'ms', round((extract(epoch from clock_timestamp() - v_t0) * 1000)::numeric, 1));
end;
$function$;
CREATE OR REPLACE FUNCTION iam.kernel_shadow_sweep(p_people integer DEFAULT 3, p_tables integer DEFAULT 300)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- KERNEL-SHADOW: the read-write half of the drift guard. Compares both forms of the access kernel in its
-- own transaction through iam.has_access_for_shadow, at viewer and editor, on a stratified sample of
-- rows (see the file header). p_tables is the total rows per person; p_people the random members.
declare
  v_kernel  uuid := custom.table_kernel_id();
  v_base    uuid[];
  v_conf_t  uuid[];
  v_pub_t   uuid[];
  v_priv_t  uuid[];
  v_name    text;
  v_ids     uuid[];
  v_org     uuid;
  v_label   text;
  v_who     uuid[];
  v_inside  uuid;
  v_outside uuid;
  v_named   uuid[];
  v_p       uuid;
  v_lvl     text;
  v_caller  text;
  v_n       integer := 0;
  v_tot     integer;
  v_summary jsonb := '[]'::jsonb;
  v_cap     integer;
  v_bad     integer;
  -- ENTITY-IDS-2: the record-parented-file stratum
  v_files   uuid[];
  v_synth   boolean := false;
  v_qual    text;
  v_f       uuid;
  v_fk      boolean;
  v_fp      boolean;
  v_fs      boolean;
  v_fset    uuid[];
  v_rows    jsonb := '[]'::jsonb;
  v_claims0 text := current_setting('request.jwt.claims', true);
  v_ferr    text;
begin
  -- The shadow writes an agreement only into a transaction that has already written; the sweep IS its
  -- own transaction and its summaries are its point, so it takes a transaction id first.
  perform pg_catalog.pg_current_xact_id();
  v_tot := greatest(p_tables, 5);
  v_base := array['87a6e699-3622-4869-8843-d0867456c0dd'::uuid, '4060701e-706a-4c76-b3ca-0bbc69fa5a14'::uuid]
         || array(select distinct on (u) u from (select om.user_id as u from iam.organization_member om
                                                 order by random() limit greatest(p_people, 0) * 4) z
                   limit greatest(p_people, 0));

  select array_agg(t.id) filter (where t.data ->> 'level' = 'confidential'),
         array_agg(t.id) filter (where t.data ->> 'level' = 'public'),
         array_agg(t.id) filter (where t.data ->> 'level' = 'private')
    into v_conf_t, v_pub_t, v_priv_t
    from custom.record t
   where t.table_id = v_kernel and t.data_class = 'table'
     and t.data ->> 'level' in ('confidential', 'public', 'private');

  foreach v_name in array array['confidential', 'public', 'private', 'organization', 'table_definition'] loop
    v_ids := null; v_org := null; v_label := null; v_named := null;

    if v_name = 'confidential' then
      v_cap := greatest(v_tot / 10, 12);
      select array_agg(x.id), (array_agg(x.organization_id))[1] into v_ids, v_org
        from (select r.id, r.organization_id from custom.record r
               where r.table_id = any (coalesce(v_conf_t, '{}')) and r.data_class = 'record'
               order by random() limit v_cap) x;
    elsif v_name = 'public' then
      v_cap := greatest(v_tot / 20, 5);
      select array_agg(x.id), (array_agg(x.organization_id))[1] into v_ids, v_org
        from (select r.id, r.organization_id from custom.record r
               where r.published_to_web or (r.table_id = any (coalesce(v_pub_t, '{}')) and r.data_class = 'record')
               order by random() limit v_cap) x;
    elsif v_name = 'private' then
      v_cap := greatest(v_tot / 20, 5);
      select array_agg(x.id), (array_agg(x.organization_id))[1] into v_ids, v_org
        from (select r.id, r.organization_id from custom.record r
               where r.shown_to = 'only_me' or (r.table_id = any (coalesce(v_priv_t, '{}')) and r.data_class = 'record')
               order by random() limit v_cap) x;
    elsif v_name = 'organization' then
      v_cap := greatest(v_tot / 5, 10);
      select array_agg(x.id), (array_agg(x.organization_id))[1] into v_ids, v_org
        from (select r.id, r.organization_id from custom.record r tablesample system (2)
               where r.data_class = 'record'
                 and r.table_id <> all (coalesce(v_conf_t, '{}') || coalesce(v_pub_t, '{}') || coalesce(v_priv_t, '{}'))
               order by random() limit v_cap) x;
    else
      v_cap := greatest(v_tot / 5, 10);
      select array_agg(x.id), (array_agg(x.organization_id))[1] into v_ids, v_org
        from (select r.id, r.organization_id from custom.record r tablesample system (5)
               where r.table_id = v_kernel order by random() limit v_cap) x;
    end if;

    if v_ids is null then
      v_summary := v_summary || jsonb_build_object('level', v_name, 'tables', 'none present', 'rows', 0, 'people', 0, 'compared', 0);
      continue;
    end if;

    -- Which Tables the sampled rows belong to (named, so the log row says what was sampled).
    if v_name = 'table_definition' then
      v_label := 'the Table definitions';
    else
      select string_agg(distinct coalesce(t.data ->> 'name', '?') || ' ' || left(t.id::text, 8), ', ')
        into v_label
        from custom.record r join custom.record t on t.id = r.table_id and t.organization_id = r.organization_id
       where r.id = any (v_ids);
      v_label := coalesce(left(v_label, 300), 'rows without a Table');
    end if;

    -- People: the base seats, one inside and one outside the stratum's organization, and any person
    -- a reader field of a sampled Confidential row names.
    select om.user_id into v_inside from iam.organization_member om
     where om.organization_id = v_org order by random() limit 1;
    select z.u into v_outside
      from (select om.user_id as u from iam.organization_member om
             where om.organization_id <> v_org order by random() limit 12) z
     where not exists (select 1 from iam.organization_member o2 where o2.user_id = z.u and o2.organization_id = v_org)
     limit 1;
    if v_name = 'confidential' then
      select array_agg(distinct x.v::uuid) into v_named
        from (select r.data ->> (rd ->> 'field') as v
                from custom.record r
                join custom.record t on t.id = r.table_id and t.organization_id = r.organization_id
                cross join lateral jsonb_array_elements(case when jsonb_typeof(t.data -> 'readers') = 'array'
                                                             then t.data -> 'readers' else '[]'::jsonb end) rd
               where r.id = any (v_ids)) x
       where x.v ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
      v_named := v_named[1:3];
    end if;
    v_who := array(select distinct u from unnest(v_base || array[v_inside, v_outside] || coalesce(v_named, '{}')) u
                    where u is not null);

    v_caller := format('iam.kernel_shadow_sweep|%s|%s|%s rows|%s people', v_name, v_label, cardinality(v_ids), cardinality(v_who));
    foreach v_p in array v_who loop
      foreach v_lvl in array array['viewer', 'editor'] loop
        perform 1 from iam.has_access_for_shadow(v_p, v_ids, v_lvl, 'record', v_caller);
        v_n := v_n + cardinality(v_ids);
      end loop;
    end loop;
    v_summary := v_summary || jsonb_build_object('level', v_name, 'tables', v_label, 'rows', cardinality(v_ids),
                   'people', cardinality(v_who), 'compared', cardinality(v_ids) * cardinality(v_who) * 2);
  end loop;

  -- ENTITY-IDS-2 (2026-10-08): FILES WHOSE PARENT IS A STORE RECORD. The files read policy's child lane and the set
  -- every files component policy takes as final reach the record through iam.accessible_child_parents and
  -- iam.accessible_entity_ids; the kernel (files.has_access_for) walks to it itself. Each sampled file is asked all
  -- three ways for the base seats; a difference is a disagreement row (old = kernel, new = policy or set). When no
  -- file names a record yet, one under a Confidential row and one under an Organization row are written inside a
  -- block that is rolled back (the answers leave it in variables).
  select array_agg(x.id) into v_files
    from (select f.id from files.files f where f.parent_record_type = 'record' and f.deleted_at is null
           order by random() limit 6) x;
  select p.qual into v_qual from pg_catalog.pg_policies p
   where p.schemaname = 'files' and p.tablename = 'files' and p.policyname = 'std_select';
  begin
    if v_files is null then
      v_synth := true;
      with src as (
        (select r.id, r.organization_id, r.created_by from custom.record r
          where r.table_id = any (coalesce(v_conf_t, '{}')) and r.data_class = 'record' and r.created_by is not null
          order by random() limit 1)
        union all
        (select r.id, r.organization_id, r.created_by from custom.record r tablesample system (1)
          where r.data_class = 'record' and r.created_by is not null
            and r.table_id <> all (coalesce(v_conf_t, '{}')) order by random() limit 1)
      ), ins as (
        insert into files.files (created_by, organization_id, file_path, file_name, storage_uri, parent_record_type, parent_record_id)
        select s.created_by, s.organization_id, 'kernel-shadow-sweep/' || s.id || '.webm', 'Sweep recording.webm',
               's3://kernel-shadow-sweep/' || s.id || '.webm', 'record', s.id
          from src s
        returning id
      )
      select array_agg(ins.id) into v_files from ins;
    end if;
    foreach v_p in array v_base[1:3] loop
      perform pg_catalog.set_config('request.jwt.claims', pg_catalog.json_build_object('sub', v_p, 'role', 'authenticated')::text, true);
      v_fset := iam.accessible_entity_ids('file', 'viewer'::public.permission_level, 0, true);
      foreach v_f in array coalesce(v_files, '{}') loop
        v_fk := coalesce(files.has_access_for(v_p, v_f, 'viewer'::public.permission_level), false);
        execute pg_catalog.format('select exists (select 1 from files.files where id = $1 and (%s))', v_qual) into v_fp using v_f;
        v_fs := v_f = any (coalesce(v_fset, '{}'));
        v_rows := v_rows || jsonb_build_object('p', v_p, 'f', v_f, 'k', v_fk, 'pol', v_fp, 's', v_fs);
      end loop;
    end loop;
    if v_synth then
      raise exception using errcode = 'KS000', message = 'kernel shadow sweep: synthetic record-parented files rolled back';
    end if;
  exception
    when sqlstate 'KS000' then null;
    when others then v_ferr := sqlstate || ': ' || sqlerrm;
  end;
  perform pg_catalog.set_config('request.jwt.claims', coalesce(v_claims0, ''), true);
  insert into iam.access_shadow_log (person, target, level, old_answer, new_answer, caller, compared, disagreed, error)
  select (r ->> 'p')::uuid, (r ->> 'f')::uuid, 'viewer', (r ->> 'k')::boolean,
         case when (r ->> 'pol')::boolean is distinct from (r ->> 'k')::boolean then (r ->> 'pol')::boolean else (r ->> 's')::boolean end,
         pg_catalog.format('iam.kernel_shadow_sweep|record_parented_file|%s|%s', case when v_synth then 'synthetic, rolled back' else 'live files' end,
                           case when (r ->> 'pol')::boolean is distinct from (r ->> 'k')::boolean then 'files read policy' else 'file set (component policies)' end),
         null, null, null
    from jsonb_array_elements(v_rows) r
   where (r ->> 'pol')::boolean is distinct from (r ->> 'k')::boolean or (r ->> 's')::boolean is distinct from (r ->> 'k')::boolean;
  if v_ferr is not null then
    insert into iam.access_shadow_log (person, target, level, old_answer, new_answer, caller, compared, disagreed, error)
    values (null, null, 'viewer', null, null, 'iam.kernel_shadow_sweep|record_parented_file|failed', 0, 0, v_ferr);
  end if;
  v_n := v_n + jsonb_array_length(v_rows) * 2;
  v_summary := v_summary || jsonb_build_object('level', 'record_parented_file', 'tables', case when v_synth then 'synthetic, rolled back' else 'live files' end,
                 'rows', coalesce(cardinality(v_files), 0), 'people', least(cardinality(v_base), 3),
                 'compared', jsonb_array_length(v_rows) * 2, 'error', v_ferr,
                 'disagreed', (select count(*) from jsonb_array_elements(v_rows) r
                                where (r ->> 'pol')::boolean is distinct from (r ->> 'k')::boolean
                                   or (r ->> 's')::boolean is distinct from (r ->> 'k')::boolean),
                 'answers', v_rows);

  select count(*) into v_bad from iam.access_shadow_log l
   where l.at = now() and l.target is not null and l.caller like 'iam.kernel_shadow_sweep|%';
  return jsonb_build_object('compared', v_n, 'disagreements', v_bad, 'strata', v_summary);
end;
$function$;
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
  v_slots   jsonb := jsonb_build_object('levels', 0, 'many', 0, 'page', 0, 'home_hub', 0);
  v_k       text;
  v_p3      uuid[];
  v_pg      integer;
  v_search  text;
  v_off     integer;
  v_tg      uuid[];
  v_orgs_live uuid[];  -- HOT-DOORS-7-GUARD g: the seat's organizations that are not archived (the data home refuses an archived one)
  v_orgs_t  uuid[];  -- HOT-DOORS-7-GUARD: the seat's organizations, those holding checklist templates first
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
  -- HOT-DOORS-7-GUARD: members of organizations holding checklist templates (the data home's template-memo shortcut is asked only for these)
  select array_agg(z.u) into v_p3 from (select om.user_id u from iam.organization_member om
          where om.organization_id in (select t.organization_id from custom.record t
                  where t.data_class = 'checklist_template' and t.deleted_at is null limit 50)
          order by random() limit 6) z;
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
    -- ENTITY-IDS-2 (2026-10-08): the record ids files name in the seat's organizations (a file whose parent is a store
    -- record is answered through iam.has_access_for_many_in on exactly these, hinted with the file's organization)
    v_tg := v_tg || array(select f.parent_record_id from files.files f
                           where f.parent_record_type = 'record' and f.organization_id = any (v_orgs)
                             and f.deleted_at is null and f.parent_record_id is not null
                           order by md5(f.id::text || v_seed) limit 20);
    -- HOT-DOORS-7 paths: custom.kernel_viewer_sets (the seat's organizations) and custom.data_home_changed_by's set form
    -- (custom.hub_changed_by_many) after the walk
    foreach v_k in array array['kvs', 'hub'] loop
      v_orgs_live := array(select x from unnest(v_orgs) x where not exists (select 1 from iam.organizations o where o.id = x and o.archived_at is not null));
      v_r := iam._memo_pair(v_k, v_p, v_o, null, case when v_k = 'hub' then v_orgs_live else v_orgs end, null, null, null, null);
      v_compared := v_compared + 1;
      if not (v_r ->> 'same')::boolean then
        v_diffs := v_diffs || jsonb_build_object('fn', case v_k when 'kvs' then 'custom.kernel_viewer_sets' else 'custom.hub_changed_by_many' end,
                     'stratum', v_k, 'person', v_p, 'level', v_k, 'target', to_jsonb(coalesce(v_o::text, '')), 'detail', v_r);
      end if;
    end loop;
    -- HOT-DOORS-7-GUARD: the data home end to end in one statement (custom.data_home_items, then the who-changed-what asks),
    -- the only ask that exercises the checklist-template memo shortcut of custom.hub_changed_by_many
    v_orgs_t := array(select om.organization_id from iam.organization_member om
                       join iam.organizations og on og.id = om.organization_id and og.archived_at is null
                      where om.user_id = v_p
                       order by exists (select 1 from custom.record t where t.organization_id = om.organization_id
                                         and t.data_class = 'checklist_template' and t.deleted_at is null) desc, random() limit 8);
    v_r := iam._memo_pair('home_hub', v_p, null, null, v_orgs_t, null, null, null, null);
    v_compared := v_compared + 1;
    if (v_r ->> 'slots') ~ '^[0-9]+$' then
      v_slots := jsonb_set(v_slots, '{home_hub}', to_jsonb((v_slots ->> 'home_hub')::int + (v_r ->> 'slots')::int));
    end if;
    if not (v_r ->> 'same')::boolean then
      v_diffs := v_diffs || jsonb_build_object('fn', 'custom.hub_changed_by_many', 'stratum', 'home_hub', 'person', v_p,
                   'level', 'home_hub', 'target', to_jsonb(coalesce(v_orgs_t[1]::text, '')), 'detail', v_r);
    end if;
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
  foreach v_k in array array['levels', 'many', 'page', 'home_hub'] loop
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
$function$;
CREATE OR REPLACE FUNCTION platform.feature_knob_child_parent_asks_ids_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
-- ENTITY-IDS-2 (2026-10-08): THE KNOB access/child_parent_asks_ids CANNOT DROP A PARENT TYPE A CHILD ROW NAMES. Without
-- the type in the knob, iam.accessible_child_parents and iam.accessible_entity_ids list every row of that type a
-- person reaches before any file read answers: for `record` that never returned for a member (> 20 s for
-- test@test.com with one record-parented file). So the type leaves the knob only when no child row names it
-- (move or delete those files first, or revert entityids_b so `record` is no file parent type at all).
declare
  v_old text[]; v_new text[]; v_gone text; v_tok text; v_cols text[]; v_schema text; v_table text; v_hit boolean;
begin
  if old.feature is distinct from 'access' or old.key is distinct from 'child_parent_asks_ids' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  v_old := array(select jsonb_array_elements_text(coalesce(old.value, old.default_value) -> 'types'));
  if tg_op = 'UPDATE' and new.feature = 'access' and new.key = 'child_parent_asks_ids' then
    if jsonb_typeof(coalesce(new.value, new.default_value) -> 'types') = 'array' then
      v_new := array(select jsonb_array_elements_text(coalesce(new.value, new.default_value) -> 'types'));
    else
      v_new := array['record'];   -- what both functions read when the value names no list
    end if;
  else
    v_new := array['record'];     -- a removed or renamed row: both functions fall back to record
  end if;
  foreach v_gone in array v_old loop
    continue when v_gone = any (v_new);
    for v_tok in select et.token from platform.entity_types et
                  where et.is_active and platform.child_parent_columns(et.token) is not null loop
      v_cols := platform.child_parent_columns(v_tok);
      select et.schema_name, et.table_name into v_schema, v_table from platform.entity_types et
       where et.token = v_tok and et.is_active;
      execute format('select exists (select 1 from %I.%I t where t.%I = $1)', v_schema, v_table, v_cols[1])
        into v_hit using v_gone;
      if v_hit then
        raise exception 'access/child_parent_asks_ids: % rows name a parent of type %, so % cannot leave the knob', v_tok, v_gone, v_gone
          using hint = 'Without it every read of those rows lists every ' || v_gone || ' a person reaches first (> 20 s). Move or delete those rows first, or revert entityids_b.',
                errcode = '23514';
      end if;
    end loop;
  end loop;
  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

create trigger platform_feature_knob_child_parent_asks_ids_guard
  before update or delete on platform.feature_knob
  for each row when (old.feature = 'access' and old.key = 'child_parent_asks_ids')
  execute function platform.feature_knob_child_parent_asks_ids_guard();

update platform.feature_knob
   set description = 'Parent types whose child files are checked by the parent ids the files name, instead of listing every row of that type a person can reach. A type cannot leave this list while a file names a parent of that type (the listing stalls every file read); revert entityids_b first.'
 where feature = 'access' and key = 'child_parent_asks_ids';

CREATE OR REPLACE FUNCTION platform.kernel_equivalence_expected()
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$ select '{"answers": {"p:record:row_of_a_mine_table:author": true, "p:record:row_of_a_mine_table:member": true, "p:code_repository:repo_public:author": true, "p:code_repository:repo_public:member": true, "p:record:row_of_a_mine_table:grantee": false, "p:record:row_of_an_open_table:author": true, "p:record:row_of_an_open_table:member": true, "s:code_repository:repo_public:author": true, "s:code_repository:repo_public:member": true, "p:code_repository:repo_public:grantee": true, "p:record:row_of_a_mine_table:stranger": false, "p:record:row_of_an_open_table:grantee": false, "s:code_repository:repo_public:grantee": true, "p:code_repository:repo_internal:author": true, "p:code_repository:repo_internal:member": true, "p:code_repository:repo_personal:author": true, "p:code_repository:repo_personal:member": true, "p:code_repository:repo_public:stranger": true, "p:record:row_of_a_mine_table:org_owner": true, "p:record:row_of_an_open_table:stranger": false, "s:code_repository:repo_internal:author": true, "s:code_repository:repo_internal:member": true, "s:code_repository:repo_personal:author": true, "s:code_repository:repo_personal:member": true, "s:code_repository:repo_public:stranger": true, "p:code_repository:repo_internal:grantee": false, "p:code_repository:repo_personal:grantee": false, "p:code_repository:repo_public:org_owner": true, "p:record:row_of_an_open_table:org_owner": true, "s:code_repository:repo_internal:grantee": false, "s:code_repository:repo_personal:grantee": false, "s:code_repository:repo_public:org_owner": true, "p:code_repository:repo_internal:stranger": false, "p:code_repository:repo_personal:stranger": false, "s:code_repository:repo_internal:stranger": false, "s:code_repository:repo_personal:stranger": false, "k:record:row_of_a_mine_table:author:admin": true, "k:record:row_of_a_mine_table:member:admin": false, "p:code_repository:repo_internal:org_owner": true, "p:code_repository:repo_personal:org_owner": true, "p:comment:comment_on_internal_repo:author": true, "p:comment:comment_on_internal_repo:member": true, "p:file:file_under_a_mine_table_row:author": true, "p:file:file_under_a_mine_table_row:member": true, "s:code_repository:repo_internal:org_owner": true, "s:code_repository:repo_personal:org_owner": true, "s:file:file_under_a_mine_table_row:member": true, "k:code_repository:repo_public:author:admin": true, "k:code_repository:repo_public:member:admin": false, "k:record:row_of_a_mine_table:author:editor": true, "k:record:row_of_a_mine_table:author:viewer": true, "k:record:row_of_a_mine_table:grantee:admin": false, "k:record:row_of_a_mine_table:member:editor": true, "k:record:row_of_a_mine_table:member:viewer": true, "k:record:row_of_an_open_table:author:admin": true, "k:record:row_of_an_open_table:member:admin": false, "p:comment:comment_on_internal_repo:grantee": false, "p:file:file_under_a_mine_table_row:grantee": false, "p:file:file_under_an_open_table_row:author": true, "p:file:file_under_an_open_table_row:member": true, "s:file:file_under_an_open_table_row:member": true, "k:code_repository:repo_public:author:editor": true, "k:code_repository:repo_public:author:viewer": true, "k:code_repository:repo_public:grantee:admin": false, "k:code_repository:repo_public:member:editor": true, "k:code_repository:repo_public:member:viewer": true, "k:record:row_of_a_mine_table:grantee:editor": false, "k:record:row_of_a_mine_table:grantee:viewer": false, "k:record:row_of_a_mine_table:stranger:admin": false, "k:record:row_of_an_open_table:author:editor": true, "k:record:row_of_an_open_table:author:viewer": true, "k:record:row_of_an_open_table:grantee:admin": false, "k:record:row_of_an_open_table:member:editor": true, "k:record:row_of_an_open_table:member:viewer": true, "p:comment:comment_on_internal_repo:stranger": false, "p:file:file_under_a_mine_table_row:stranger": false, "p:file:file_under_an_open_table_row:grantee": false, "p:interview_session:session_internal:author": true, "p:interview_session:session_internal:member": true, "p:interview_session:session_personal:author": true, "p:interview_session:session_personal:member": true, "s:interview_session:session_internal:author": true, "s:interview_session:session_internal:member": true, "s:interview_session:session_personal:author": true, "s:interview_session:session_personal:member": true, "k:code_repository:repo_internal:author:admin": true, "k:code_repository:repo_internal:member:admin": false, "k:code_repository:repo_personal:author:admin": true, "k:code_repository:repo_personal:member:admin": false, "k:code_repository:repo_public:grantee:editor": false, "k:code_repository:repo_public:grantee:viewer": true, "k:code_repository:repo_public:stranger:admin": false, "k:record:row_of_a_mine_table:org_owner:admin": true, "k:record:row_of_a_mine_table:stranger:editor": false, "k:record:row_of_a_mine_table:stranger:viewer": false, "k:record:row_of_an_open_table:grantee:editor": false, "k:record:row_of_an_open_table:grantee:viewer": false, "k:record:row_of_an_open_table:stranger:admin": false, "p:comment:comment_on_internal_repo:org_owner": true, "p:file:file_under_a_mine_table_row:org_owner": true, "p:file:file_under_an_open_table_row:stranger": false, "p:interview_session:session_internal:grantee": false, "p:interview_session:session_personal:grantee": false, "s:interview_session:session_internal:grantee": false, "s:interview_session:session_personal:grantee": false, "k:code_repository:repo_internal:author:editor": true, "k:code_repository:repo_internal:author:viewer": true, "k:code_repository:repo_internal:grantee:admin": false, "k:code_repository:repo_internal:member:editor": true, "k:code_repository:repo_internal:member:viewer": true, "k:code_repository:repo_personal:author:editor": true, "k:code_repository:repo_personal:author:viewer": true, "k:code_repository:repo_personal:grantee:admin": false, "k:code_repository:repo_personal:member:editor": true, "k:code_repository:repo_personal:member:viewer": true, "k:code_repository:repo_public:org_owner:admin": true, "k:code_repository:repo_public:stranger:editor": false, "k:code_repository:repo_public:stranger:viewer": true, "k:record:row_of_a_mine_table:author:commenter": true, "k:record:row_of_a_mine_table:member:commenter": true, "k:record:row_of_a_mine_table:org_owner:editor": true, "k:record:row_of_a_mine_table:org_owner:viewer": true, "k:record:row_of_an_open_table:org_owner:admin": true, "k:record:row_of_an_open_table:stranger:editor": false, "k:record:row_of_an_open_table:stranger:viewer": false, "p:file:file_under_an_open_table_row:org_owner": true, "p:interview_session:session_internal:stranger": false, "p:interview_session:session_personal:stranger": false, "s:interview_session:session_internal:stranger": false, "s:interview_session:session_personal:stranger": false, "k:code_repository:repo_internal:grantee:editor": false, "k:code_repository:repo_internal:grantee:viewer": false, "k:code_repository:repo_internal:stranger:admin": false, "k:code_repository:repo_personal:grantee:editor": false, "k:code_repository:repo_personal:grantee:viewer": false, "k:code_repository:repo_personal:stranger:admin": false, "k:code_repository:repo_public:author:commenter": true, "k:code_repository:repo_public:member:commenter": true, "k:code_repository:repo_public:org_owner:editor": true, "k:code_repository:repo_public:org_owner:viewer": true, "k:record:row_of_a_mine_table:grantee:commenter": false, "k:record:row_of_an_open_table:author:commenter": true, "k:record:row_of_an_open_table:member:commenter": true, "k:record:row_of_an_open_table:org_owner:editor": true, "k:record:row_of_an_open_table:org_owner:viewer": true, "p:interview_session:session_internal:org_owner": true, "p:interview_session:session_personal:org_owner": true, "s:interview_session:session_internal:org_owner": true, "s:interview_session:session_personal:org_owner": true, "k:code_repository:repo_internal:org_owner:admin": true, "k:code_repository:repo_internal:stranger:editor": false, "k:code_repository:repo_internal:stranger:viewer": false, "k:code_repository:repo_personal:org_owner:admin": true, "k:code_repository:repo_personal:stranger:editor": false, "k:code_repository:repo_personal:stranger:viewer": false, "k:code_repository:repo_public:grantee:commenter": false, "k:comment:comment_on_internal_repo:author:admin": true, "k:comment:comment_on_internal_repo:member:admin": true, "k:file:file_under_a_mine_table_row:author:admin": true, "k:file:file_under_a_mine_table_row:member:admin": false, "k:record:row_of_a_mine_table:stranger:commenter": false, "k:record:row_of_an_open_table:grantee:commenter": false, "k:code_repository:repo_internal:author:commenter": true, "k:code_repository:repo_internal:member:commenter": true, "k:code_repository:repo_internal:org_owner:editor": true, "k:code_repository:repo_internal:org_owner:viewer": true, "k:code_repository:repo_personal:author:commenter": true, "k:code_repository:repo_personal:member:commenter": true, "k:code_repository:repo_personal:org_owner:editor": true, "k:code_repository:repo_personal:org_owner:viewer": true, "k:code_repository:repo_public:stranger:commenter": false, "k:comment:comment_on_internal_repo:author:editor": false, "k:comment:comment_on_internal_repo:author:viewer": true, "k:comment:comment_on_internal_repo:grantee:admin": false, "k:comment:comment_on_internal_repo:member:editor": true, "k:comment:comment_on_internal_repo:member:viewer": true, "k:file:file_under_a_mine_table_row:author:editor": true, "k:file:file_under_a_mine_table_row:author:viewer": true, "k:file:file_under_a_mine_table_row:grantee:admin": false, "k:file:file_under_a_mine_table_row:member:editor": true, "k:file:file_under_a_mine_table_row:member:viewer": true, "k:file:file_under_an_open_table_row:author:admin": true, "k:file:file_under_an_open_table_row:member:admin": false, "k:record:row_of_a_mine_table:org_owner:commenter": true, "k:record:row_of_an_open_table:stranger:commenter": false, "p:comment:comment_on_shared_personal_repo:author": true, "p:comment:comment_on_shared_personal_repo:member": true, "k:code_repository:repo_internal:grantee:commenter": false, "k:code_repository:repo_personal:grantee:commenter": false, "k:code_repository:repo_public:org_owner:commenter": true, "k:comment:comment_on_internal_repo:grantee:editor": false, "k:comment:comment_on_internal_repo:grantee:viewer": false, "k:comment:comment_on_internal_repo:stranger:admin": false, "k:file:file_under_a_mine_table_row:grantee:editor": false, "k:file:file_under_a_mine_table_row:grantee:viewer": false, "k:file:file_under_a_mine_table_row:stranger:admin": false, "k:file:file_under_an_open_table_row:author:editor": true, "k:file:file_under_an_open_table_row:author:viewer": true, "k:file:file_under_an_open_table_row:grantee:admin": false, "k:file:file_under_an_open_table_row:member:editor": true, "k:file:file_under_an_open_table_row:member:viewer": true, "k:interview_session:session_internal:author:admin": true, "k:interview_session:session_internal:member:admin": false, "k:interview_session:session_personal:author:admin": true, "k:interview_session:session_personal:member:admin": false, "k:record:row_of_an_open_table:org_owner:commenter": true, "p:comment:comment_on_shared_personal_repo:grantee": true, "k:code_repository:repo_internal:stranger:commenter": false, "k:code_repository:repo_personal:stranger:commenter": false, "k:comment:comment_on_internal_repo:org_owner:admin": true, "k:comment:comment_on_internal_repo:stranger:editor": false, "k:comment:comment_on_internal_repo:stranger:viewer": false, "k:file:file_under_a_mine_table_row:org_owner:admin": true, "k:file:file_under_a_mine_table_row:stranger:editor": false, "k:file:file_under_a_mine_table_row:stranger:viewer": false, "k:file:file_under_an_open_table_row:grantee:editor": false, "k:file:file_under_an_open_table_row:grantee:viewer": false, "k:file:file_under_an_open_table_row:stranger:admin": false, "k:interview_session:session_internal:author:editor": true, "k:interview_session:session_internal:author:viewer": true, "k:interview_session:session_internal:grantee:admin": false, "k:interview_session:session_internal:member:editor": true, "k:interview_session:session_internal:member:viewer": true, "k:interview_session:session_personal:author:editor": true, "k:interview_session:session_personal:author:viewer": true, "k:interview_session:session_personal:grantee:admin": false, "k:interview_session:session_personal:member:editor": true, "k:interview_session:session_personal:member:viewer": true, "p:comment:comment_on_shared_personal_repo:stranger": false, "k:code_repository:repo_internal:org_owner:commenter": true, "k:code_repository:repo_personal:org_owner:commenter": true, "k:comment:comment_on_internal_repo:author:commenter": true, "k:comment:comment_on_internal_repo:member:commenter": true, "k:comment:comment_on_internal_repo:org_owner:editor": false, "k:comment:comment_on_internal_repo:org_owner:viewer": true, "k:file:file_under_a_mine_table_row:author:commenter": true, "k:file:file_under_a_mine_table_row:member:commenter": true, "k:file:file_under_a_mine_table_row:org_owner:editor": true, "k:file:file_under_a_mine_table_row:org_owner:viewer": true, "k:file:file_under_an_open_table_row:org_owner:admin": true, "k:file:file_under_an_open_table_row:stranger:editor": false, "k:file:file_under_an_open_table_row:stranger:viewer": false, "k:interview_session:session_internal:grantee:editor": false, "k:interview_session:session_internal:grantee:viewer": false, "k:interview_session:session_internal:stranger:admin": false, "k:interview_session:session_personal:grantee:editor": false, "k:interview_session:session_personal:grantee:viewer": false, "k:interview_session:session_personal:stranger:admin": false, "p:comment:comment_on_shared_personal_repo:org_owner": true, "k:comment:comment_on_internal_repo:grantee:commenter": false, "k:file:file_under_a_mine_table_row:grantee:commenter": false, "k:file:file_under_an_open_table_row:author:commenter": true, "k:file:file_under_an_open_table_row:member:commenter": true, "k:file:file_under_an_open_table_row:org_owner:editor": true, "k:file:file_under_an_open_table_row:org_owner:viewer": true, "k:interview_session:session_internal:org_owner:admin": true, "k:interview_session:session_internal:stranger:editor": false, "k:interview_session:session_internal:stranger:viewer": false, "k:interview_session:session_personal:org_owner:admin": true, "k:interview_session:session_personal:stranger:editor": false, "k:interview_session:session_personal:stranger:viewer": false, "p:code_repository:repo_internal_shared_editor:author": true, "p:code_repository:repo_internal_shared_editor:member": true, "p:code_repository:repo_personal_shared_viewer:author": true, "p:code_repository:repo_personal_shared_viewer:member": true, "s:code_repository:repo_internal_shared_editor:author": true, "s:code_repository:repo_internal_shared_editor:member": true, "s:code_repository:repo_personal_shared_viewer:author": true, "s:code_repository:repo_personal_shared_viewer:member": true, "k:comment:comment_on_internal_repo:stranger:commenter": false, "k:file:file_under_a_mine_table_row:stranger:commenter": false, "k:file:file_under_an_open_table_row:grantee:commenter": false, "k:interview_session:session_internal:author:commenter": true, "k:interview_session:session_internal:member:commenter": true, "k:interview_session:session_internal:org_owner:editor": true, "k:interview_session:session_internal:org_owner:viewer": true, "k:interview_session:session_personal:author:commenter": true, "k:interview_session:session_personal:member:commenter": true, "k:interview_session:session_personal:org_owner:editor": true, "k:interview_session:session_personal:org_owner:viewer": true, "p:code_repository:repo_internal_shared_editor:grantee": true, "p:code_repository:repo_personal_shared_viewer:grantee": true, "s:code_repository:repo_internal_shared_editor:grantee": true, "s:code_repository:repo_personal_shared_viewer:grantee": true, "k:comment:comment_on_internal_repo:org_owner:commenter": true, "k:comment:comment_on_shared_personal_repo:author:admin": true, "k:comment:comment_on_shared_personal_repo:member:admin": false, "k:file:file_under_a_mine_table_row:org_owner:commenter": true, "k:file:file_under_an_open_table_row:stranger:commenter": false, "k:interview_session:session_internal:grantee:commenter": false, "k:interview_session:session_personal:grantee:commenter": false, "p:code_repository:repo_internal_shared_editor:stranger": false, "p:code_repository:repo_personal_shared_viewer:stranger": false, "s:code_repository:repo_internal_shared_editor:stranger": false, "s:code_repository:repo_personal_shared_viewer:stranger": false, "k:comment:comment_on_shared_personal_repo:author:editor": false, "k:comment:comment_on_shared_personal_repo:author:viewer": true, "k:comment:comment_on_shared_personal_repo:grantee:admin": false, "k:comment:comment_on_shared_personal_repo:member:editor": false, "k:comment:comment_on_shared_personal_repo:member:viewer": true, "k:file:file_under_an_open_table_row:org_owner:commenter": true, "k:interview_session:session_internal:stranger:commenter": false, "k:interview_session:session_personal:stranger:commenter": false, "p:code_repository:repo_internal_shared_editor:org_owner": true, "p:code_repository:repo_personal_shared_viewer:org_owner": true, "s:code_repository:repo_internal_shared_editor:org_owner": true, "s:code_repository:repo_personal_shared_viewer:org_owner": true, "k:comment:comment_on_shared_personal_repo:grantee:editor": false, "k:comment:comment_on_shared_personal_repo:grantee:viewer": true, "k:comment:comment_on_shared_personal_repo:stranger:admin": false, "k:interview_session:session_internal:org_owner:commenter": true, "k:interview_session:session_personal:org_owner:commenter": true, "k:comment:comment_on_shared_personal_repo:org_owner:admin": true, "k:comment:comment_on_shared_personal_repo:stranger:editor": false, "k:comment:comment_on_shared_personal_repo:stranger:viewer": false, "k:code_repository:repo_internal_shared_editor:author:admin": true, "k:code_repository:repo_internal_shared_editor:member:admin": false, "k:code_repository:repo_personal_shared_viewer:author:admin": true, "k:code_repository:repo_personal_shared_viewer:member:admin": false, "k:comment:comment_on_shared_personal_repo:author:commenter": true, "k:comment:comment_on_shared_personal_repo:member:commenter": true, "k:comment:comment_on_shared_personal_repo:org_owner:editor": false, "k:comment:comment_on_shared_personal_repo:org_owner:viewer": true, "k:code_repository:repo_internal_shared_editor:author:editor": true, "k:code_repository:repo_internal_shared_editor:author:viewer": true, "k:code_repository:repo_internal_shared_editor:grantee:admin": false, "k:code_repository:repo_internal_shared_editor:member:editor": true, "k:code_repository:repo_internal_shared_editor:member:viewer": true, "k:code_repository:repo_personal_shared_viewer:author:editor": true, "k:code_repository:repo_personal_shared_viewer:author:viewer": true, "k:code_repository:repo_personal_shared_viewer:grantee:admin": false, "k:code_repository:repo_personal_shared_viewer:member:editor": true, "k:code_repository:repo_personal_shared_viewer:member:viewer": true, "k:comment:comment_on_shared_personal_repo:grantee:commenter": false, "k:code_repository:repo_internal_shared_editor:grantee:editor": true, "k:code_repository:repo_internal_shared_editor:grantee:viewer": true, "k:code_repository:repo_internal_shared_editor:stranger:admin": false, "k:code_repository:repo_personal_shared_viewer:grantee:editor": false, "k:code_repository:repo_personal_shared_viewer:grantee:viewer": true, "k:code_repository:repo_personal_shared_viewer:stranger:admin": false, "k:comment:comment_on_shared_personal_repo:stranger:commenter": false, "p:interview_session:session_personal_shared_commenter:author": true, "p:interview_session:session_personal_shared_commenter:member": true, "s:interview_session:session_personal_shared_commenter:author": true, "s:interview_session:session_personal_shared_commenter:member": true, "k:code_repository:repo_internal_shared_editor:org_owner:admin": true, "k:code_repository:repo_internal_shared_editor:stranger:editor": false, "k:code_repository:repo_internal_shared_editor:stranger:viewer": false, "k:code_repository:repo_personal_shared_viewer:org_owner:admin": true, "k:code_repository:repo_personal_shared_viewer:stranger:editor": false, "k:code_repository:repo_personal_shared_viewer:stranger:viewer": false, "k:comment:comment_on_shared_personal_repo:org_owner:commenter": true, "p:interview_session:session_personal_shared_commenter:grantee": false, "s:interview_session:session_personal_shared_commenter:grantee": false, "k:code_repository:repo_internal_shared_editor:author:commenter": true, "k:code_repository:repo_internal_shared_editor:member:commenter": true, "k:code_repository:repo_internal_shared_editor:org_owner:editor": true, "k:code_repository:repo_internal_shared_editor:org_owner:viewer": true, "k:code_repository:repo_personal_shared_viewer:author:commenter": true, "k:code_repository:repo_personal_shared_viewer:member:commenter": true, "k:code_repository:repo_personal_shared_viewer:org_owner:editor": true, "k:code_repository:repo_personal_shared_viewer:org_owner:viewer": true, "p:interview_session:session_personal_shared_commenter:stranger": false, "s:interview_session:session_personal_shared_commenter:stranger": false, "k:code_repository:repo_internal_shared_editor:grantee:commenter": true, "k:code_repository:repo_personal_shared_viewer:grantee:commenter": false, "p:interview_session:session_personal_shared_commenter:org_owner": true, "s:interview_session:session_personal_shared_commenter:org_owner": true, "k:code_repository:repo_internal_shared_editor:stranger:commenter": false, "k:code_repository:repo_personal_shared_viewer:stranger:commenter": false, "k:code_repository:repo_internal_shared_editor:org_owner:commenter": true, "k:code_repository:repo_personal_shared_viewer:org_owner:commenter": true, "k:interview_session:session_personal_shared_commenter:author:admin": true, "k:interview_session:session_personal_shared_commenter:member:admin": false, "k:interview_session:session_personal_shared_commenter:author:editor": true, "k:interview_session:session_personal_shared_commenter:author:viewer": true, "k:interview_session:session_personal_shared_commenter:grantee:admin": false, "k:interview_session:session_personal_shared_commenter:member:editor": true, "k:interview_session:session_personal_shared_commenter:member:viewer": true, "k:interview_session:session_personal_shared_commenter:grantee:editor": false, "k:interview_session:session_personal_shared_commenter:grantee:viewer": false, "k:interview_session:session_personal_shared_commenter:stranger:admin": false, "k:interview_session:session_personal_shared_commenter:org_owner:admin": true, "k:interview_session:session_personal_shared_commenter:stranger:editor": false, "k:interview_session:session_personal_shared_commenter:stranger:viewer": false, "k:interview_session:session_personal_shared_commenter:author:commenter": true, "k:interview_session:session_personal_shared_commenter:member:commenter": true, "k:interview_session:session_personal_shared_commenter:org_owner:editor": true, "k:interview_session:session_personal_shared_commenter:org_owner:viewer": true, "k:interview_session:session_personal_shared_commenter:grantee:commenter": false, "k:interview_session:session_personal_shared_commenter:stranger:commenter": false, "k:interview_session:session_personal_shared_commenter:org_owner:commenter": true}, "version": "v3"}'::jsonb $function$;

CREATE OR REPLACE FUNCTION iam.entity_read_kernel_expected()
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT '5b5ae42d8a6cc11b4df2f1701fe6a800'::text
$function$;
CREATE OR REPLACE FUNCTION iam.entity_read_kernel_members_expected()
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT '{"members": {"files.is_crawl_artifact(p_file_id uuid)": "7eb586213cedff72ee4abb4dd60a0433", "iam.candidate_admits(p_type text, p_id uuid)": "aaafd2a1d1fb3e3579c326fe11d70cac", "iam.accessible_entity_candidates(p_type text)": "ff4a1d407ed7e37438cb773f0d5ce80e", "iam.accessible_child_parents(p_child_type text)": "39ec528a852130df29ce93a1b078115a", "iam.has_org_access_for(p_user_id uuid, p_org uuid)": "05abb4362cb28aa7d775eedf975889f9", "public.is_pack_curator(p_user uuid, p_pack_id uuid)": "5e6f2b3c9c4f0f9011655974ef1532b7", "public.is_org_admin_for(p_user_id uuid, p_org_id uuid)": "ac5072f5e23eb0dfffb7ef05e9899ad4", "files.crawl_site_conveys(p_user_id uuid, p_file_id uuid)": "5fadac4e0d1ad31e788cdb446422d8fc", "public._edu_can_read_via_assignment(p_type text, p_id uuid)": "d97bbb3323238c5b8afb88e3e6337434", "public.is_rulebook_curator(p_user uuid, p_rulebook_id uuid)": "b781c4c0210974d680f53a603cb723aa", "public.library_is_open(p_entity_type text, p_entity_id uuid)": "36c934bb956df459e334c15085aacd30", "public.user_can_read_data_store_via_grant(p_user uuid, p_store uuid)": "63b3fd7f798351c9c8e7517fcfedc3fc", "public._edu_can_read_via_assignment(p_user_id uuid, p_type text, p_id uuid)": "a0d7ac13ea23ec81b8eb15bbb87e3cbb", "public.user_can_read_via_library_grant(p_user uuid, p_type text, p_id uuid)": "a49b44fa2f0de5d3aecace9d950f49e4", "files.has_access_for(p_user_id uuid, p_file_id uuid, p_required permission_level)": "d324b5143d4172b0a6b8b8188930ff7b", "iam.accessible_entity_ids(p_type text, p_required permission_level, p_depth integer)": "9fe155aa00093efd6fc9c89ab94b8479", "iam.has_access_for(p_user_id uuid, p_type text, p_id uuid, p_required permission_level)": "c7e2eec401c991f06be4bf28453548e5", "iam.has_access_for_base(p_user_id uuid, p_type text, p_id uuid, p_required permission_level)": "e37fdacb359b9a528d7aef6b2bfb5270", "iam.accessible_entity_ids(p_type text, p_required permission_level, p_depth integer, p_include_public boolean)": "73212d2bc9bc887bcfeeca88a7fc9e83", "iam.has_access_for_base(p_user_id uuid, p_type text, p_id uuid, p_required permission_level, p_include_public boolean)": "e6b147f6962003e0dc2c8b826ef4ee06", "public.has_permission_for(p_user_id uuid, p_resource_type text, p_resource_id uuid, p_required_permission permission_level)": "679e85b43c11904b2fd68bd563f5b1df", "iam.has_access_for_base(p_user_id uuid, p_type text, p_id uuid, p_required permission_level, p_include_public boolean, p_path text[])": "b664c84d0199c9489847ca146f2b2d5e", "platform.entity_row_access_attrs(p_schema text, p_table text, p_id uuid, OUT o_vis platform.visibility, OUT o_owner uuid, OUT o_org uuid, OUT o_found boolean)": "760dc66d23a0c8ef2b1f06f9a1954f19"}, "fingerprint": "5b5ae42d8a6cc11b4df2f1701fe6a800"}'::jsonb
$function$;

do $post$
declare v_chk jsonb; v_pre jsonb;
begin
  v_chk := platform.kernel_equivalence_check();
  if not coalesce((v_chk->>'ok')::boolean, false) or (v_chk->>'lost')::int <> 0 or (v_chk->>'gained')::int <> 0 or (v_chk->>'missing')::int <> 0 then
    raise exception 'entityids2: after the change the kernel equivalence check is not ok: %', v_chk - 'answers';
  end if;
  if iam.entity_read_kernel_fingerprint() is distinct from iam.entity_read_kernel_expected() then
    raise exception 'entityids2: re-recorded % but the live fingerprint reads %', iam.entity_read_kernel_expected(), iam.entity_read_kernel_fingerprint();
  end if;
  if iam.entity_read_kernel_members_expected() is distinct from
     jsonb_build_object('members', iam.entity_read_kernel_members_live(), 'fingerprint', iam.entity_read_kernel_fingerprint()) then
    raise exception 'entityids2: the recorded members differ from the live members';
  end if;
  v_pre := platform.provision_preflight();
  if exists (select 1 from jsonb_array_elements(coalesce(v_pre->'findings', '[]'::jsonb)) f where f->>'rule_id' = 'preflight.read_kernel') then
    raise exception 'entityids2: the provisioner preflight still names the read kernel: %', v_pre;
  end if;
  insert into platform.kernel_fingerprint_record
    (fingerprint_from, fingerprint_to, members_changed, ruling, fixture_version, evidence, via, target)
  values ('33d13ee5c2f25e1462af8d56d0bcea94', '5b5ae42d8a6cc11b4df2f1701fe6a800',
          array['iam.accessible_child_parents(p_child_type text)', 'iam.accessible_entity_ids(p_type text, p_required permission_level, p_depth integer, p_include_public boolean)'],
          'ENTITY-IDS-2 (2026-10-08): record parents of child files are no longer asked for every id on the platform: the files read policy asks per row, the file set asks only ids that could be the person''s. Proof: identical files.files and file sets for admin@admin.com, test@test.com, dd048-joiner with 20,026 synthetic record-parented files; equivalence v3 ok.',
          'v3', jsonb_build_object('after', v_chk - 'answers'),
          'campaign entityids2_file_reads_cost_what_the_person_reaches.sql / lane ENTITY-IDS-2', 'iam.accessible_child_parents');
end $post$;
