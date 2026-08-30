-- access_request_recipients_container_and_component_lanes.sql
--
-- THE ACCESS-GATE RECIPIENT KERNEL.  Arman ruled (2026-08-30) that every
-- no-access landing must clearly say so and give an easy way to click to
-- request access.  The platform half of that ruling was UNDELIVERED for the
-- most important case: an organization deep link.
--
-- WHAT WAS BROKEN, proven live before this file was written:
--   public.access_denied_context('organization', <id>) returned
--     owner:null, organization:null, can_request:false
--   public.access_request_create('organization', <id>) wrote a `pending` row
--     with recipients: []  -- an ask NOBODY receives.
--
-- ROOT CAUSE.  iam.access_request_recipients asks platform.entity_row_access_attrs
-- for the row's owner and org.  That kernel guesses the shape of a row with four
-- fixed column tuples, and EVERY ONE of them selects `organization_id`:
--     (visibility, created_by, organization_id) | (visibility, owner_id, organization_id)
--     ('personal', owner_id, organization_id)   | ('personal', created_by, organization_id)
-- A table that has an owner column but no `organization_id` matches none of them,
-- falls through to the ownerless-catalog arm, and reads back owner NULL / org NULL.
-- `iam.organizations` is exactly that shape -- it has no `organization_id` because
-- the row IS the organization -- so an organization resolved as an ownerless
-- platform catalog and therefore had nobody to ask.
--
-- CORPUS MEASUREMENT (live, 2026-08-30, all 676 active registered tokens):
--   622  have both an owner column and organization_id -- resolve today
--    17  have organization_id and no owner column      -- resolve via org admins
--    16  have NO organization_id                       -- THE HOLE
-- The convergence lane reported seven; the true count is sixteen.  Of the 16,
-- ELEVEN are registered COMPOSITION COMPONENTS whose parent is already declared in
-- platform.entity_relationships (5 files.*, 2 growth.*, processed_document_page,
-- sch_agent_task, wc_injury, wc_report).  The registry already knew the answer;
-- the recipient resolver just never asked it.
--
-- WHAT THIS FILE CHANGES -- the recipient lane ONLY.  It does not touch
-- platform.entity_row_access_attrs, iam.has_access or any RLS policy, so no
-- access decision anywhere on the platform changes.  The fixed-tuple probe
-- remains a separate, measured defect (it also drops the owner for
-- iam.has_access on 8 tokens); fixing it changes access semantics and owes the
-- house's access-delta proof, so it is reported, not smuggled in here.
--
-- THE FIVE LANES, in the order they are evaluated:
--   A container_admin -- the row IS a membership container (an organization, a
--       project): its deciders are its CURRENT owner/admin memberships, resolved
--       through the iam.membership_grant rule table.
--       *** NOT created_by. ***  transfer_organization_ownership moves the
--       membership row and never touches iam.organizations.created_by (verified:
--       its body does not contain the string), and no access check consults that
--       column for an organization.  Treating the creator as the authority would
--       invent a NEW access-bearing meaning for a column that has none, and would
--       route the ask to someone who handed the company over months ago.  A and B
--       are alternatives chosen by the registry, never both.
--   B owner        -- an ordinary owned row: its owner column, resolved from the
--       catalog (created_by preferred, else owner_id) instead of guessed as part
--       of a fixed tuple.  This is the half that rescues the 8 tokens whose owner
--       the kernel silently discards.
--   C org_admin    -- the owning organization's owner/admins, when the row carries
--       organization_id and that org is not personal.  (Unchanged behaviour.)
--   D admin_grant  -- holders of an explicit admin-level iam.permissions grant,
--       user grantees and the admins of org grantees.  iam.can_decide_access_request
--       already lets these people DECIDE; without this lane they were never TOLD.
--       The recipient set and the decider set must not disagree.
--   E via_<parent> -- only when A-D found NOBODY: delegate to the registered
--       composition/containment parent and repeat, depth-capped at 6 hops.  This
--       is not a new rule; it is the access-tree precedent ("access always flows
--       downward") applied to the ask.  Whoever can say yes to a file can say yes
--       to its pages.
--
-- can_decide_access_request stays a SUPERSET of this set (it also admits anyone
-- holding admin through reachability or a container).  That asymmetry is in the
-- safe direction: more people may answer an ask than are notified of it, never
-- fewer.
--
-- Idempotent.  Safe to re-run.

begin;

-- ---------------------------------------------------------------------------
-- 1.  The recipient resolver.
-- ---------------------------------------------------------------------------
create or replace function iam.access_request_recipients(p_type text, p_id uuid)
returns table(user_id uuid, reason text)
language plpgsql
stable security definer
set search_path to 'public', 'platform', 'iam'
as $function$
declare
  v_cur_type    text := p_type;
  v_cur_id      uuid := p_id;
  v_meta        record;
  v_relid       oid;
  v_owner_col   text;
  v_org_col     text;
  v_owner       uuid;
  v_org         uuid;
  v_exists      boolean;
  v_is_container boolean;
  v_hops        int  := 0;
  v_via         text := '';
  v_ids         uuid[] := '{}';
  v_reasons     text[] := '{}';
  v_lane_ids    uuid[];
  v_parent_type text;
  v_fk          text;
  v_parent_id   uuid;
begin
  if p_type is null or p_id is null then
    return;
  end if;

  <<walk>>
  while v_hops <= 6 loop
    select et.schema_name, et.table_name into v_meta
    from platform.entity_types et
    where et.token = v_cur_type and coalesce(et.is_active, true)
    limit 1;
    exit walk when v_meta.schema_name is null;

    begin
      v_relid := format('%I.%I', v_meta.schema_name, v_meta.table_name)::regclass;
    exception when others then
      exit walk;
    end;

    -- The row must exist before anyone can be asked about it.
    begin
      execute format('select true from %I.%I where id = $1',
                     v_meta.schema_name, v_meta.table_name)
        into v_exists using v_cur_id;
    exception when others then
      v_exists := null;
    end;
    exit walk when not coalesce(v_exists, false);

    -- Resolve the shape from the catalog rather than guessing a fixed tuple.
    select case when bool_or(a.attname = 'created_by') then 'created_by'
                when bool_or(a.attname = 'owner_id')   then 'owner_id' end,
           case when bool_or(a.attname = 'organization_id') then 'organization_id' end
      into v_owner_col, v_org_col
    from pg_attribute a
    where a.attrelid = v_relid and a.attnum > 0 and not a.attisdropped;

    v_owner := null;
    v_org   := null;
    if v_owner_col is not null or v_org_col is not null then
      begin
        execute format('select %s, %s from %I.%I where id = $1',
                       coalesce(v_owner_col, 'null::uuid'),
                       coalesce(v_org_col,   'null::uuid'),
                       v_meta.schema_name, v_meta.table_name)
          into v_owner, v_org using v_cur_id;
      exception when others then
        v_owner := null; v_org := null;
      end;
    end if;

    -- Is this token a membership container?  This is the same question
    -- iam.has_access_for_base's membership lane asks (container_type = the token),
    -- so the ask lands on exactly the people the access lane already admits.
    v_is_container := exists (
      select 1 from iam.memberships m
      where m.container_type = v_cur_type and m.deleted_at is null
    );

    -- Lane A -- container admins (authoritative for a container; excludes B).
    if v_is_container then
      select array_agg(distinct m.user_id) into v_lane_ids
      from iam.memberships m
      join iam.membership_grant g
        on g.member_role = m.role and g.container_type in (v_cur_type, '*')
      where m.container_type = v_cur_type
        and m.container_id   = v_cur_id
        and m.deleted_at is null
        and coalesce(m.status, 'active') = 'active'
        and g.confers >= 'admin'::public.permission_level;
      if v_lane_ids is not null then
        v_ids     := v_ids     || v_lane_ids;
        v_reasons := v_reasons || array_fill(v_via || 'container_admin',
                                             array[cardinality(v_lane_ids)]);
      end if;
    -- Lane B -- the row's own owner.
    elsif v_owner is not null then
      v_ids     := v_ids     || array[v_owner];
      v_reasons := v_reasons || array[v_via || 'owner'];
    end if;

    -- Lane C -- the owning organization's admins.
    if v_org is not null then
      select array_agg(distinct om.user_id) into v_lane_ids
      from iam.organization_member om
      join iam.organizations o on o.id = om.organization_id
      where om.organization_id = v_org
        and om.role in ('owner', 'admin')
        and coalesce(o.is_personal, false) = false;
      if v_lane_ids is not null then
        v_ids     := v_ids     || v_lane_ids;
        v_reasons := v_reasons || array_fill(v_via || 'org_admin',
                                             array[cardinality(v_lane_ids)]);
      end if;
    end if;

    -- Lane D -- explicit admin-level grantees (they can already decide).
    select array_agg(distinct u) into v_lane_ids
    from (
      select p.granted_to_user_id as u
      from iam.permissions p
      where p.resource_type = v_cur_type and p.resource_id = v_cur_id
        and p.permission_level = 'admin'::public.permission_level
        and p.status <> 'rejected'
        and (p.expires_at is null or p.expires_at > now())
        and p.granted_to_user_id is not null
      union
      select om.user_id
      from iam.permissions p
      join iam.organization_member om on om.organization_id = p.granted_to_organization_id
      join iam.organizations o on o.id = om.organization_id
      where p.resource_type = v_cur_type and p.resource_id = v_cur_id
        and p.permission_level = 'admin'::public.permission_level
        and p.status <> 'rejected'
        and (p.expires_at is null or p.expires_at > now())
        and p.granted_to_organization_id is not null
        and om.role in ('owner', 'admin')
        and coalesce(o.is_personal, false) = false
    ) s;
    if v_lane_ids is not null then
      v_ids     := v_ids     || v_lane_ids;
      v_reasons := v_reasons || array_fill(v_via || 'admin_grant',
                                           array[cardinality(v_lane_ids)]);
    end if;

    -- Somebody can answer.  Stop here: an ask is answered by the nearest
    -- authority, never escalated past it.
    exit walk when cardinality(v_ids) > 0;

    -- Lane E -- nobody on this row.  Delegate to the composition parent.
    select er.parent_type, er.fk_column into v_parent_type, v_fk
    from platform.entity_relationships er
    where er.child_type = v_cur_type
      and er.kind in ('composition', 'containment')
    order by (er.kind = 'composition') desc, er.parent_type
    limit 1;
    exit walk when v_parent_type is null or v_fk is null;

    begin
      execute format('select %I from %I.%I where id = $1',
                     v_fk, v_meta.schema_name, v_meta.table_name)
        into v_parent_id using v_cur_id;
    exception when others then
      v_parent_id := null;
    end;
    exit walk when v_parent_id is null;
    exit walk when (v_parent_type, v_parent_id) is not distinct from (v_cur_type, v_cur_id);

    v_via      := 'via_' || v_parent_type || ':';
    v_cur_type := v_parent_type;
    v_cur_id   := v_parent_id;
    v_hops     := v_hops + 1;
  end loop;

  return query
  select t.uid, min(t.rsn)
  from unnest(v_ids, v_reasons) as t(uid, rsn)
  where t.uid is not null
  group by t.uid;
end;
$function$;

comment on function iam.access_request_recipients(text, uuid) is
  'Who can answer an access request for (token, id): container admins OR the row owner, '
  'plus owning-org admins and explicit admin grantees; delegating to the registered '
  'composition parent when the row itself has nobody. Never iam.organizations.created_by -- '
  'a container''s authority is its current membership, not its history. '
  'See common-docs /systems/platform/access/STATE.md section 3.9.';

-- ---------------------------------------------------------------------------
-- 2.  can_request must ask the recipient resolver, not the shape kernel.
--
--     The old test was `o_owner is not null or o_org is not null` -- "did the
--     column probe find somebody's uuid?", which is not the question a user is
--     asking.  The honest question is "will anyone actually receive this?", and
--     asking the resolver keeps the button and the delivery permanently in sync.
--
--     Patched by exact-substring replacement of the predicate so the other ~200
--     lines of this function are provably byte-identical afterwards.
-- ---------------------------------------------------------------------------
do $do$
declare
  v_def text;
  v_old text := '    and (v_attrs.o_owner is not null or v_attrs.o_org is not null)';
  v_new text := '    and exists (select 1 from iam.access_request_recipients(v_meta.token, p_id))';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'access_denied_context'
    and pg_get_function_identity_arguments(p.oid) = 'p_type text, p_id uuid';

  if v_def is null then
    raise exception 'public.access_denied_context(text,uuid) not found';
  end if;

  if position(v_new in v_def) > 0 then
    raise notice 'access_denied_context: can_request already asks the resolver - skipping';
    return;
  end if;

  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception
      'access_denied_context: expected exactly one can_request predicate to patch, found %',
      (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  end if;

  execute replace(v_def, v_old, v_new);
end;
$do$;

-- ---------------------------------------------------------------------------
-- 3.  An ask nobody receives must be refused, not stored.
--
--     Writing a `pending` row with recipients: [] is the exact failure this
--     node exists to kill: it tells the user their ask is on its way to
--     somebody when it is on its way to nobody.  With (2) in place the UI never
--     offers the button in that state, so this is the guard behind the door.
-- ---------------------------------------------------------------------------
do $do$
declare
  v_def text;
  v_anchor text := '  left join users.profiles pr on pr.id = r.user_id;';
  v_guard  text := '  left join users.profiles pr on pr.id = r.user_id;

  if v_recipients = ''[]''::jsonb then
    raise exception ''There is nobody who can grant access to this %.'',
      lower(coalesce(v_meta.label, ''item'')) using errcode = ''42501'';
  end if;';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'access_request_create'
    and pg_get_function_identity_arguments(p.oid)
        = 'p_resource_type text, p_resource_id uuid, p_level text, p_message text';

  if v_def is null then
    raise exception 'public.access_request_create(text,uuid,text,text) not found';
  end if;

  if position('There is nobody who can grant access' in v_def) > 0 then
    raise notice 'access_request_create: zero-recipient guard already present - skipping';
    return;
  end if;

  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception
      'access_request_create: expected exactly one recipient-join anchor, found %',
      (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  end if;

  execute replace(v_def, v_anchor, v_guard);
end;
$do$;

-- ---------------------------------------------------------------------------
-- 4.  The corpus proof, as a standing report rather than a one-off audit.
--
--     "Deliberately non-requestable" has to be an OBSERVABLE class, not a
--     comment in a migration nobody re-reads.  This walks every active
--     registered token, samples real rows, and says which class it is in.  A
--     token that quietly stops resolving recipients shows up on the next run.
--
--     platform schema on purpose: it has no default function ACL, so this is not
--     handed to anon/authenticated at creation and needs no client_callable_door
--     row.  It is machinery for agents and admins on the privileged pool.
-- ---------------------------------------------------------------------------
create or replace function platform.access_request_recipient_report(p_sample int default 3)
returns table(
  token            text,
  entity           text,
  owner_col        text,
  org_col          text,
  is_container     boolean,
  parent_type      text,
  rows_sampled     int,
  rows_with_recipients int,
  class            text
)
language plpgsql
stable security definer
set search_path to 'public', 'platform', 'iam'
as $function$
declare
  r        record;
  v_relid  oid;
  v_ids    uuid[];
  v_id     uuid;
  v_n      int;
  v_hits   int;
begin
  for r in
    select et.token, et.schema_name, et.table_name
    from platform.entity_types et
    where coalesce(et.is_active, true)
    order by et.token
  loop
    token  := r.token;
    entity := r.schema_name || '.' || r.table_name;
    owner_col := null; org_col := null; parent_type := null;
    rows_sampled := 0; rows_with_recipients := 0;

    begin
      v_relid := format('%I.%I', r.schema_name, r.table_name)::regclass;
    exception when others then
      class := 'unresolvable_table';
      return next;
      continue;
    end;

    select case when bool_or(a.attname = 'created_by') then 'created_by'
                when bool_or(a.attname = 'owner_id')   then 'owner_id' end,
           case when bool_or(a.attname = 'organization_id') then 'organization_id' end
      into owner_col, org_col
    from pg_attribute a
    where a.attrelid = v_relid and a.attnum > 0 and not a.attisdropped;

    is_container := exists (
      select 1 from iam.memberships m
      where m.container_type = r.token and m.deleted_at is null
    );

    select er.parent_type into parent_type
    from platform.entity_relationships er
    where er.child_type = r.token and er.kind in ('composition', 'containment')
    order by (er.kind = 'composition') desc, er.parent_type
    limit 1;

    begin
      execute format('select array_agg(id) from (select id from %I.%I limit %s) s',
                     r.schema_name, r.table_name, greatest(p_sample, 1))
        into v_ids;
    exception when others then
      class := 'unreadable';
      return next;
      continue;
    end;

    v_n := coalesce(cardinality(v_ids), 0);
    rows_sampled := v_n;
    if v_n = 0 then
      class := 'empty_table';
      return next;
      continue;
    end if;

    v_hits := 0;
    foreach v_id in array v_ids loop
      if exists (select 1 from iam.access_request_recipients(r.token, v_id)) then
        v_hits := v_hits + 1;
      end if;
    end loop;
    rows_with_recipients := v_hits;

    class := case
      when v_hits = v_n then 'resolves'
      when v_hits > 0   then 'partial'
      else 'non_requestable'
    end;
    return next;
  end loop;
end;
$function$;

comment on function platform.access_request_recipient_report(int) is
  'Corpus proof for the access gate: every active registered token, sampled against '
  'iam.access_request_recipients, classified resolves / partial / non_requestable / '
  'empty_table / unreadable. "Nobody to ask" must be a class you can SEE, never an accident.';

commit;
