-- chair-step: it restores iam.has_access_for_many_in, iam.child_parent_records_worth_asking, iam.accessible_child_parents, iam.accessible_entity_ids, iam.has_access_for_base, iam.entity_read_expr and files._record_children_follow_their_record to their ENTITY-IDS-2 bodies, drops iam.child_parent_ids_allowed and the unpublish trigger and puts the kernel fingerprint back on 5b5ae42d8a6cc11b4df2f1701fe6a800
-- lane: ENTITY-IDS-3
-- based-on: iam.has_access_for_many_in(uuid, uuid[], uuid[], text, text) 7edfef5694cde55062c757026b2d71a184ba5298ff6e3493fe67fce5b9e3dcb9
-- based-on: iam.child_parent_records_worth_asking(uuid, uuid[], uuid[]) 919ec5f83a4b41a7bc7defb7f2c1de62acd315acb540c9c3333eb66c388cce9d
-- based-on: iam.accessible_child_parents(text) 27a18173ab8dc0383832e61c11acba2973bee7831d0ddc2dc3f1a1f41df4d204
-- based-on: iam.accessible_entity_ids(text, permission_level, integer, boolean) ff647c3b938e643b8269a4cb65f65d2a973de8d30d672902ddc978b6d567860f
-- based-on: iam.has_access_for_base(uuid, text, uuid, permission_level, boolean, text[]) 9f8aab2acb725254b4d769f799bbf5c24000951ff10f25d97798710c781053b0
-- based-on: iam.entity_read_expr(text, text, text, text) 5de53a08d6713b18cb63b3111ed8f9f411cde07df66263146aa667021addfe09
-- based-on: files._record_children_follow_their_record() d9578eb3c172b9bd53078d7f77aac53237edc6250c837c920a495671fa4b0a39
-- based-on: iam.entity_read_kernel_expected() 38abd5b2d62808f6b77d7041460949bf4683060fd75f8c53f53d0ee1ab2062a4
-- based-on: iam.entity_read_kernel_members_expected() 7df2438a12d019c4c8dba56fa131d6bc1423032807d38e5828fee0e3ca31b047
-- window-class: drop trigger zzz_record_level_unpublishes_its_files on custom.record (SHARE ROW EXCLUSIVE on the store until commit)
-- Inverse of migrations/campaign/entityids3a_file_reads_ask_the_person_once.sql; then apply
-- migrations/inverse/entityids3b_files_read_policy_regenerated_down.sql to regenerate the files read policy. Window-class (policy regeneration and
-- trigger drop take ACCESS EXCLUSIVE / SHARE ROW EXCLUSIVE locks): run between 1 and 4 AM Pacific.

do $pre$
begin
  if iam.entity_read_kernel_fingerprint() is distinct from '7c5a50ff809f674b77591a3498955bcb' then
    raise exception 'entityids3 down: the live access-kernel fingerprint is % but this file was proved against 7c5a50ff809f674b77591a3498955bcb; re-derive the file.', iam.entity_read_kernel_fingerprint();
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

drop function if exists iam.child_parent_ids_allowed(uuid, text, text, permission_level, boolean);
delete from platform.client_callable_door where schema_name = 'iam' and function_name = 'child_parent_ids_allowed';

CREATE OR REPLACE FUNCTION iam.has_access_for_base(p_user_id uuid, p_type text, p_id uuid, p_required permission_level, p_include_public boolean, p_path text[])
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER COST 10000
 SET search_path TO 'public', 'platform', 'iam', 'rag'
AS $function$
declare
  v_schema text; v_table text; v_uid uuid := p_user_id;
  v_vis platform.visibility; v_owner uuid; v_org uuid; v_found boolean;
  v_parent_id uuid; v_child_include_public boolean; rec record; v_attrs record; v_is_org_admin boolean;
  -- 🚨 DD-171 (2026-09-12) — CONTAINMENT NEVER CARRIES A PERSONAL ROW.
  -- True when this row may be reached THROUGH a container at all. See the DD-263 header: the
  -- table_has_visibility half keeps every COMPONENT inheriting from its parent, because
  -- entity_row_access_attrs hard-codes o_vis := 'personal' for a table with no
  -- visibility column and a component has none BY CONTRACT (db-rules §6d-1).
  v_containment_carries boolean;
  -- 🚨 DD-137b (VISIBILITY-BY-CLASS §3.2, chair R1) — THE SAME SOURCE THE MIRROR READS.
  -- iam.entity_read_expr decides which arms to EMIT from this function; this function
  -- decides the same lanes at runtime. One answer, one place. An unset or unregistered token
  -- resolves to `private` here rather than raising: the kernel cannot refuse, because
  -- refusing at runtime is denying a person their own data — so it fails toward privacy
  -- while iam.apply_rls refuses outright (chair R3, both directions).
  v_lanes platform.lane_set;
  -- 🚨 DD-263b (2026-09-15) — THE WALK IS BOUNDED IN **WORK**. See this migration's header.
  -- The containment walk is an explicit breadth-first frontier inside THIS frame. v_visited holds
  -- every node key already expanded across the WHOLE walk (seeded from p_path, which is how a
  -- caller hands in frames it has already resolved), so each node is expanded at most once and the
  -- cost is O(distinct ancestors) rather than O(paths). c_max_depth still refuses an inbound path
  -- at 32; c_max_nodes is the backstop on how much graph ONE access question may read.
  c_max_depth constant integer := 32;
  c_max_nodes constant integer := 1024;
  v_visited text[];
  v_q_type text[]; v_q_id uuid[]; v_q_pub boolean[];
  v_head integer := 1; v_expanded integer := 0;
  v_type text; v_id uuid; v_pub boolean; v_key text;
  -- RC-A2b: a detail answers to the record it is on (see the branch below).
  v_variant text; v_detail jsonb; v_detail_type text; v_detail_id uuid; v_detail_author uuid;
  v_detail_cols text[];  -- RC-A2e: the declared parent pointer (platform.detail_parent_columns)
  -- RC-A2c: the reference gate (platform.reference_gate).
  v_gate_cols text[]; v_gate_type_col text; v_gate_id_col text; v_gate_type text; v_gate_id uuid;
  -- RC-A1 trash rule (platform.trash_hides).
  v_trash_del timestamptz; v_trash_owner uuid;
  -- Access ladder T-11 leak fixes: a child answers to its parent (platform.child_parent_columns).
  v_child_cols text[]; v_child_type text; v_child_id uuid;
  -- CHAIR-CONFIDENTIAL-STORE: a row of a Confidential store Table answers to custom.confidential_answer.
  v_conf boolean;
begin
  if v_uid is null then return false; end if;
  v_visited := coalesce(p_path, ARRAY[]::text[]);
  v_key := p_type || ':' || p_id::text || ':' || (case when p_include_public then 't' else 'f' end);
  if v_visited @> ARRAY[v_key] then
    -- A CYCLE, handed in by a caller that is already resolving this very frame. Not an exception —
    -- the caller asked an access question and must get an ANSWER. `false` is the correct one: the
    -- outer frame is still being evaluated, so if it could have said `true` it would already have.
    raise warning 'iam.has_access_for_base: CARRYING CYCLE refused — % is already on the walk. Path: %. '
      'Answering false (correct: a frame still being evaluated cannot grant through itself). '
      'THIS IS A DATA DEFECT: run select * from platform.undeclared_carrying_cycles() to name it, and '
      'select platform.audit_carrying_cycles() to file it; break the loop by soft-deleting one of '
      'the platform.associations rows (or clearing the parent_id) that closes it.',
      v_key, array_to_string(v_visited || v_key, ' -> ');
    return false;
  end if;
  if coalesce(array_length(p_path, 1), 0) >= c_max_depth then
    raise warning 'iam.has_access_for_base: DEPTH CEILING % reached at %. Path: %. Answering false — '
      'a caller handed in more than % resolved frames. Investigate the path before raising the ceiling.',
      c_max_depth, v_key, array_to_string(v_visited || v_key, ' -> '), c_max_depth;
    return false;
  end if;

  v_q_type := ARRAY[p_type]; v_q_id := ARRAY[p_id]; v_q_pub := ARRAY[p_include_public];

  <<walk>>
  while v_head <= coalesce(array_length(v_q_type, 1), 0) loop
    v_type := v_q_type[v_head]; v_id := v_q_id[v_head]; v_pub := v_q_pub[v_head];
    v_head := v_head + 1;
    v_key := v_type || ':' || v_id::text || ':' || (case when v_pub then 't' else 'f' end);
    continue walk when v_visited @> ARRAY[v_key];
    v_visited := v_visited || v_key;
    v_expanded := v_expanded + 1;
    if v_expanded > c_max_nodes then
      -- The backstop. A single access question has read more of the containment graph than any
      -- real containment can present. Fail closed and SAY SO rather than run to a timeout.
      raise warning 'iam.has_access_for_base: WORK CEILING % nodes reached at %, asking about %:%. '
        'Answering false — the containment graph above this record is larger than one access '
        'question may read. Someone may be denied access they hold. Run '
        'select * from platform.undeclared_carrying_cycles() first: a loop is the usual cause.',
        c_max_nodes, v_key, p_type, p_id;
      return false;
    end if;

    select et.schema_name, et.table_name, et.rls_variant, platform.reference_gate_columns(et.token)
      into v_schema, v_table, v_variant, v_gate_cols
    from platform.entity_types et where et.token = v_type and et.is_active;
    continue walk when v_schema is null;
    v_gate_type_col := v_gate_cols[1]; v_gate_id_col := v_gate_cols[2];
    -- 🚨 RC-A2c (2026-09-25) — A RECORD THAT POINTS AT ANOTHER RECORD IS READ ONLY BY PEOPLE WHO
    -- CAN READ WHAT IT POINTS AT. A War Room thread / room names its subject (anchor_type,
    -- anchor_id) and copies its name; read by its own 'internal' visibility, 13 threads were
    -- readable by members who could not open the project or task. A gated node whose target is
    -- set grants nothing at any level, and carries nothing to its containers, unless the caller
    -- can view the target. An AND on the row's own lanes: it only narrows.
    if v_gate_id_col is not null then
      v_gate_type := null; v_gate_id := null;
      execute format('select %I::text, %I from %I.%I where id = $1',
                     v_gate_type_col, v_gate_id_col, v_schema, v_table)
        into v_gate_type, v_gate_id using v_id;
      continue walk when v_gate_type is not null and v_gate_id is not null
        and not (case when v_gate_type = 'file'
                      then files.has_access_for(v_uid, v_gate_id, 'viewer'::public.permission_level)
                      else iam.has_access_for_base(v_uid, v_gate_type, v_gate_id,
                                                   'viewer'::public.permission_level, true, v_visited)
                 end);
    end if;
    -- 🚨 RC-A1 (2026-09-25, chair ruling: Google Drive behaviour) — A TRASHED RECORD IS ITS
    -- OWNER'S ALONE. For a token that declares it (platform.trash_is_owner_only), a row in its
    -- owner's trash grants nothing to anyone else at any level and carries nothing to its
    -- containers; restore gives every lane back. ONE rule, platform.trash_hides, asked here, by
    -- iam.accessible_entity_ids (set-wise) and by iam.entity_read_expr (the table read policy).
    -- The platform admin lane reads through platform_admin_read and is untouched.
    if platform.trash_is_owner_only(v_type) then
      v_trash_del := null; v_trash_owner := null;
      execute format('select deleted_at, created_by from %I.%I where id = $1', v_schema, v_table)
        into v_trash_del, v_trash_owner using v_id;
      continue walk when platform.trash_hides(v_type, v_trash_del, v_trash_owner, v_uid);
    end if;
    -- 🚨 RC-A2b (2026-09-25) — A DETAIL ANSWERS TO THE RECORD IT IS ON, AND TO NOTHING ELSE.
    -- A `detail` (platform.comments) names its record with (entity_type, entity_id). Until this
    -- branch the kernel resolved a detail's OWN token like any organization-class entity: from
    -- the row's own visibility ('internal' on every comment) plus organization membership, so a
    -- plain member who could not open a colleague's personal note held viewer, commenter AND
    -- editor on its comments, and version_list / version_snapshot / version_restore('comment', …)
    -- read and rewrote them (verify-RC-A2 F1/F2; 22 of 28 live comments exposed). The table
    -- policy already asked the record; now every door that asks about the comment does too.
    --   viewer / commenter  the same level on the record
    --   editor              the author, still holding commenter on the record
    --   admin               the author as above, or admin on the record (cmt_delete's rule)
    -- A soft-deleted detail answers to its author only; a detail never sits on a detail (a
    -- reply goes through the record's thread). No lane below this branch is consulted: no own
    -- visibility, no organization lane, no grant on the comment itself — the record's own
    -- resolution already carries every lane it has. Guard: aidream
    -- db/tests/test_rca2b_comment_follows_its_record.py.
    -- RC-A2e: every DECLARED detail takes this branch whatever its registry variant, and a
    -- `detail` token with no declaration fails closed instead of reading columns it may not have.
    v_detail_cols := platform.detail_parent_columns(v_type);
    if v_variant = 'detail' or v_detail_cols is not null then
      continue walk when v_detail_cols is null;
      v_detail := null;
      execute format('select to_jsonb(t) from %I.%I t where t.id = $1', v_schema, v_table)
        into v_detail using v_id;
      continue walk when v_detail is null;
      -- 1294: THE ONE RESOLVER (platform.detail_parent_of): the preferred typed pointer when set,
      -- else the type column mapped to a kernel token, else the fixed type.
      select p.parent_type, p.parent_id into v_detail_type, v_detail_id
        from platform.detail_parent_of(v_type, v_detail) p;
      v_detail_author := (v_detail ->> 'created_by')::uuid;
      continue walk when v_detail_type is null or v_detail_id is null;
      continue walk when platform.token_is_detail(v_detail_type);
      continue walk when v_detail ->> 'deleted_at' is not null
                     and v_detail_author is distinct from v_uid;
      if p_required <= 'commenter'::public.permission_level then
        if platform.detail_parent_access_for(v_uid, v_detail_type, v_detail_id, p_required) then return true; end if;
      else
        if v_detail_author = v_uid
           and platform.detail_parent_access_for(v_uid, v_detail_type, v_detail_id, 'commenter'::public.permission_level)
        then return true; end if;
        if p_required >= 'admin'::public.permission_level
           and platform.detail_parent_access_for(v_uid, v_detail_type, v_detail_id, 'admin'::public.permission_level)
        then return true; end if;
      end if;
      continue walk;
    end if;
    v_attrs := platform.entity_row_access_attrs(v_schema, v_table, v_id);
    v_vis := v_attrs.o_vis; v_owner := v_attrs.o_owner; v_org := v_attrs.o_org; v_found := v_attrs.o_found;
    continue walk when not coalesce(v_found, false);
    -- 🚨 ACCESS LADDER T-33 (2026-09-28) — AN ARCHIVED ORGANIZATION IS CLOSED, TO EVERYONE. Asked
    -- before every lane: its author, the library lanes, public rows, members, admins, owners, grants
    -- and shares, record memberships, containment. `continue walk` also stops the walk carrying
    -- through the record. Every row is kept; iam.organization_restore reopens all of it at once.
    -- The generated policies ask the same question in one restrictive policy (org_open_gate).
    if v_org is not null
       and exists (select 1 from iam.organizations o where o.id = v_org and o.archived_at is not null) then
      continue walk;
    end if;
    -- 🚨 CHAIR-CONFIDENTIAL-STORE (2026-10-02) — A ROW OF A CONFIDENTIAL STORE TABLE OPENS TO ITS
    -- OWNER AND THE PEOPLE ITS OWN RULES NAME, AND TO NOTHING ELSE (access ladder: Confidential).
    -- custom.record is one token for every store Table, so its class cannot say which Tables are
    -- Confidential; the Table document does (`level`, set only through the Arman-approved door).
    -- One question, custom.confidential_answer: null = not under a Confidential Table (every arm
    -- below runs exactly as before), true/false = the answer, and no other lane is consulted — no
    -- organization lane, no admin lane, no library lane, no containment. A child (a record whose
    -- parent_id climbs to a Confidential row) answers exactly as that row. Shares addressed to the
    -- person, on the row or on its Table, are inside that answer: sharing works at every level.
    if v_type = 'record' and v_schema = 'custom' then
      v_conf := custom.confidential_answer(v_uid, v_id, p_required);
      if v_conf is not null then
        if v_conf then return true; end if;
        continue walk;
      end if;
    end if;
    v_lanes := iam.class_lanes(v_type);
    v_is_org_admin := null;

    if p_required = 'viewer'::public.permission_level
       and public.user_can_read_via_library_grant(v_uid, v_type, v_id)
    then return true; end if;
    -- THE OPEN LIBRARY (2026-08-23): a resource GIVEN to an industry or to
    -- everyone is readable by anyone signed in. The opt-in decides what you are
    -- SHOWN by default, never what you are ALLOWED to see. Organization-audience
    -- grants (pilots, subscriptions) are excluded and stay targeted.
    if p_required = 'viewer'::public.permission_level
       and public.library_is_open(v_type, v_id)
    then return true; end if;
    if v_type = 'seo_starter_pack' and public.is_pack_curator(v_uid, v_id) then return true; end if;
    if v_type = 'rulebook' and public.is_rulebook_curator(v_uid, v_id) then
      if p_required = 'viewer'::public.permission_level then return true; end if;
      if exists (select 1 from platform.rulebook rb
                  where rb.id = v_id and rb.status = 'draft' and rb.deleted_at is null)
      then return true; end if;
    end if;

    v_containment_carries := (v_vis is null
                              or v_vis >= 'internal'::platform.visibility
                              or not iam.table_has_visibility(v_schema, v_table));
    if v_owner = v_uid then return true; end if;
    -- 🚨 ACCESS LADDER T-11y MIRROR (2026-09-28) — A CHILD NEVER OPENS THROUGH THE ORGANIZATION LANES.
    -- iam.org_lane_visibility_sql (the generated read lane) refuses the organization lane to any row
    -- naming its parent record (platform.child_parent_columns), at every visibility level; this kernel
    -- admitted an org member to an `internal` child file of a private chat. The parent pointer is read
    -- here, once, so both organization arms below can ask it; the frontier push further down uses it.
    v_child_cols := platform.child_parent_columns(v_type);
    v_child_type := null; v_child_id := null;
    if v_child_cols is not null then
      execute format('select %I::text, %I from %I.%I where id = $1',
                     v_child_cols[1], v_child_cols[2], v_schema, v_table)
        into v_child_type, v_child_id using v_id;
    end if;
    -- 🚨 DD-136 (2026-09-12) — THE ORG-ADMIN LANE HONOURS `personal` VISIBILITY.
    -- This lane used to `return true` for any org owner/admin at viewer, with no
    -- visibility condition, while the two org lanes below are both guarded
    -- `v_vis >= 'internal'`. That single asymmetry meant `visibility='personal'`
    -- hid a row from a plain member and from nobody else: measured live, a plain
    -- member read 0 of other people's personal conversations and an org admin who
    -- is not a platform admin read 10,817 of them plus 74,485 messages, with no
    -- audit anywhere. Arman, 2026-09-12: the organization reaches a person's
    -- private data only through an audited emergency door, never by an admin
    -- browsing. The door is a GRANT (DD-137 generalises `public.hr_break_glass`),
    -- and a grant is already a first-class lane below — so the door needs no arm
    -- of its own and this guard leaves no bypass.
    --
    -- The `table_has_visibility` half is not a loophole: entity_row_access_attrs
    -- HARD-CODES o_vis := 'personal' for a table with no visibility column, so a
    -- bare `v_vis >= 'internal'` would strip this lane from 305 org-scoped tables
    -- that never declared a visibility contract and cannot hold a `personal` row
    -- at all. iam.entity_read_expr asks the SAME predicate, so the mirror and the
    -- kernel cannot drift on it (db-rules §6d).
    if p_required = 'viewer'::public.permission_level and v_org is not null and v_child_type is null then
      if v_is_org_admin is null then
        -- Access ladder T-36: a row of a Table set to "Only me" opens to the organization's owners
        -- and admins like any row of an Organization table; "Only me" hides it from their lists
        -- and never locks (SHARE-LANE-2's lock removed; the read policy never carried it).
        v_is_org_admin := public.is_org_admin_for(v_uid, v_org);
      end if;
      -- 🚨 DD-136b (2026-09-12) — AND A COMPONENT ASKS ITS PARENT.
      -- `not iam.table_has_visibility(...)` alone was too generous: 281 of the
      -- 305 tables it spared are COMPONENTS, and a component has no visibility
      -- column precisely BECAUSE its access is its parent's (db-rules §6d-1), not
      -- because it holds nothing private. It left every chat.message inside a
      -- `personal` conversation readable by the organization's admins after
      -- DD-136 had closed the conversation itself — 71,424 of them for one real
      -- admin. A component with a registered parent needs no role arm: its
      -- generated lane resolves the parent's accessible ids, so an admin who may
      -- read the parent still reads all of it, and an admin who may not, does not.
      -- DD-137b: and the CLASS decides whether this lane exists at all. coalesce(...,true)
      -- keeps a component/ledger token (NULL lanes — its access IS its parent's) exactly as
      -- it is; the parent it walks to is gated on its own class.
      if v_lanes.org_role_lane
         and v_is_org_admin
         and (v_vis >= 'internal'::platform.visibility
              -- Access ladder T-11: on an Organization table `personal` hides from lists; it
              -- never locks (children and private-class rows excepted: iam.personal_opens_row).
              or (v_vis = 'personal'::platform.visibility
                  and iam.personal_opens_row(v_type, v_schema, v_table, v_id))
              or (not iam.table_has_visibility(v_schema, v_table)
                  and not iam.token_is_parented_component(v_type)))
      then return true; end if;
    end if;
    if v_pub and v_vis = 'public'::platform.visibility and p_required = 'viewer'::public.permission_level then return true; end if;
    -- 🚨 DD-185 (2026-09-13) — AND THE CLASS DECIDES WHETHER THIS ARM EXISTS AT ALL.
    -- This is the §6e global-readable system-organization lane, and it admits EVERY SIGNED-IN
    -- ACCOUNT — it asks about no membership, no role and no grant. Until this line it was
    -- unconditional, so a `confidential` row owned by the global-readable system org was readable
    -- by every signed-in user including a non-member (measured 0 -> 8, B-65). DD-174 fixed exactly
    -- this in the ledger branch; this is the same rule, in the resolver every other variant asks.
    -- The mirror (iam.entity_read_expr) drops the same arm in the same breath — the policy TEXT is
    -- what a real HTTP read runs against, the kernel is what the bounded has_access arm asks, and
    -- closing one without the other closes nothing (DD-170's lesson, the other way round).
    if v_pub and p_required = 'viewer'::public.permission_level
       and v_lanes.resolved_class in ('organization','public')
       and v_vis >= 'internal'::platform.visibility and v_org is not null
       and v_org in (select organization_id from iam.system_orgs where global_readable) then return true; end if;
    -- DD-137b: our own staff go through the door too on the two private classes (§3.1
    -- derivation two). This is the runtime half of suppress_platform_admin_lane.
    -- DD-170 (2026-09-13): THE SAME WALL DD-165 GAVE THE OTHER STAFF ARMS, applied here too.
    -- This arm used to admit a super admin to ANY row owned by a global_readable system org
    -- with no visibility guard at all — the one staff arm DD-165 named but did not close
    -- (measured: 8 personal rows, browser.site_policy 4, mandate.binding 2, education.learn_doc 1,
    -- agent.definition 1). Same predicate as the org-admin arm above: a table with a real
    -- visibility column is walled at >= internal; a table with none at all (and not a parented
    -- component, which has no visibility concept of its own) keeps the arm it always had.
    if v_lanes.platform_admin_lane
       and v_org is not null and v_org in (select organization_id from iam.system_orgs where global_readable)
       and (v_vis >= 'internal'::platform.visibility
            or (not iam.table_has_visibility(v_schema, v_table) and not iam.token_is_parented_component(v_type)))
       and public.is_super_admin_for(v_uid) then return true; end if;
    if public.has_permission_for(v_uid, v_type, v_id, p_required) then return true; end if;
    if exists (
      select 1 from iam.memberships m
      join iam.membership_grant g on g.member_role = m.role and g.container_type in (v_type, '*')
      where m.container_type = v_type and m.container_id = v_id and m.user_id = v_uid
        and m.deleted_at is null and g.confers >= p_required) then return true; end if;
    if p_required = 'viewer'::public.permission_level and public._edu_can_read_via_assignment(v_uid, v_type, v_id) then return true; end if;
    -- DD-137b: the late org lanes, each answering to the class that owns it. The
    -- `visibility >= internal` guard is DD-136's and is unchanged — the class says whether
    -- the lane exists, the row's own value says how far it reaches. DD-263b: evaluated with the
    -- rest of THIS node's arms rather than between the two containment walks; see the header —
    -- the result is a disjunction over the reachable nodes and cannot depend on the order.
    -- Access ladder T-11: on an Organization table `personal` no longer locks the organization's
    -- lanes — it is "Only me", a list filter. A child (a file naming its parent record) and a
    -- private/confidential-class row keep the lock (iam.personal_opens_row).
    if (v_vis >= 'internal'::platform.visibility
        or (v_vis = 'personal'::platform.visibility
            and iam.personal_opens_row(v_type, v_schema, v_table, v_id)))
       and v_org is not null and v_child_type is null then
      if v_lanes.org_role_lane then
        if v_is_org_admin is null then
        -- Access ladder T-36: a row of a Table set to "Only me" opens to the organization's owners
        -- and admins like any row of an Organization table; "Only me" hides it from their lists
        -- and never locks (SHARE-LANE-2's lock removed; the read policy never carried it).
        v_is_org_admin := public.is_org_admin_for(v_uid, v_org);
      end if;
        if v_is_org_admin then return true; end if;
      end if;
      -- 🚨 VIS-2 (2026-09-19) — AND THE ORGANIZATION ITSELF DECIDES WHETHER THIS LANE
      -- EXISTS. This is the arm that made "every member of an organization sees every record
      -- in it" a fact of the platform rather than a choice: `v_lanes.org_member_lane` is a
      -- property of the TOKEN (every `organization`-class table has it) and nothing anywhere
      -- let one organization say otherwise. `custom/member_default_visibility` is that
      -- sentence, resolved through the one knob ladder and overridable at the organization
      -- rung: `all_records` (the default, and exactly the behaviour above) or `shared_only`,
      -- where membership alone confers nothing and a member reaches a record by owning it, by
      -- a grant, or by containment carrying one — every other arm of this walk, untouched.
      --
      -- The `v_schema = 'custom'` guard is not a carve-out, it is the COST. This function is
      -- the platform's hot access kernel and runs for every node of every walk; the record
      -- store is the only place the knob has a meaning today, and `v_schema` is already in
      -- hand from the entity_types lookup above, so nothing outside schema `custom` pays a
      -- single extra lookup and nothing outside schema `custom` changes behaviour at all.
      -- The organization admin arms above are deliberately NOT gated: this knob is about what
      -- MEMBERSHIP confers (VIS-19), and who administers an organization is VIS-20's question.
      -- 🚨 LEVEL-FIX (2026-09-19) — AND WHAT MEMBERSHIP CONFERS IS A LEVEL, NOT A CEILING.
      -- VIS-2 gave the organization the word "whether"; this line still hard-coded the word
      -- "how much". Measured live on the main database the day this was written, in a brand-new
      -- organization with two seats and every knob at its shipped default: a plain member who
      -- had been shared one record at VIEWER was answered `editor` by the read door and
      -- rewrote, deleted and re-created the owner's record — and kept writing after the share
      -- was revoked, because this arm never looked at the share or at the knob at all. The two
      -- doors said different things in the same breath: `custom.share_access` reported the
      -- organization default as `iam.member_default_level` (viewer) while this arm admitted
      -- editor.
      --
      -- So the lane asks ONE function, `iam.member_lane_confers`, which is the organization's
      -- own answer to "what does membership alone confer HERE": the `custom/member_default_level`
      -- knob at the organization rung, overridden per Table on the Table record itself, NONE
      -- when the organization has said `shared_only` or the Table carries a `restricted` field —
      -- and NONE when a grant addressed to this person already speaks for this thing, which is
      -- VIS-19 ("roles set a default level; per-thing grants override it") in one line. A grant
      -- is admitted by `public.has_permission_for` above at its own level, so overriding here
      -- never loses a level somebody was actually given; it stops the role default SILENTLY
      -- RAISING one. A `p_required` above what the function returns simply is not admitted
      -- (`<= null` is null, which is not true), so the lane fails closed on an unreadable knob.
      --
      -- EVERYTHING OUTSIDE SCHEMA `custom` IS BYTE-FOR-BYTE UNCHANGED, including the
      -- 2026-08-12 editor cap that every other table on this platform runs on. `v_schema` is
      -- already in hand from the entity_types lookup above, so no table outside the record
      -- store pays one extra lookup, exactly as VIS-2 argued for the line this replaces.
      if v_lanes.org_member_lane and iam.has_org_access_for(v_uid, v_org) then
        if v_schema is distinct from 'custom' or not custom.store_is_open(v_org) then
          -- UNCHANGED: every table outside the record store, and every organization whose
          -- store switch is still off. This is the 2026-08-12 editor cap, reproduced exactly —
          -- EXCEPT the workflow schema (CHAIR-DOORS-3B, lane 11 need 1g, 2026-10-03): a workflow,
          -- its versions and its triggers are SEEN by every member and EDITED by their owner
          -- (v_owner above), an organization admin (v_is_org_admin above) or a grant addressed to
          -- the person (has_permission_for above). Membership alone confers viewer there: "the
          -- organization sees, the owner edits". Proven over real HTTP on the clone before this:
          -- a plain member saved and published a colleague's workflow.
          if p_required <= (case when v_schema = 'workflow' then 'viewer' else 'editor' end)::public.permission_level then return true; end if;
        -- Access ladder T-36: the opening question passes p_personal_hides => true, so an "Only me"
        -- row, or a row of an "Only me" Table, opens to a member at the member level (the list
        -- doors keep the default and still leave it out of lists).
        elsif p_required <= iam.member_lane_confers(v_uid, v_org, v_type, v_id, null, true) then
          return true;
        end if;
      end if;
    end if;

    -- 🚨 ACCESS LADDER T-11 (2026-09-28) — A CHILD OPENS TO WHOEVER CAN OPEN ITS PARENT.
    -- Law: "Children inherit their parent". A row that names its parent record
    -- (platform.child_parent_columns: a file attached to an AI chat, the letter of an HR
    -- verification letter request, a dictation's audio chunk) has no organization lane of its
    -- own (iam.personal_opens_row above); here the parent record joins the frontier at the same
    -- level and the same public flag, so the parent's own lanes, class and trash rule decide.
    -- Owner, grants and containment on the child itself are unchanged. A child with only a type
    -- (its record not there yet, or gone) pushes nothing and stays its owner's.
    -- The set-wise twin is in iam.accessible_entity_ids.
    if v_child_cols is not null then
      -- (the parent pointer was read above, before the organization arms)
      if v_child_type is not null and v_child_id is not null then
        v_q_type := v_q_type || v_child_type;
        v_q_id   := v_q_id   || v_child_id;
        v_q_pub  := v_q_pub  || v_pub;
      end if;
    end if;

    -- No arm on this node granted. Push its containers onto the frontier: the closure first, the
    -- registered FK parents second, both exactly as the recursive body walked them.
    -- ACCESS LADDER T-33 (2026-09-28): a child row (one naming its parent record) opens only through
    -- that parent — never through its folder or any other container.
    if v_containment_carries and v_child_type is null then
      v_child_include_public := v_pub and (v_vis is null or v_vis = 'public'::platform.visibility);
      for rec in
        select r.container_type, r.container_id from platform.reachability r
        where r.item_type = v_type and r.item_id = v_id and r.max_level >= p_required
          -- 🚨 ACCESS LADDER T-35 (2026-09-28) — CONTAINMENT NEVER CARRIES A PRIVATE OR CONFIDENTIAL
          -- ROW. Private opens to its owner alone, Confidential to the people its own rules name;
          -- sitting inside an Organization container (a War Room thread holding a person's audio,
          -- a project holding an AI chat) conveys neither. Measured: test@test.com read 4 of
          -- admin@admin.com's transcripts.studio_sessions through a War Room thread. Composition
          -- (a child answering to its parent) is inheritance, not containment, and is unchanged.
          and v_lanes.resolved_class in ('organization', 'public')
      loop
        if (rec.container_type, rec.container_id) is distinct from (v_type, v_id) then
          v_q_type := v_q_type || rec.container_type;
          v_q_id   := v_q_id   || rec.container_id;
          v_q_pub  := v_q_pub  || v_child_include_public;
        end if;
      end loop;
      for rec in
        select er.parent_type, er.fk_column from platform.entity_relationships er
        where er.child_type = v_type and er.kind in ('composition', 'containment')
          -- ACCESS LADDER T-35: a containment edge carries only an Organization or Public row.
          and (er.kind = 'composition' or v_lanes.resolved_class in ('organization', 'public'))
        order by er.kind, er.parent_type, er.fk_column
      loop
        execute format('select %I from %I.%I where id = $1', rec.fk_column, v_schema, v_table) into v_parent_id using v_id;
        if v_parent_id is not null then
          v_q_type := v_q_type || rec.parent_type;
          v_q_id   := v_q_id   || v_parent_id;
          v_q_pub  := v_q_pub  || v_child_include_public;
        end if;
      end loop;
    end if;
  end loop;
  return false;
end; $function$;

CREATE OR REPLACE FUNCTION iam.entity_read_expr(p_schema text, p_table text, p_token text, p_variant text DEFAULT 'entity'::text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
AS $function$
-- DD-171: containment never carries a personal row — the emitted parent-FK arm stops at internal.
declare
  v_t33_start integer; v_t33_child text[];
  v_has_org boolean;
  v_has_vis boolean;
  v_arms text[] := '{}';
  v_cands text[] := '{}';
  v_bespoke boolean := false;
  v_owner_col text;
  v_cand text;
  v_expr text;
  v_selfref text;
  v_cycle_rel text;
  v_stale boolean := false;
  -- THE PRIVACY WALL (SPEC-ACCESS §3.5, D14.1/D19). This mirror builds the
  -- `std_select` body for the entity, system AND component lanes, so it owns the
  -- ONE remaining platform-staff arm those three variants carry: the system-org
  -- global-readable lane gated on `public.is_super_admin()`. `restricted`,
  -- `ledger` and `personal` build their own std_select inside
  -- `iam._apply_rls_unchecked` and are already walled there. Omitting the arm is
  -- exactly what §3.5 directs ("omit the v_admin prefix and the is_super_admin()
  -- arm when true"), and it costs a flagged customer table nothing: the arm can
  -- only ever match a row owned by a global_readable SYSTEM org, which a
  -- customer's HR row never is.
  v_suppress_admin boolean := false;
  -- DD-137b (VISIBILITY-BY-CLASS §3.2, chair R1) — THE ONE SOURCE. Which org lanes exist at
  -- all is a REGISTRY fact, true on every token whether or not it has a visibility column.
  -- iam.has_access_for_base reads the SAME function at runtime, so generation-time truth and
  -- runtime truth cannot drift by a single statement (db-rules §6d).
  v_lanes platform.lane_set;
  -- MIRROR-LIVE-FORM (2026-09-27): custom.record asks its per-organization question instead of the
  -- whole-database record set. See the note at the candidate sets below.
  v_record_in_org boolean := false;
  -- ACCESS LADDER T-41 (2026-10-05): platform.entity_types.component_signed_in_read_via_public_parent.
  v_comp_public boolean := true;
  rec record;
begin
  select coalesce(et.suppress_platform_admin_lane, false) into v_suppress_admin
  from platform.entity_types et where et.token = p_token;
  v_suppress_admin := coalesce(v_suppress_admin, false);
  v_lanes := iam.class_lanes(p_token);
  -- ACCESS LADDER T-41 (2026-10-05): does a signed-in reader reach this COMPONENT through a parent that
  -- is merely PUBLIC? A registry fact, default true (the lane every component has always had, so every
  -- other token's text is byte-for-byte unchanged). false = the parent arm walks with
  -- include_public => false, which is what iam.has_access_for_base asks of EVERY component; the
  -- read-lane-v2 correlated arm (it reads the parent's own policy, public lane included) is not used.
  select coalesce(et.component_signed_in_read_via_public_parent, true) into v_comp_public
    from platform.entity_types et where et.token = p_token;
  v_comp_public := coalesce(v_comp_public, true);
  -- 🚨 IS THE THING THIS MIRRORS STILL WHAT IT WAS? Between the sweep that
  -- certified 203 tables and the rollout an hour later, another lane rewrote
  -- `iam.has_access_for_base`: the `data_store`-only early lane became a general
  -- library-grant lane, "THE OPEN LIBRARY" appeared, and two curator lanes with
  -- it. Two tables' proofs flipped to `lost` and the gate refused them — the
  -- system working, but only because someone was running the gate. On a
  -- fingerprint mismatch this function DROPS THE BOUND and emits an unbounded
  -- iam.has_access call: exactly as correct as the pre-D249 policy, merely
  -- slower. Correct-and-slow is the only direction a read policy may fail in.
  v_stale := iam.entity_read_kernel_fingerprint()
             is distinct from iam.entity_read_kernel_expected();
  if v_stale then
    raise warning 'entity_read_expr: the access kernel has CHANGED since this '
      'expression was last proved against it (fingerprint % vs expected %). '
      'Emitting an UNBOUNDED iam.has_access lane for %.% — correct but slow. '
      'Re-read the kernel, update iam.entity_read_expr, re-run '
      'scripts/_verify_entity_read_equivalence.py --apply, then bump '
      'iam.entity_read_kernel_expected().',
      iam.entity_read_kernel_fingerprint(), iam.entity_read_kernel_expected(),
      p_schema, p_table;
  end if;
  select exists (select 1 from information_schema.columns
                  where table_schema=p_schema and table_name=p_table and column_name='organization_id')
    into v_has_org;
  select exists (select 1 from information_schema.columns
                  where table_schema=p_schema and table_name=p_table and column_name='visibility'
                    and udt_schema='platform' and udt_name='visibility')
    into v_has_vis;

  -- ── SUFFICIENT ATTRIBUTE LANES ────────────────────────────────────────────
  -- Each is lifted from iam.has_access_for_base and each is a SUFFICIENT
  -- condition for it to return true, so a row admitted here was always visible.
  -- All read the row's own columns plus UNCORRELATED set subqueries, so every
  -- one is indexable.
  --
  -- array_append, never `||`: `text[] || <unknown literal>` resolves to
  -- array||array and tries to CAST the literal to text[] ("malformed array
  -- literal"), which is how this function failed on its first run.

  -- owner — `if v_owner = v_uid then return true`. CONDITIONAL, because a
  -- COMPONENT has no owner column at all (§6d-1: its access is its parent's),
  -- and this builder serves both variants. platform.entity_row_access_attrs
  -- falls back through created_by -> owner_id -> none, so the arm follows
  -- whichever exists and is simply absent when neither does.
  select case
           when exists (select 1 from information_schema.columns
                         where table_schema=p_schema and table_name=p_table
                           and column_name='created_by') then 'created_by'
           when exists (select 1 from information_schema.columns
                         where table_schema=p_schema and table_name=p_table
                           and column_name='owner_id') then 'owner_id'
         end
    into v_owner_col;
  if v_owner_col is not null and p_variant <> 'component' then
    v_arms := array_append(v_arms, format('%I = (select auth.uid())', v_owner_col));
  end if;

  -- ACCESS LADDER T-13 2.3b (2026-09-28): A CHILD CARRIES NO ACCESS OF ITS OWN
  -- (/policies/access-ladder.md, "Children inherit their parent"). A component's stray
  -- `visibility` column (dropped in T-13 phase 7) never opens a row: the public lane is the
  -- parent's, reached through the parent arm below or the declared anon-via-public-parent lane.
  if v_has_vis and p_variant <> 'component' then
    -- public lane — `p_include_public and v_vis = 'public'`
    v_arms := array_append(v_arms, 'visibility = ''public''');
  end if;

  -- 🚨 THE ORG ARMS ARE ONLY VALID WHEN THE KERNEL CAN SEE AN ORG.
  -- has_access_for_base reads o_org from platform.entity_row_access_attrs, whose
  -- first four branches all need an OWNER column (created_by or owner_id)
  -- alongside organization_id. A table with organization_id and NO owner column
  -- falls through to the fifth branch, which returns o_owner=NULL AND
  -- o_org=NULL — so the kernel's org-admin and system-org lanes CANNOT fire
  -- there, and emitting them would GRANT rows the kernel denies. 13 of the 195
  -- live component tables are exactly that shape (organization_id, no owner).
  -- ACCESS LADDER T-13 2.3b (2026-09-28): and no organization arm on a child either — its
  -- organization_id / created_by / visibility are stray columns, never lanes. Owners, members,
  -- admins and staff of the parent reach the child through the parent arm below.
  if v_has_org and v_owner_col is not null and p_variant <> 'component' then
    -- Every org arm is guarded `organization_id is not null` so the expression
    -- is TOTAL. `x in (select …)` yields NULL, not false, when x is NULL, and
    -- while a USING clause treats NULL as deny — so this is not an access
    -- change — a policy that evaluates to NULL is the kind of thing that reads
    -- as a bug forever after. has_access_for_base guards the same lanes with
    -- `v_org is not null` for the same reason.

    -- org-admin at viewer — `is_org_admin_for(v_uid, v_org)`
    --
    -- ACCESS LADDER T-33 (2026-09-28): the arm asks iam.my_admin_orgs(), the organizations the caller
    -- owns or administers that are NOT archived — the set form of is_org_admin_for, same rule.
    --
    -- 🚨 DD-136 (2026-09-12) — THIS ARM USED TO CARRY NO VISIBILITY GUARD while
    -- the two org arms directly below it both do, so `visibility='personal'`
    -- hid a row from a plain member and from nobody else. Measured live before
    -- the fix: a plain member read 0 of other people's personal conversations,
    -- an org admin who is NOT a platform admin read 10,817 of them plus 74,485
    -- messages, and nothing anywhere recorded that it happened. Arman,
    -- 2026-09-12: the organization reaches a person's private data only through
    -- an audited emergency door, never by an admin browsing (the door is a
    -- grant — DD-137 — and the grant lanes are already below).
    --
    -- The kernel guards the same lane with `v_vis >= 'internal' or not
    -- iam.table_has_visibility(...)`. The second half is why this is an if/else
    -- rather than one string: `platform.entity_row_access_attrs` HARD-CODES
    -- 'personal' for a table with no visibility column, so a table that never
    -- declared a visibility contract must keep the arm it has always had — it
    -- cannot hold a row marked `personal` in the first place. Mirror and kernel
    -- ask the same predicate so they cannot drift (db-rules §6d).
    if v_has_vis then
      v_arms := array_append(v_arms,
        '(organization_id is not null and ' || iam.org_lane_visibility_sql(p_token, '') || ' and organization_id in'
        ' (select iam.my_admin_orgs()))');
    elsif not iam.token_is_parented_component(p_token) then
      -- 🚨 DD-136b (2026-09-12) — A COMPONENT ASKS ITS PARENT, SO IT GETS NO
      -- ROLE ARM. DD-136 spared every table with no visibility column; 281 of
      -- them are components, which have no visibility column precisely BECAUSE
      -- their access is their parent's (db-rules §6d-1). Leaving the arm there
      -- meant an organization's admins kept reading every chat.message inside a
      -- `personal` conversation whose envelope DD-136 had just closed — 71,424
      -- rows for one real admin. The lane they lose here is one they never
      -- needed: the parent-cascade arm below resolves
      -- `iam.accessible_entity_ids('<parent>', 'viewer')`, so an admin who may
      -- read the parent still reads all of its components. Measured before
      -- changing anything: all 281 have a registered parent whose FK column
      -- exists, so not one is left with no lane at all.
      v_arms := array_append(v_arms,
        '(organization_id is not null and organization_id in'
        ' (select iam.my_admin_orgs()))');
    end if;

    if v_has_vis then
      -- global-readable system org at >= internal (db-rules §6e)
      v_arms := array_append(v_arms,
        '(organization_id is not null and visibility >= ''internal''::platform.visibility'
        ' and organization_id in'
        ' (select so.organization_id from iam.system_orgs so where so.global_readable))');
      -- org members at >= internal — the `iam.has_org_access_for` lane
      --
      -- 🚨 SHARED-ONLY (2026-09-19) — AND THE ORGANIZATION ITSELF DECIDES WHETHER THIS LANE
      -- EXISTS. `iam.has_access_for_base` has asked that since VIS-2:
      --
      --     if v_lanes.org_member_lane and iam.has_org_access_for(v_uid, v_org) then
      --       if v_schema is distinct from 'custom' or not custom.store_is_open(v_org) then
      --         if p_required <= 'editor' then return true; end if;     -- the 2026-08-12 cap
      --       elsif p_required <= iam.member_lane_confers(...) then return true; end if;
      --
      -- and this mirror never learned it. VIS-2, LEVEL-FIX and GUARD-SWITCH each recorded the
      -- gap and each left it, because census 7 of `pnpm check:store-doors-decide` keeps
      -- `authenticated` holding no TABLE privilege anywhere in schema `custom`, so no policy
      -- built from this expression is reachable today. That is a fact about the grants, not
      -- about this function: the day one table grant appears in schema `custom`, an
      -- organization that has said `shared_only` hands every member every `internal` row
      -- through the policy text while every door refuses them — the kernel and its mirror
      -- disagreeing in the same breath, which is the exact shape of the defect the sixth pass
      -- found on the door side.
      --
      -- THE TWO GUARDS ARE THE KERNEL'S TWO LINES, in the same order and with the same
      -- posture. `custom.store_is_open` first: an organization that has not turned the record
      -- store on keeps the arm the kernel always had, so nothing changes for it. Then
      -- `iam.member_lane_open`, which is the knob and which fails toward TODAY'S behaviour on
      -- an unreadable registry — over-tightening a read policy denies a legitimate person
      -- their own data, which db-rules §6 treats as the same size of bug as a stranger let in.
      -- Only schema `custom` pays the two calls; every other token emits the arm unchanged.
      if p_schema = 'custom'
         and not exists (select 1 from platform.feature_knob k
                          where k.feature = 'custom' and k.key = 'system_enabled') then
        raise exception 'iam.entity_read_expr: schema custom''''s organization-member arm is held '
          'off by custom.store_is_open, which is the read of the custom/system_enabled knob - and '
          'that knob row does not exist, so the gate is on nothing. Restore the knob row or take '
          'the guard out deliberately; do not ship an arm gated on a switch that is not there.';
      end if;
      v_arms := array_append(v_arms,
        '(organization_id is not null and ' || iam.org_lane_visibility_sql(p_token, '')
        || ' and organization_id in (select iam.my_orgs())'
        || case when p_schema = 'custom'
                then ' and (not custom.store_is_open(organization_id)'
                     || ' or iam.member_lane_open(organization_id))'
                else '' end
        || ')');
    elsif v_lanes.resolved_class = 'organization' and p_schema <> 'custom'
          and not iam.token_is_parented_component(p_token) then
      -- 🚨 ACCESS LADDER (2026-09-28): ORGANIZATION MEANS EVERY MEMBER OPENS IT, visibility column or
      -- not. A table with no visibility column used to get NO member arm here, so coworkers were
      -- locked out of rows the kernel admits (rag.kg_clusters: iam.has_access true, SELECT 0 of 108).
      -- What a member SEES is the "Shown to" list filter, never row security. A child row opens only
      -- through its parent and a Private/Confidential row class stays closed — the same test as
      -- iam.personal_opens_row, which the kernel asks for such a row.
      v_arms := array_append(v_arms,
        '(organization_id is not null'
        || case when platform.child_parent_columns(p_token) is null then ''
                else format(' and %I is null', (platform.child_parent_columns(p_token))[1]) end
        || case when platform.row_class_column(p_token) is null then ''
                else format(' and coalesce(%I::text, ''organization'') not in (''private'', ''confidential'')',
                            platform.row_class_column(p_token)) end
        || ' and organization_id in (select iam.my_orgs()))');
    end if;

    -- system org + super admin — THE LAST STAFF ARM on the entity/system/component
    -- lanes. DD-170 (2026-09-13): walled the same way as the org-admin arm above — the
    -- kernel (iam.has_access_for_base) got this wall first; mirroring it here is the other
    -- half, because the policy TEXT is what a real HTTP read runs against, not the kernel
    -- alone. v_suppress_admin still removes the arm entirely (the privacy wall).
    if not v_suppress_admin then
      if v_has_vis then
        v_arms := array_append(v_arms,
          '(organization_id is not null and visibility >= ''internal''::platform.visibility'
          ' and (select public.is_super_admin())'
          ' and organization_id in'
          ' (select so.organization_id from iam.system_orgs so where so.global_readable))');
      elsif not iam.token_is_parented_component(p_token) then
        v_arms := array_append(v_arms,
          '(organization_id is not null and (select public.is_super_admin())'
          ' and organization_id in'
          ' (select so.organization_id from iam.system_orgs so where so.global_readable))');
      end if;
    end if;
  end if;

  -- The old `data_store`-only early lane (public.user_can_read_data_store_via_grant)
  -- was GENERALISED by the kernel on 2026-08-23 into
  -- `user_can_read_via_library_grant` for EVERY token, so it needs no special
  -- case any more — the platform.entity_grants candidate above covers it. Left
  -- as a note rather than deleted silently: an earlier version of this function
  -- carried a per-row arm here, and the kernel moving underneath it is exactly
  -- what the fingerprint guard exists to catch.

  -- composition / containment parents. A child's own id appears in no id-set,
  -- so the FK is the lane.
  --
  -- 🚨 THE CHILD'S OWN VISIBILITY IS A BOUNDARY, and dropping that guard is a
  -- LEAK. has_access_for_base walks the parent with
  --     v_parent_include_public := p_include_public
  --                                and (v_vis is null or v_vis = 'public')
  -- so an `internal` child does NOT inherit access from a parent that is merely
  -- PUBLIC. Passing the default p_include_public = true instead made
  -- plan.node GAIN 24 rows and web.site GAIN 2 — rows whose own visibility is
  -- `internal` under a public parent. The prover caught it; nothing else would
  -- have.
  --
  -- The flag is per-ROW, so it is emitted as two arms rather than one. A table
  -- with NO visibility column takes the include_public = false arm alone:
  -- platform.entity_row_access_attrs returns 'personal' for such a table, and
  -- 'personal' is neither NULL nor 'public'.
  v_t33_start := coalesce(array_length(v_arms, 1), 0);
  for rec in
    select er.parent_type, er.fk_column
    from platform.entity_relationships er
    where er.child_type = p_token and er.kind in ('composition','containment')
    order by er.kind, er.parent_type, er.fk_column
  loop
    if exists (select 1 from information_schema.columns
                where table_schema=p_schema and table_name=p_table and column_name=rec.fk_column) then
      -- `%I is not null` is not decoration: has_access_for_base guards the walk
      -- with `if v_parent_id is not null`, and without it a NULL FK makes
      -- `NULL in (…)` evaluate to NULL rather than false. 10 of web.site's 45
      -- rows have a NULL brand_id, and they were the last thing standing
      -- between this expression and a total one.
      if p_variant = 'component' and v_comp_public and iam.read_lane_v2_edge_emits(p_token, rec.parent_type, rec.fk_column) then
        -- READ-LANE V2: use the parent policy's correlated arm where the declared edge supports it.
        v_arms := array_append(v_arms, iam.read_lane_v2_parent_arm(rec.parent_type, rec.fk_column));
      elsif p_variant = 'component' then
        -- 🚨 MIRROR THE DEPLOYED LANE HERE, NOT THE KERNEL, and the difference is
        -- not academic. The generated component policy calls the 2-arg
        -- `accessible_entity_ids(parent,'viewer')` — include_public => TRUE —
        -- while has_access_for_base computes
        --   v_parent_include_public := p_include_public and (v_vis is null or v_vis='public')
        -- and a component's v_vis resolves to 'personal', so the KERNEL walks
        -- with FALSE. The deployed lane is therefore MORE PERMISSIVE than the
        -- resolver it is supposed to express.
        --
        -- Measured: mirroring the kernel would have REMOVED 4,784 rows from
        -- runtime.global_execution_event and 4,734 from runtime.global_execution
        -- — live access, for children of public parents. D254 is a PERFORMANCE
        -- defect; re-scoping who can read what inside a performance fix is not
        -- this migration's business and would be indistinguishable, in the
        -- change log, from a bug. The disagreement is filed as its own finding.
        v_arms := array_append(v_arms, format(
          '(%1$I is not null and %1$I in'
          ' (select iam.unnest_uuids(iam.accessible_entity_ids(%2$L, ''viewer''::public.permission_level, 0, %3$s))))',
          rec.fk_column, rec.parent_type, case when v_comp_public then 'true' else 'false' end));
      elsif v_has_vis then
        v_arms := array_append(v_arms, format(
          '(%1$I is not null and (visibility is null or visibility = ''public'') and %1$I in'
          ' (select iam.unnest_uuids(iam.accessible_entity_ids(%2$L, ''viewer''::public.permission_level, 0, true))))',
          rec.fk_column, rec.parent_type));
        v_arms := array_append(v_arms, format(
          '(%1$I is not null and visibility >= ''internal''::platform.visibility and visibility <> ''public'' and %1$I in'
          ' (select iam.unnest_uuids(iam.accessible_entity_ids(%2$L, ''viewer''::public.permission_level, 0, false))))',
          rec.fk_column, rec.parent_type));
      else
        v_arms := array_append(v_arms, format(
          '(%1$I is not null and %1$I in'
          ' (select iam.unnest_uuids(iam.accessible_entity_ids(%2$L, ''viewer''::public.permission_level, 0, false))))',
          rec.fk_column, rec.parent_type));
      end if;
    end if;
  end loop;
  -- ACCESS LADDER T-33 (2026-09-28): a row naming its parent record (platform.child_parent_columns)
  -- opens only through that parent — the container (folder) arms above do not apply to it.
  v_t33_child := platform.child_parent_columns(p_token);
  if v_t33_child is not null then
    for i33 in v_t33_start + 1 .. coalesce(array_length(v_arms, 1), 0) loop
      v_arms[i33] := format('(%I is null and %s)', v_t33_child[1], v_arms[i33]);
    end loop;
  end if;

  -- ── CANDIDATE SETS — every remaining lane, all of them id-PRODUCING ────────

  -- SECURITY DEFINER candidate superset. The raw candidates below remain for
  -- their cheap indexed paths, but protected reachability/entity-grant rows
  -- are intentionally invisible to ordinary users. accessible_entity_ids
  -- reads them inside the canonical boundary and this policy still confirms
  -- every returned id through iam.has_access() below.
  -- D266 (2026-09-12): NEVER on a component. §6d — "Component SELECT resolves
  -- its composition PARENT IDs and filters on the child FKs — never call
  -- accessible_entity_ids on the child token" (the 12.9M-UUID
  -- seo.search_performance_daily class, 2026-08-13). A component's candidate
  -- set is exactly what was proven on 2026-08-26.
  -- 🚨 MIRROR-LIVE-FORM (2026-09-27) — custom.record ASKS ABOUT THE ROW'S OWN ORGANIZATION.
  -- For custom.record the definer superset is `custom.visible_record_ids`, the ladder over every
  -- (organization, Table) the viewer can reach on the whole database. MIRROR-2 (2026-09-20) took it
  -- out of the LIVE std_select policy and put the same question back as its own top-level arm,
  -- `deleted_at is null and iam.record_visible_in_org(...) and iam.has_access(...)`, because
  --     id in (C1 ∪ C2…C6) ∧ H   ≡   (id in C1 ∧ H) ∨ (id in (C2…C6) ∧ H)
  -- and `iam.record_visible_in_org` is `id in C1` for a live row (C1 returns live rows only, hence
  -- `deleted_at is null`). This generator never learned it, so an `iam.apply_rls` on custom.record
  -- would have put the whole-database set back and census 12 judged a text that was not live.
  -- Only (custom, record, record) takes it: the memo's arguments are custom.record's own columns.
  v_record_in_org := p_schema = 'custom' and p_table = 'record' and p_token = 'record'
                     and p_variant <> 'component';
  -- Access ladder T-11 parts t/v: `file` and `folder` do not take the whole reachable set as a
  -- candidate. Their policies decide the owner, organization and folder lanes row by row (the arms
  -- above), and the rest of that set arrives through the lazy arms built below the `file` branch.
  if p_variant <> 'component' and not v_record_in_org and p_token not in ('file', 'folder') then
    v_cands := array_append(v_cands, format(
      'select iam.unnest_uuids(iam.accessible_entity_ids(%L, ''viewer''::public.permission_level, 0, true))',
      p_token));
  end if;

  -- explicit grants (public.has_permission_for)
  v_cands := array_append(v_cands, format(
    'select p.resource_id from iam.permissions p where p.resource_type = %L'
    ' and (p.granted_to_user_id = (select auth.uid())'
    ' or p.granted_to_organization_id in (select iam.my_orgs()))'
    ' and p.status <> ''rejected'' and (p.expires_at is null or p.expires_at > now())', p_token));

  -- container membership + membership_grant
  v_cands := array_append(v_cands, format(
    'select m.container_id from iam.memberships m where m.container_type = %L'
    ' and m.user_id = (select auth.uid()) and m.deleted_at is null', p_token));

  -- association conveyance (platform.reachability). One has_access call per
  -- CONTAINER, not per row; the whole table is 4,501 rows across every type.
  v_cands := array_append(v_cands, format(
    'select r.item_id from platform.reachability r where r.item_type = %L'
    ' and r.max_level >= ''viewer''::public.permission_level'
    ' and iam.has_access(r.container_type, r.container_id, ''viewer'')', p_token));

  -- education assignment (public._edu_can_read_via_assignment), both arms
  v_cands := array_append(v_cands, format(
    'select a.source_id from platform.associations_live a where a.source_type = %L'
    ' and a.target_type = ''scope'' and a.role = ''assignment''', p_token));
  if p_token = 'fc_card' then
    v_cands := array_append(v_cands,
      'select link.source_id from platform.associations_live link'
      ' where link.source_type = ''fc_card'' and link.target_type = ''fc_set'''
      ' and link.role = ''member''');
  end if;

  -- ── THE LIBRARY LANES (kernel, 2026-08-23) — apply to EVERY token ─────────
  -- has_access_for_base now opens with TWO token-agnostic viewer lanes:
  --   public.user_can_read_via_library_grant(uid, type, id)
  --   public.library_is_open(type, id)            -- "THE OPEN LIBRARY"
  -- Both read `platform.entity_grants` keyed on (entity_type, entity_id), so a
  -- single id-set is a superset of both — the audience/industry/membership
  -- filtering inside them only ever NARROWS it, and a candidate set is allowed
  -- to be wide. Missing this is what made platform.rulebook lose 10 rows and
  -- rag.data_stores lose 5 on the rollout's own proof.
  v_cands := array_append(v_cands, format(
    'select g.entity_id from platform.entity_grants g where g.entity_type = %L', p_token));

  -- ── THE CURATOR LANES ─────────────────────────────────────────────────────
  -- 🚨 A CANDIDATE SET MAY NEVER READ THE POLICY'S OWN TABLE. These two lanes
  -- used to be emitted as `select rb.id from platform.rulebook rb join
  -- iam.industry_curators ...`, i.e. a SELECT policy on platform.rulebook whose
  -- USING clause selects from platform.rulebook. Postgres answers that with
  -- `42P17 infinite recursion detected in policy for relation "rulebook"` and
  -- the table becomes unreadable for every non-superuser role — measured live
  -- 2026-09-12, every signed-in GET 500 from 11:10:40Z, the moment DD-136's
  -- step 7 first regenerated the table through this generator.
  --
  -- The kernel's own curator lane is a SECURITY DEFINER door:
  --     if p_type = 'rulebook' and public.is_rulebook_curator(v_uid, p_id) then
  --       if p_required = 'viewer' then return true; end if; ...
  --     if p_type = 'seo_starter_pack' and public.is_pack_curator(v_uid, p_id)
  --       then return true; end if;
  -- so the arm below is that same viewer lane, evaluated the same way, outside
  -- RLS and therefore outside the recursion. It is a SUFFICIENT arm rather than
  -- a candidate set because a boolean door cannot produce an id set, and it
  -- needs no `iam.has_access` confirmation: the kernel grants exactly this.
  if p_token = 'rulebook' then
    v_arms := array_append(v_arms,
      'public.is_rulebook_curator((select auth.uid()), id)');
  end if;
  if p_token = 'seo_starter_pack' then
    v_arms := array_append(v_arms,
      'public.is_pack_curator((select auth.uid()), id)');
  end if;

  -- ── 🚨 BESPOKE RESOLVERS — the ladder is not always has_access_for_base ────
  -- `iam.has_access` -> `iam.has_access_for`, which DISPATCHES BY TOKEN:
  --     when p_type = 'file' then files.has_access_for(...)
  --     else iam.has_access_for_base(...)
  -- A token routed away from the base kernel has lanes this expression knows
  -- nothing about, so bounding its has_access call by base's candidate sets
  -- would DENY rows. That is not hypothetical: it cost `files.files` 7 rows in
  -- the 4,000-row proof, invisible at 60 rows, because a crawl artifact
  -- resolves through `files.crawl_site_conveys` and through nothing in base.
  --
  -- So the dispatch list is read from the live function body and any token this
  -- function does not explicitly understand keeps an UNBOUNDED has_access arm:
  -- slower, and exactly as correct as today. A new bespoke resolver added later
  -- degrades safely instead of silently denying rows.
  select coalesce(bool_or(true), false) into v_bespoke
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'iam' and p.proname = 'has_access_for'
    and p.prosrc ~ ('p_type\s*=\s*''' || p_token || '''');

  if v_bespoke and p_token <> 'file' then
    v_cands := '{}';   -- unknown bespoke resolver: refuse to bound it
  elsif p_token = 'file' then
    -- files.has_access_for = has_access_for_base OR
    --   (files.is_crawl_artifact(f) AND files.crawl_site_conveys(user, f)) at viewer.
    --
    -- ALL THREE branches of crawl_site_conveys become SUFFICIENT ARMS, because a
    -- candidate set here is not small: the file ids reachable through snapshots
    -- and screenshots are 6,971 + 5,945 + 8,655 ids, so bounding the definer
    -- call by them still meant ~22,000 per-row calls and files.files still timed
    -- out. Each branch is org-scoped AND pins the file, so each is a
    -- row-constructor IN against an UNCORRELATED set — evaluated once per query.
    --
    -- The parent-token sets come from `iam.accessible_entity_ids`, NOT from
    -- has_access per row, and the difference is not marginal (measured live as a
    -- real non-admin):
    --     has_access over all 7,014 web.snapshot rows      34.3s
    --     accessible_entity_ids('web_snapshot')             0.26s -> 1 id
    --     has_access over all 8,655 web.screenshot rows    70.9s
    --     accessible_entity_ids('web_screenshot')           0.31s -> 0 ids
    -- Same function family the kernel resolves through, asked set-wise.
    --
    -- `include_public => true` matches the kernel: crawl_site_conveys calls
    -- `iam.has_access_for(...)`, whose 4-arg base wrapper defaults it to true.

    -- Branch 1 — metadata-only site artifact. `ws.id::text` rather than casting
    -- the metadata value: the kernel guards that cast with a uuid regex because
    -- the field is free-form jsonb, and a policy that can raise
    -- `invalid input syntax for type uuid` is a table nobody can read at all.
    -- The metadata predicate also makes `is_crawl_artifact` true, so the arm
    -- implies BOTH halves of the kernel's crawl branch and cannot over-grant.
    v_arms := array_append(v_arms,
      '(metadata @> ''{"system_artifact": true, "artifact_domain": "web_crawl"}''::jsonb'
      ' and (organization_id, metadata->>''web_site_id'') in'
      ' (select ws.organization_id, ws.id::text from web.site ws'
      '   where ws.deleted_at is null'
      '     and ws.id in (select iam.unnest_uuids(iam.accessible_entity_ids(''web_site'', ''viewer''::public.permission_level, 0, true)))))');

    -- Branches 2 and 3 — snapshot body / markdown and screenshot image. CORRELATED, read AS
    -- THE INVOKER, bounded by the SAME accessible-id rule as before (CS-32, R13, 2026-09-18).
    --
    -- THE ONLY CHANGE FROM THE SET FORM IS CORRELATION. Each arm still reads web.snapshot /
    -- web.screenshot inside a policy subquery, which runs with the QUERYING role's privileges
    -- and therefore under those tables' own RLS, and still bounds the snapshot by
    -- `iam.accessible_entity_ids(<parent token>, 'viewer', 0, true)`. Same authority, same
    -- inner RLS, same id rule. What changed is that the subquery now pins the snapshot to the
    -- file being examined, so the FK index answers it instead of the whole table being
    -- materialised into a pair set.
    --
    -- WHY NOT A SECURITY DEFINER HELPER ASKING iam.has_access. That was this lane's first
    -- attempt and an adversarial re-verify killed it: substituting `iam.has_access` for
    -- `std_select(snapshot) ∩ accessible_entity_ids` is NOT the same question. It differs in
    -- both directions, and today's data hid both. Planting `visibility = 'public'` on ONE
    -- web.site turned it into a 361-pair NARROWING for a non-member (361 old-only, 0 new-only),
    -- and has_access's owner lane is a structural WIDENING that is merely unreproducible while
    -- every snapshot creator happens to be an admin or owner. The equivalence "proof" that
    -- lane ran was a coincidence of one afternoon's rows, not a property of the expressions.
    -- Correlation is what made it fast; bypassing RLS only made it wrong.
    --
    -- NULL SEMANTICS ARE UNCHANGED. The set form was
    -- `(organization_id, id) in (select s.organization_id, s.body_file_id ...)`: a row
    -- constructor with a NULL on either side yields NULL, never true, so the row is excluded.
    -- The correlated form compares with `=`, which yields NULL for a NULL and matches nothing,
    -- so the row is excluded there too. `s.body_file_id is not null` is kept anyway rather
    -- than argued away.
    -- Repo guard: tests/test_cs32_crawl_arm_stays_correlated.py.
    v_arms := array_append(v_arms,
      '(coalesce((select bool_or(s.id in (select iam.unnest_uuids(iam.accessible_entity_ids(''web_snapshot'', ''viewer''::public.permission_level, 0, true))))'
      '           from web.snapshot s'
      '           where s.body_file_id = files.id'
      '             and s.organization_id = files.organization_id'
      '             and s.deleted_at is null and s.body_file_id is not null'
      '), false))');
    v_arms := array_append(v_arms,
      '(coalesce((select bool_or(s.id in (select iam.unnest_uuids(iam.accessible_entity_ids(''web_snapshot'', ''viewer''::public.permission_level, 0, true))))'
      '           from web.snapshot s'
      '           where s.markdown_file_id = files.id'
      '             and s.organization_id = files.organization_id'
      '             and s.deleted_at is null and s.markdown_file_id is not null'
      '), false))');
    v_arms := array_append(v_arms,
      '(coalesce((select bool_or(s.id in (select iam.unnest_uuids(iam.accessible_entity_ids(''web_screenshot'', ''viewer''::public.permission_level, 0, true))))'
      '           from web.screenshot s'
      '           where s.file_id = files.id'
      '             and s.organization_id = files.organization_id'
      '             and s.deleted_at is null and s.file_id is not null'
      '), false))');

  end if;

  -- 🚨 ACCESS LADDER T-11 PARTS t/v (2026-09-28) — WHAT iam.accessible_entity_ids ADDED, ASKED
  -- LAZILY, for `file` and `folder`. The bounded arm used to take the caller's WHOLE reachable set as
  -- a candidate (1.3 s for a coworker's files, 0.9 s for folders, paid by every list that met one row
  -- the caller cannot read). Of that set, the owner, public, organization-role, system-organization
  -- and containment (parent folder) lanes are already arms above, evaluated row by row. The rest is
  -- exactly these three, each ANDed with the same confirmation the set form gave it:
  --   1. the organization-member lane read from iam.organization_member (the set form's source),
  --      which still includes an ARCHIVED organization the member arm above (iam.my_orgs) leaves
  --      out — confirmed by iam.has_access as before;
  --   2. the child parent lane (platform.child_parent_columns: a child opens to whoever opens its
  --      parent record), asked once per statement as (parent type, parent id) pairs — confirmed by
  --      iam.has_access as before;
  --   3. the kernel-confirmed candidate lanes (grants, memberships, reachability, assignments,
  --      library grants), unconfirmed in the set and confirmed per row by iam.candidate_admits —
  --      the same iam.has_access_for_base question the set form asked of each candidate.
  -- Only these two tokens: the equivalence was proved for them (every id, three real accounts,
  -- parts t and v). Another token joins the list only with the same proof.
  if p_token in ('file', 'folder') and p_variant <> 'component' and not v_record_in_org then
    if v_lanes.org_member_lane and v_has_org and v_has_vis then
      v_arms := array_append(v_arms, format(
        '(organization_id in (select om.organization_id from iam.organization_member om'
        ' where om.user_id = (select auth.uid())) and %s'
        ' and iam.has_access(%L, id, ''viewer''::public.permission_level))',
        iam.org_lane_visibility_sql(p_token, ''), p_token));
    end if;
    if platform.child_parent_columns(p_token) is not null then
      v_arms := array_append(v_arms, format(
        '(%1$I is not null and %1$I <> %3$L and (%1$I, %2$I) in'
        ' (select c.parent_type, c.parent_id from iam.accessible_child_parents(%3$L) c)'
        ' and iam.has_access(%3$L, id, ''viewer''::public.permission_level))',
        (platform.child_parent_columns(p_token))[1], (platform.child_parent_columns(p_token))[2], p_token));
    end if;
    v_arms := array_append(v_arms, format(
      '(id in (select iam.unnest_uuids(iam.accessible_entity_candidates(%1$L)))'
      ' and iam.candidate_admits(%1$L, id))', p_token));
  end if;

  -- ── the bounded definer call ──────────────────────────────────────────────
  -- Everything the attribute lanes do not decide is decided exactly as before,
  -- by the same function — but only ever ASKED about ids a non-attribute lane
  -- could admit. A row outside both cannot be visible by any lane.
  if v_stale then
    v_cands := '{}';   -- stale mirror: never bound the definer call
  end if;

  -- 🚨 NO CANDIDATE SET MAY READ THE POLICY'S OWN TABLE (2026-09-12).
  -- A SELECT policy whose USING clause selects from its own relation raises
  -- `42P17 infinite recursion detected in policy for relation "..."` and the
  -- table becomes unreadable for every non-superuser role — not slow, not
  -- subtly wrong: 500 on every read. The industry-curator lane was exactly that
  -- for 14 days and went live the moment DD-136 regenerated the table.
  -- `iam.memberships` carries the same latent shape through the membership
  -- candidate (`select m.container_id from iam.memberships m ...`, token
  -- `membership`), so this is a CLASS, not two tokens.
  --
  -- The safe direction is the one this function already takes for a stale
  -- kernel fingerprint and for an unknown bespoke resolver: DROP THE BOUND and
  -- emit the unbounded `iam.has_access` lane. Correct, slower, and it can never
  -- deny a row — the opposite of silently omitting the offending lane, which
  -- WOULD deny rows. It screams so the lane gets a SECURITY DEFINER door of its
  -- own (see the curator lanes above) rather than living on as a slow path.
  v_selfref := '(from|join)[[:space:]]*\(?[[:space:]]*(' || p_schema || '\.)?'
               || p_table || '([^a-z0-9_]|$)';
  if cardinality(v_cands) > 0 then
    foreach v_cand in array v_cands loop
      if v_cand ~* v_selfref then
        raise warning 'entity_read_expr: a candidate lane for %.% READS THAT TABLE '
          'ITSELF (the 42P17 class). Dropping the bound and emitting an unbounded '
          'iam.has_access lane for %.% — correct but slow. Give the lane a SECURITY '
          'DEFINER door instead. Lane: %', p_schema, p_table, p_schema, p_table, v_cand;
        v_cands := '{}';
        exit;
      end if;
    end loop;
  end if;

  -- 🚨 NOR A TABLE WHOSE OWN POLICIES READ THIS TABLE BACK (the two-table 42P17 class, 2026-10-07).
  -- A candidate that reads relation R is a cycle when a policy on R reads this table: Postgres
  -- evaluates R's policy inside ours and ours inside R's, and both tables answer 42P17 to every
  -- signed-in read. Measured: iam.org_industries' library candidate reads platform.entity_grants,
  -- whose entity_grants_select_entitled reads iam.org_industries (industry audience). Same safe
  -- direction as the self-read guard above: drop the bound, emit the unbounded iam.has_access lane.
  -- Detected from pg_depend (every relation a policy expression reads), never from a list.
  if cardinality(v_cands) > 0 and to_regclass(format('%I.%I', p_schema, p_table)) is not null then
    <<cycle>>
    foreach v_cand in array v_cands loop
      for v_cycle_rel in
        select distinct m[1] from regexp_matches(v_cand,
          '(?:from|join)[[:space:]]+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)', 'gi') m
      loop
        if to_regclass(v_cycle_rel) is not null
           and to_regclass(v_cycle_rel) <> to_regclass(format('%I.%I', p_schema, p_table))
           and exists (select 1 from pg_depend d join pg_policy po on po.oid = d.objid
                        where d.classid = 'pg_policy'::regclass and d.refclassid = 'pg_class'::regclass
                          and po.polrelid = to_regclass(v_cycle_rel)
                          and d.refobjid = to_regclass(format('%I.%I', p_schema, p_table))) then
          raise warning 'entity_read_expr: a candidate lane for %.% reads %, whose own policies read %.% '
            'back (the two-table 42P17 class). Dropping the bound and emitting an unbounded '
            'iam.has_access lane. Lane: %', p_schema, p_table, v_cycle_rel, p_schema, p_table, v_cand;
          v_cands := '{}';
          exit cycle;
        end if;
      end loop;
    end loop cycle;
  end if;

  if cardinality(v_cands) = 0 then
    v_arms := array_append(v_arms, format('iam.has_access(%L, id, ''viewer'')', p_token));
  else
    v_arms := array_append(v_arms, format(
      '(id in (%s) and iam.has_access(%L, id, ''viewer''))',
      array_to_string(v_cands, ' union '), p_token));
  end if;
  -- MIRROR-LIVE-FORM: C1 for custom.record, as its own arm (see the candidate sets). Only when the
  -- call is bounded: an unbounded `iam.has_access` arm above already admits every row it would.
  if v_record_in_org and cardinality(v_cands) > 0 then
    v_arms := array_append(v_arms,
      '(deleted_at is null and iam.record_visible_in_org(organization_id, table_id, id, visibility,'
      ' created_by, ''viewer''::public.permission_level)'
      ' and iam.has_access(''record'', id, ''viewer''::public.permission_level))');
  end if;

  -- ══ DD-137b — THE CLASS DECIDES WHICH LANES EXIST AT ALL (§3.1, F-5) ═══════════════
  -- DD-136 decided how WIDE the organization lanes are on the tables that HAVE a visibility
  -- column. On the 371 active tokens that do not, its guard could not be written at all, so
  -- the org-role arm was emitted unguarded and an organization admin read every member''s
  -- rows there (66 users.user_feedback rows and 96 transcripts.studio_runs for one real
  -- admin, measured 2026-09-12). The class answers that question the same way on all 672
  -- tokens, column or no column: a `private` or `confidential` token emits NO
  -- organization-role arm, a `private` token emits no organization-member arm either, and
  -- both close the platform-staff arm — our own staff go through the door too.
  --
  -- coalesce(..., true) is the component/ledger case spelled out: those tokens have NO class
  -- of their own (db-rules §6d-1) and keep exactly the behaviour they have always had; the
  -- parent they resolve through is gated on ITS class.
  -- 🚨 THE ORG-ARM PREFIX IS THE ANCHOR, AND IT IS LOAD-BEARING (DD-137b3a). Every
  -- organization arm this function builds opens with `(organization_id is not null and` —
  -- the generator''s own totality guard, on all four of them. Matching a lane''s INNER text
  -- alone is not enough: `iam.my_orgs()` also lives inside the bounded candidate arm, in the
  -- explicit-grant candidate, so a bare match deleted the whole sharing lane from every
  -- `private` token. The class is a FLOOR (§3.6) — ordinary sharing opens above it per item
  -- and per person, and cancelling that is over-tightening, which db-rules §6 treats as the
  -- same size of bug as a stranger let in.
  -- T-33 fix: the organization-role arm is `organization_id in (select iam.my_admin_orgs())` since
  -- access_ladder_t33; both shapes are recognised so a private/confidential token still loses it.
  if not v_lanes.org_role_lane then
    if not exists (select 1 from unnest(v_arms) a where a like '(organization_id is not null and%'
                    and (a like '%om.role in (''owner'',''admin'')%' or a like '%iam.my_admin_orgs()%')) and v_has_org and v_owner_col is not null and p_variant <> 'component' then
      raise exception 'iam.entity_read_expr: %.% (token %) is class %, which emits no '
        'organization-role arm — but no arm carrying that lane was found to remove. The arm '
        'shapes have moved and this filter is now silently keeping a lane it was written to '
        'cut.', p_schema, p_table, p_token, v_lanes.resolved_class;
    end if;
    v_arms := array(select a from unnest(v_arms) a
                     where not (a like '(organization_id is not null and%'
                                and (a like '%om.role in (''owner'',''admin'')%' or a like '%iam.my_admin_orgs()%')));
  end if;
  -- 🚨 DD-185 (2026-09-13) — THE §6e SYSTEM-ORGANIZATION ARM IS AN EVERY-SIGNED-IN-USER ARM,
  -- SO IT BELONGS TO THE TWO CLASSES WHOSE LANE SET IS WIDER THAN ONE ORGANIZATION.
  -- `org_member_lane` was doing double duty: it is TRUE for `confidential`, so the filter below
  -- kept the global-readable arm on every confidential token — and that arm asks nothing about
  -- membership at all. Measured on this database (B-65, rolled-back rehearsal): a NON-MEMBER read
  -- 8 rows of a confidential `audit_exemption` and 4 of `admin_markdown_sample` through it, and
  -- live today hr.earning_code (24 rows) and hr.auto_close_rule (2) sit behind it.
  -- This is DD-174's ledger-branch rule, character for character: the system-org arm exists only
  -- for `organization` and `public`. `private` loses it here too and then loses the member arm
  -- below; the two filters are independent because the lanes are.
  if not (v_lanes.resolved_class in ('organization','public')) then
    if v_lanes.org_member_lane and v_has_org and v_has_vis and v_owner_col is not null
       and p_variant <> 'component'
       and not exists (select 1 from unnest(v_arms) a
                        where a like '(organization_id is not null and%'
                          and a like '%so.global_readable%'
                          and a not like '%is_super_admin%') then
      raise exception 'iam.entity_read_expr: %.% (token %) is class %, which emits no '
        'global-readable system-organization read arm — but no arm carrying that lane was found '
        'to remove. The arm shapes have moved and this filter is now silently keeping a lane it '
        'was written to cut.', p_schema, p_table, p_token, v_lanes.resolved_class;
    end if;
    v_arms := array(select a from unnest(v_arms) a
                     where not (a like '(organization_id is not null and%'
                                and a like '%so.global_readable%'
                                and a not like '%is_super_admin%'));
  end if;
  if not v_lanes.org_member_lane then
    v_arms := array(select a from unnest(v_arms) a
                     where not (a like '(organization_id is not null and%'
                                and (a like '%iam.my_orgs()%' or a like '%so.global_readable%')
                                and a not like '%is_super_admin%'));
  end if;
  if not v_lanes.platform_admin_lane then
    v_arms := array(select a from unnest(v_arms) a
                     where not (a like '(organization_id is not null and%' and a like '%is_super_admin%'));
  end if;
  -- The OWNER arm is never filtered. Over-tightening is a defect too: db-rules §6 — "a
  -- legitimate user blocked from their own data is as serious a bug as a stranger let in".
  if p_variant <> 'component' and v_owner_col is not null
     and not (format('%I = (select auth.uid())', v_owner_col) = any(v_arms)) then
    raise exception 'iam.entity_read_expr: the class filter removed the OWNER arm from %.% '
      '(token %). No class has ever excluded the owner and none may.', p_schema, p_table, p_token;
  end if;

  v_expr := array_to_string(v_arms, ' or ');

  -- 🚨 THE LAST WALL. The candidate filter above degrades safely, so anything
  -- still reading the table here is an ARM — hand-written, with no safe
  -- degradation available and no way to bound it. That is a coding error in
  -- this function, and a coding error that ships makes the table unreadable
  -- (42P17) for everyone. It dies here, at generation time, naming the table,
  -- instead of at 11:10 on a Saturday in every user's browser.
  -- Repo guard: pnpm check:rls-self-reference.
  if v_expr ~* v_selfref then
    raise exception
      'iam.entity_read_expr: an ARM built for %.% (token %, variant %) reads '
      '%.% ITSELF — a policy that selects from its own relation raises 42P17 '
      'and makes the table unreadable. Route the lane through a SECURITY '
      'DEFINER door (see the curator lanes) instead of a join on the entity.',
      p_schema, p_table, p_token, p_variant, p_schema, p_table;
  end if;

  -- 🚨 RC-A1 (2026-09-25, chair ruling: Google Drive behaviour): for a token that declares it
  -- (platform.trash_is_owner_only) every arm above is ANDed with the kernel's trash rule, so a
  -- row in its owner's trash is read by its owner only. platform_admin_read is a separate
  -- policy and keeps reading every row.
  if platform.trash_is_owner_only(p_token) and v_owner_col is not null and p_variant <> 'component'
     and exists (select 1 from information_schema.columns c
                  where c.table_schema = p_schema and c.table_name = p_table and c.column_name = 'deleted_at') then
    v_expr := format('(%s) and not platform.trash_hides(%L, deleted_at, %I, (select auth.uid()))',
                     v_expr, p_token, v_owner_col);
  end if;

  return v_expr;
end;
$function$;

CREATE OR REPLACE FUNCTION files._record_children_follow_their_record()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- FILE-PARENT-NARROW (2026-10-09): publishing a child is refused only under a Confidential or Private Table's row
-- (access ladder: those levels are never published). Runs after _a0_t13_dual_write, so published_to_web is the one
-- publish lane (T-13).
declare
  v_level text;
begin
  if new.parent_record_type = 'record' and coalesce(new.published_to_web, false) then
    select t.data ->> 'level' into v_level
      from custom.record r
      join custom.record t on t.id = r.table_id and t.data_class = 'table'
     where r.id = new.parent_record_id;
    if v_level in ('confidential', 'private') then
      raise exception using
        errcode = '42501',
        message = format('A file under a %s table row follows its row; it cannot be published.', v_level),
        detail  = format('file %s, row %s', new.id, new.parent_record_id),
        hint    = 'Share the file with the people who need it. To attach a published file to this row, unpublish it first.';
    end if;
  end if;
  return new;
end;
$function$;

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
begin
  if iam.entity_read_kernel_fingerprint() is distinct from iam.entity_read_kernel_expected() then
    raise exception 'entityids3 down: re-recorded % but the live fingerprint reads %', iam.entity_read_kernel_expected(), iam.entity_read_kernel_fingerprint();
  end if;
end $post$;

-- last, so the lock it takes on custom.record is held only until commit
drop trigger if exists zzz_record_level_unpublishes_its_files on custom.record;
drop function if exists files._record_level_unpublishes_its_files();
