-- lane: access-ladder T-11 leak fixes, part s (speed only): three signed-in doors that let a read
-- policy ask for exactly the ids it cannot decide from the row itself, without building the whole
-- reachable set first.
--
-- Why: files.files's read policy bounded its kernel call by `iam.accessible_entity_ids('file')`,
-- which materialises EVERY file id the caller can reach — owner, organization, folder, candidate
-- and child-file lanes — and confirms each candidate with the kernel. Measured as test@test.com
-- (member of admin@admin.com's organization): 1.3 s per statement, paid by every list that meets
-- one row the caller cannot read, and almost all of it duplicates arms the policy already
-- evaluates row by row (owner, organization, folder). What the policy cannot decide row by row is
-- only:
--   1. the candidate lanes the kernel confirms (explicit grants, memberships, reachability,
--      assignments, library grants, curators)   -> iam.accessible_entity_candidates
--   2. the child-file parent lane (a child opens to whoever opens its parent record)
--                                                   -> iam.accessible_child_parents
--   3. the kernel confirmation of a lane-1 candidate -> iam.candidate_admits
-- Part t makes the generator use these for `file`; these functions change nobody's access.
--
-- 🚨 MIRRORS. accessible_entity_candidates is the candidate union of iam.accessible_entity_ids
-- (the `for rec in with have as materialized …` block) and accessible_child_parents is its
-- T-11 parent lane. A lane added there must be added here in the same migration, or files.files
-- stops admitting what the kernel admits.
set local lock_timeout = '2s';

-- 1. Candidate lanes, UNCONFIRMED: every id the kernel's own set form would put to
-- iam.has_access_for_base in its candidate loop (same union, same reachability pruning — a
-- container is kept only when the kernel opens it). No kernel call per candidate: the policy
-- confirms a candidate only when a query actually meets that row (iam.candidate_admits).
create or replace function iam.accessible_entity_candidates(p_type text)
returns uuid[]
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_ids uuid[];
begin
  if v_uid is null then return '{}'::uuid[]; end if;
  with reach_cand as materialized (
    select r.item_id, r.container_type, r.container_id
    from platform.reachability r
    where r.item_type = p_type and r.max_level >= 'viewer'::public.permission_level
  ),
  reach_containers as materialized (
    select distinct rc.container_type, rc.container_id from reach_cand rc
  ),
  reach_worth as materialized (
    select w.container_type, w.container_id
      from iam.reach_containers_worth_asking(v_uid,
             array(select k.container_type from reach_containers k),
             array(select k.container_id from reach_containers k)) w
  ),
  reach_ok as materialized (
    select k.container_type, k.container_id
    from reach_worth k
    where iam.has_access_for_base(v_uid, k.container_type, k.container_id,
                                  'viewer'::public.permission_level, true)
  )
  select array_agg(distinct c.id) into v_ids
  from (
    select p.resource_id as id
    from iam.permissions p
    where p.resource_type = p_type
      and (
        p.granted_to_user_id = v_uid
        or p.granted_to_organization_id in (
          select om.organization_id from iam.organization_member om where om.user_id = v_uid)
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
    where a.source_type = p_type and a.role = 'assignment' and a.target_type = 'scope'
    union
    select g.entity_id
    from platform.entity_grants g
    where g.entity_type = p_type
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
  where c.id is not null;
  return coalesce(v_ids, '{}'::uuid[]);
end;
$function$;

comment on function iam.accessible_entity_candidates(text) is
  'Access ladder T-11 part s: the candidate lanes of iam.accessible_entity_ids for the caller, '
  'UNCONFIRMED (a read policy confirms each with iam.candidate_admits when a query meets the row). '
  'Mirror of the candidate union in iam.accessible_entity_ids: change both together.';

-- 2. The child-file parent lane: (parent type, parent id) pairs whose children open to the caller,
-- exactly as iam.accessible_entity_ids computes it — only the parent types present in the child's
-- table (a loose index scan over its parent-record index), each asked once at depth 1, a same-type
-- pointer left to the kernel.
create or replace function iam.accessible_child_parents(p_child_type text)
returns table(parent_type text, parent_id uuid)
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_cols text[];
  v_schema text; v_table text; v_ptype text;
begin
  if auth.uid() is null then return; end if;
  v_cols := platform.child_parent_columns(p_child_type);
  if v_cols is null then return; end if;
  select et.schema_name, et.table_name into v_schema, v_table
  from platform.entity_types et where et.token = p_child_type and et.is_active;
  if v_schema is null then return; end if;
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
    return query
      select v_ptype, u
      from unnest(iam.accessible_entity_ids(v_ptype, 'viewer'::public.permission_level, 1, true)) u;
  end loop;
end;
$function$;

comment on function iam.accessible_child_parents(text) is
  'Access ladder T-11 part s: the parent records whose child rows (platform.child_parent_columns) '
  'open to the caller. Mirror of the parent lane in iam.accessible_entity_ids: change both together.';

-- 3. The kernel's answer for the caller at viewer, the question iam.accessible_entity_ids asks of
-- each candidate (iam.has_access_for_base with public rows included). Caller-bound: it answers
-- only about auth.uid(), and a caller with no session gets false.
create or replace function iam.candidate_admits(p_type text, p_id uuid)
returns boolean
language plpgsql
stable security definer cost 10000
set search_path to 'public', 'platform', 'iam', 'rag'
as $function$
begin
  return coalesce(iam.has_access_for_base((select auth.uid()), p_type, p_id,
                                          'viewer'::public.permission_level, true), false);
end;
$function$;

comment on function iam.candidate_admits(text, uuid) is
  'Access ladder T-11 part s: iam.has_access_for_base(auth.uid(), type, id, viewer, true) — the '
  'kernel confirmation iam.accessible_entity_ids gives each candidate, asked per row by a read policy.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   gate_predicate, signed_in_callers, anonymous_callers)
values
  ('iam', 'accessible_entity_candidates', 'p_type text', array['text'::regtype]::oid[],
   'SIGNED-IN door. Caller-identity reader used inside read policies: returns only ids the CALLER '
   'holds a candidate lane on (auth.uid()); a caller with no session gets an empty array.',
   'access_ladder_t11s_read_policy_candidate_doors.sql', 'auth.uid()', true, false),
  ('iam', 'accessible_child_parents', 'p_child_type text', array['text'::regtype]::oid[],
   'SIGNED-IN door. Caller-identity reader used inside read policies: returns only parent records the '
   'CALLER can open (iam.accessible_entity_ids); a caller with no session gets no rows.',
   'access_ladder_t11s_read_policy_candidate_doors.sql', 'auth.uid()', true, false),
  ('iam', 'candidate_admits', 'p_type text, p_id uuid', array['text'::regtype, 'uuid'::regtype]::oid[],
   'SIGNED-IN door. Caller-identity predicate used inside read policies: the kernel answer for '
   'auth.uid() only; false with no session.',
   'access_ladder_t11s_read_policy_candidate_doors.sql', 'auth.uid()', true, false);

grant execute on function iam.accessible_entity_candidates(text) to authenticated, service_role;
grant execute on function iam.accessible_child_parents(text) to authenticated, service_role;
grant execute on function iam.candidate_admits(text, uuid) to authenticated, service_role;
