-- chair-step: every REVOKE here narrows a brand-new object only (the server-only shadow log table and three new definer functions) so no client role can reach them; nothing existing loses a privilege
-- lane: KERNEL-SHADOW
-- based-on: custom.reaches_directly_many(uuid, uuid[], text, permission_level) c62f0fbfd8d5609b01c79cd8dcea3945d22bb4f98e52eea775abcc247970bd2a
-- =============================================================================
-- KERNEL-SHADOW — the access kernel's hot path, set-based, in SHADOW MODE.
--
-- iam.has_access_for answers one (person, target) at a time (~0.6-2.3 ms each). data_home asks it
-- ~400 times per load and read_records_page ~17 times per Table at four levels. This file adds the
-- SET form, iam.has_access_for_many, and runs it beside the old form for two test accounts only:
--
--   1. iam.has_access_for_many(person, targets[], level, type default 'record') - one statement over
--      the whole set; every type but `record`, and every target it cannot answer exactly, is handed to
--      iam.has_access_for itself. The rule it implements: common-docs/systems/platform/access/KERNEL.md.
--   2. iam.access_shadow_log - system machinery, server-only: one row per disagreement and one
--      summary row per shadow call (so "no disagreement" is told apart from "never ran").
--   3. iam.has_access_for_shadow - asks both forms, logs, returns the OLD answer. Never raises: a
--      read-only transaction (PostgREST runs STABLE functions read-only) gets a WARNING line instead.
--   4. knob access/kernel_shadow - the people the shadow runs for; seeded with admin@admin.com and
--      test@test.com, empty by default, platform-locked.
--   5. custom.reaches_directly_many - the one caller wired (the data_home walk's set door), AFTER its
--      own answer is produced. Nobody's answer changes; the swap is a separate decision.
--
-- Offline proof before this file (rolled-back transaction on live, 2026-10-07): every Table
-- (19,833) x {admin@admin.com, test@test.com, info@aimatrx.com, tomas.iversen@fixtures,
-- dd048-joiner} x {viewer, editor}: 0 of 198,330 differ; a 2,231-record mix (grants, owned
-- children, Confidential rows, record memberships, Library grants, a missing id) x the same five x
-- four levels: 0 of 44,620 differ.
-- Inverse: migrations/inverse/kernel_shadow_set_based_access_kernel.inverse.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- The shadow log (system machinery, server-only).
-- ---------------------------------------------------------------------------
create table iam.access_shadow_log (
  id          uuid        primary key default gen_random_uuid(),
  person      uuid        not null,
  target      uuid,
  level       text        not null,
  old_answer  boolean,
  new_answer  boolean,
  caller      text        not null,
  compared    integer,
  disagreed   integer,
  error       text,
  at          timestamptz not null default now(),
  constraint access_shadow_log_row_shape check (
    (target is not null and compared is null)            -- one disagreement
    or (target is null and compared is not null)         -- one shadow call's summary
  )
);

comment on table iam.access_shadow_log is
  'KERNEL-SHADOW: where the set form of the access kernel (iam.has_access_for_many) disagrees with the one-at-a-time form (iam.has_access_for). A row with a target is one disagreement (old_answer is what the person got); a row without one summarises one shadow call (compared, disagreed, error). Written only by iam.has_access_for_shadow; server-only.';

create index access_shadow_log_at_idx on iam.access_shadow_log (at desc);
create index access_shadow_log_disagreement_idx on iam.access_shadow_log (person, at desc) where target is not null;


-- ---------------------------------------------------------------------------
-- The set form.
-- ---------------------------------------------------------------------------
create or replace function iam.has_access_for_many(
  p_person  uuid,
  p_targets uuid[],
  p_level   text,
  p_type    text default 'record'
)
returns table(target uuid, allowed boolean)
language plpgsql
stable
security definer
set search_path to ''
as $function$
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
-- THE ONE DIVERGENCE IN WHAT IS READ (not in what is answered): the kernel's anonymous lane asks the
-- row column T-13 retires (= 'public'); this body asks published_to_web, which the T-13 dual-write
-- trigger (_a0_t13_dual_write on every custom.record partition) keeps equal to it on every write. The
-- shadow log is where any disagreement would show.
declare
  v_req     public.permission_level;
  v_lanes   platform.lane_set;
  v_set_ok  boolean;
begin
  if p_targets is null or cardinality(p_targets) = 0 then
    return;
  end if;
  v_req := coalesce(p_level, 'viewer')::public.permission_level;

  if p_person is null then
    return query select distinct x, false from unnest(p_targets) x where x is not null;
    return;
  end if;

  -- The registry facts this body is written against, asked of the same functions the kernel asks.
  v_set_ok := p_type = 'record'
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
    and coalesce(iam.personal_opens_row('record', 'custom', 'record', null), false);

  if not v_set_ok then
    return query
      select u.x, coalesce(iam.has_access_for(p_person, p_type, u.x, v_req), false)
        from (select distinct x from unnest(p_targets) x where x is not null) u(x);
    return;
  end if;

  v_lanes := iam.class_lanes('record');

  return query
  with
  t as materialized (
    select distinct x as id from unnest(p_targets) x where x is not null
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
  w as materialized (
    select t.id,
           r.organization_id as org,
           r.created_by      as owner,
           r.published_to_web as pub,
           r.table_id        as tbl,
           count(r.id) over (partition by t.id) as n_rows
      from t
      left join custom.record r on r.id = t.id
  ),
  -- Per organization the targets live in: archived, admin seat, member access, store switch.
  orgs as materialized (
    select o.org,
           exists (select 1 from iam.organizations x where x.id = o.org and x.archived_at is not null) as archived,
           public.is_org_admin_for(p_person, o.org) as is_admin,
           iam.has_org_access_for(p_person, o.org)  as has_access,
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
                       and not coalesce(bool_or((ct.data ->> 'level') = 'confidential'), false)
                       and not coalesce(bool_or(jsonb_typeof(c.data -> 'parent_id') = 'string'), false))
              from custom.record c
              left join custom.record ct
                on ct.organization_id = c.organization_id and ct.id = c.table_id
               and ct.table_id = custom.table_kernel_id()
             where c.id = w.id and c.data_class = 'record') as anchor_free,
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
              or (v_req = 'viewer' and y.pub)
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
               and v_lanes.org_member_lane and e.has_access and e.store_open
               and not e.addressed) q
  )
  select e.id,
         case
           when e.to_kernel then coalesce(iam.has_access_for(p_person, 'record', e.id, v_req), false)
           when e.n_rows = 0 then false
           when e.archived then false
           when e.conf is not null then e.conf
           when e.early_yes then true
           else coalesce(
                  v_lanes.org_member_lane and e.has_access and e.store_open and not e.addressed
                  and v_req <= (select c.lvl from confers c
                                 where c.org = e.org and c.tbl is not distinct from e.tbl),
                  false)
         end
    from early e;
end;
$function$;

comment on function iam.has_access_for_many(uuid, uuid[], text, text) is
  'KERNEL-SHADOW: the set form of iam.has_access_for for a whole list of targets of one type, resolved once per call. Shadow only (iam.has_access_for_shadow); the rule is common-docs/systems/platform/access/KERNEL.md.';

revoke all on function iam.has_access_for_many(uuid, uuid[], text, text) from public, anon, authenticated;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
values ('iam', 'has_access_for_many', pg_get_function_identity_arguments('iam.has_access_for_many(uuid,uuid[],text,text)'::regprocedure),
        array['uuid'::regtype, 'uuid[]'::regtype, 'text'::regtype, 'text'::regtype]::oid[],
        'p_person is the person asked about (NULL answers false for every target); p_targets are read by exact id from custom.record (an id no row carries answers false); p_level must be a permission level; p_type other than record is answered by iam.has_access_for itself.',
        'migrations/kernel_shadow_set_based_access_kernel.sql (lane KERNEL-SHADOW)',
        'server_only: called only by iam.has_access_for_shadow (and, after a swap Arman decides, by the store doors that already decided the person); no client ever calls it.', false, false);

create or replace function iam.kernel_shadow_on(p_person uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $function$
-- KERNEL-SHADOW: is the access-kernel shadow on for this person (knob access/kernel_shadow, a list of
-- user ids, empty by default)? Any failure to read the knob answers false: the shadow is optional
-- and must never stand between a person and an answer.
begin
  if p_person is null then return false; end if;
  return coalesce(platform.knob_resolve('access', 'kernel_shadow', null) ? p_person::text, false);
exception when others then
  return false;
end;
$function$;

revoke all on function iam.kernel_shadow_on(uuid) from public, anon, authenticated;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
values ('iam', 'kernel_shadow_on', pg_get_function_identity_arguments('iam.kernel_shadow_on(uuid)'::regprocedure),
        array['uuid'::regtype]::oid[],
        'p_person is compared to the user ids listed in knob access/kernel_shadow; NULL answers false.',
        'migrations/kernel_shadow_set_based_access_kernel.sql (lane KERNEL-SHADOW)',
        'server_only: called only by custom.reaches_directly_many to decide whether to run the access-kernel shadow; no client ever calls it.', false, false);

-- ---------------------------------------------------------------------------
-- The shadow.
-- ---------------------------------------------------------------------------
create or replace function iam.has_access_for_shadow(
  p_person  uuid,
  p_targets uuid[],
  p_level   text,
  p_type    text default 'record',
  p_caller  text default null
)
returns table(target uuid, allowed boolean)
language plpgsql
volatile
security definer
set search_path to ''
as $function$
-- KERNEL-SHADOW: ask the one-at-a-time access kernel (iam.has_access_for) and its set form
-- (iam.has_access_for_many) the same question, log every disagreement to iam.access_shadow_log, and
-- return the OLD answer. It never raises: a failure of the set form is logged as an error summary,
-- and a read-only transaction (where nothing can be written) gets a WARNING line tagged KERNEL-SHADOW.
declare
  v_req     public.permission_level := coalesce(p_level, 'viewer')::public.permission_level;
  v_old     jsonb;
  v_new     jsonb;
  v_n       integer := 0;
  v_bad     integer := 0;
  v_err     text;
  v_caller  text := coalesce(p_caller, 'direct');
begin
  if p_targets is null or cardinality(p_targets) = 0 then
    return;
  end if;

  select coalesce(jsonb_object_agg(u.x::text, coalesce(iam.has_access_for(p_person, p_type, u.x, v_req), false)), '{}'::jsonb)
    into v_old
    from (select distinct x from unnest(p_targets) x where x is not null) u(x);
  v_n := (select count(*) from jsonb_object_keys(v_old));

  begin
    select coalesce(jsonb_object_agg(m.target::text, m.allowed), '{}'::jsonb)
      into v_new
      from iam.has_access_for_many(p_person, p_targets, p_level, p_type) m;
  exception when others then
    v_err := sqlstate || ' ' || sqlerrm;
    v_new := null;
  end;

  if v_new is not null then
    v_bad := (select count(*) from jsonb_each(v_old) o
               where (v_new -> o.key) is distinct from o.value);
  end if;

  begin
    if v_new is not null and v_bad > 0 then
      insert into iam.access_shadow_log (person, target, level, old_answer, new_answer, caller)
      select p_person, o.key::uuid, v_req::text, (o.value)::text::boolean,
             (v_new ->> o.key)::boolean, v_caller
        from jsonb_each(v_old) o
       where (v_new -> o.key) is distinct from o.value;
    end if;
    insert into iam.access_shadow_log (person, target, level, caller, compared, disagreed, error)
    values (p_person, null, v_req::text, v_caller, v_n, case when v_new is null then null else v_bad end, v_err);
  exception when others then
    raise warning 'KERNEL-SHADOW person=% level=% caller=% compared=% disagreed=% error=% (not logged: % %)',
      p_person, v_req, v_caller, v_n, case when v_new is null then null else v_bad end, v_err, sqlstate, sqlerrm;
  end;

  return query select o.key::uuid, (o.value)::text::boolean from jsonb_each(v_old) o;
end;
$function$;

comment on function iam.has_access_for_shadow(uuid, uuid[], text, text, text) is
  'KERNEL-SHADOW: asks iam.has_access_for and iam.has_access_for_many, logs disagreements to iam.access_shadow_log, returns the OLD answer. Never raises.';

revoke all on function iam.has_access_for_shadow(uuid, uuid[], text, text, text) from public, anon, authenticated;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
values ('iam', 'has_access_for_shadow', pg_get_function_identity_arguments('iam.has_access_for_shadow(uuid,uuid[],text,text,text)'::regprocedure),
        array['uuid'::regtype, 'uuid[]'::regtype, 'text'::regtype, 'text'::regtype, 'text'::regtype]::oid[],
        'Same arguments as iam.has_access_for_many (p_person NULL answers false; ids read by exact id); p_caller is a label written to the log.',
        'migrations/kernel_shadow_set_based_access_kernel.sql (lane KERNEL-SHADOW)',
        'server_only: called only by custom.reaches_directly_many for the people knob access/kernel_shadow names; it writes iam.access_shadow_log, so no client ever calls it.', false, false);

-- ---------------------------------------------------------------------------
-- The one caller wired: custom.reaches_directly_many (the data_home walk's set door).
-- ---------------------------------------------------------------------------
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
-- KERNEL-SHADOW (2026-10-07): the shadow call at the end; see there.
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
  -- KERNEL-SHADOW (2026-10-07): for the people the knob access/kernel_shadow names, ask the set form
  -- of the access kernel beside the one-at-a-time form and log any disagreement. Asked AFTER the
  -- answer above, so nothing it does can change that answer; its own return value is not used here.
  if p_user_id is not null and iam.kernel_shadow_on(p_user_id) then
    perform iam.has_access_for_shadow(p_user_id, p_targets, p_required::text, p_type,
                                      'custom.reaches_directly_many');
  end if;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Registration, and row security LAST: on this database every ALTER TABLE fires pgsodium's mask
--    trigger, which takes ACCESS EXCLUSIVE on every auth/storage table until commit (sign-ins wait),
--    so it is the final statement and the transaction ends right after it.
-- ---------------------------------------------------------------------------
insert into platform.entity_types (
  token, schema_name, table_name, label, base_tier, is_versioned, has_soft_delete, is_active,
  notes, is_listed, is_component, is_module, rls_variant, reference_pickable, audit_class,
  audit_class_reason, relation_kind, data_class, data_class_reason, default_list_scope,
  origin, type, type_reason, agent_writable, allow_preview, table_ref
)
values (
  'access_shadow_log', 'iam', 'access_shadow_log', 'Access kernel shadow log', 1, false, false, true,
  'Disagreements between the set form and the one-at-a-time form of the access kernel, plus one summary row per shadow call.',
  false, false, false, 'system', false, 'machinery',
  'Server-only log written by iam.has_access_for_shadow; iam.apply_rls must never generate client policies over it.',
  'table', 'organization',
  'System machinery has no client lane; it holds person and target ids and two booleans per disagreement.',
  'organization', 'standard', 'system',
  'Access-kernel machinery (KERNEL-SHADOW), consumed only by definer functions and the owning lane.',
  false, false, 'iam.access_shadow_log'::regclass
);

-- ---------------------------------------------------------------------------
-- The knob: who the shadow runs for.
-- ---------------------------------------------------------------------------
insert into platform.feature_knob (
  feature, key, value, default_value, value_type, label, description, set_by, basis, review_due,
  overridable_by, delegable, not_delegable_reason
)
values (
  'access', 'kernel_shadow',
  '["87a6e699-3622-4869-8843-d0867456c0dd", "4060701e-706a-4c76-b3ca-0bbc69fa5a14"]'::jsonb,
  '[]'::jsonb, 'json',
  'Access kernel shadow',
  'The people (user ids) for whom the set form of the access kernel runs beside the old form and logs disagreements. Answers never change.',
  'agent',
  'KERNEL-SHADOW 2026-10-07: shadow the set kernel on the two test accounts (admin@admin.com, test@test.com) before any swap.',
  current_date + 30,
  '{}'::text[], false,
  'A platform diagnostic over the access kernel itself; no organization or person decides who is shadowed.'
)
on conflict (feature, key) do nothing;

alter table iam.access_shadow_log enable row level security;
revoke all on iam.access_shadow_log from public, anon, authenticated;
