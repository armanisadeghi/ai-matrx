-- chair-step: lane SHARE-PEOPLE-ONLY. Adds iam.permissions.granted_via and the archived status; ADDS the one guard (trigger _iam_a_share_names_a_person) refusing an organization grantee unless written through the availability door; ADDS public.grant_org_availability and the private arm; REPLACES custom.share_grant, public.share_resource_with_org (both refuse an organization), hr._reconcile_grants and public.review_org_share (both arm the door); CONVERTS every organization share into per-person grants for current members and archives the organization row (soft), and stamps HR-directory and surface-binding rows availability.
-- lane: SHARE-PEOPLE-ONLY
-- lock: iam.permissions (ADD COLUMN, constraint swap, one BEFORE trigger; 5.4k rows)
-- based-on: custom.share_grant(uuid, uuid, text, uuid, permission_level) 4d07441918dfed02ebf2b8c8b3b51462e473916e8404fe4e4a7061a7c43065ff
-- based-on: public.share_resource_with_org(text, uuid, uuid, text) 4719902dd0a6b52e6e48eff94cc991226328e0da9fbee87d10b939e6f4e2535b
-- based-on: hr._reconcile_grants(text, uuid, date) 007e0ea55dd299a788929396eb9db0930c67df20548a20c27c905ccfd44ef120
-- based-on: public.review_org_share(uuid, text, text) 778b0f439ac4f5a8651b1f860a2898d714b0bc8b6a58e90113e97f4a7669b90d
--
-- OWNER RULING (Arman, 2026-09-23, binding): access is personal. Permission is granted to a
-- PERSON, never to an organization. CHAIR RULING (2026-09-25): "access is personal" governs the
-- act of SHARING; organization configuration an org admin sets (surface binding, library
-- contribution with moderation, HR's employee directory) keeps organization-level availability
-- through its OWN door, so future members inherit it.
--
-- WHAT THIS FILE DOES
--   1. iam.permissions.granted_via ('share' | 'availability') names where a row came from, and
--      status may be 'archived' (a soft-archived grant that confers nothing).
--   2. iam._org_availability_arm() is the only way to write an organization grantee: a
--      statement-scoped, unforgeable token (the HR arm pattern). The one guard,
--      iam._a_share_names_a_person(), refuses every organization-grantee INSERT/UPDATE that is not
--      armed, with "Shares name a person, not an organization." Archiving an organization row is
--      always allowed.
--   3. public.grant_org_availability(...) is the availability door (the old non-record path of
--      share_resource_with_org, armed and stamped). hr._reconcile_grants and public.review_org_share
--      arm it.
--   4. Every SHARE door refuses an organization: public.share_resource_with_org (the dialogs),
--      custom.share_grant kind organization (the record store; store_door_share and
--      update_permission_level reach it), and iam.fn_grant_resource_permission grantee_type
--      organization (refused by the guard).
--   5. CONVERSION. Existing organization grants are classified by origin:
--        * hr_employee rows written by hr._reconcile_grants (hr.derived_grant) -> availability;
--        * agent / agent_card rows whose agent is bound to that organization's surface
--          (platform.associations role binding:o:<org>) -> availability;
--        * every other row was made through a share dialog -> each CURRENT member of the
--          organization gets a person grant at the same level (an existing lower grant is raised,
--          a higher one kept), and the old row is archived (status archived, expires_at now,
--          review_note says why). Nothing is deleted. iam._share_people_conversion records every
--          row so the inverse can put it back exactly.
--
-- INVERSE: migrations/inverse/sharepeople_a_share_names_a_person_down.sql

set local lock_timeout = '30s';

-- 1. origin + archived ---------------------------------------------------------------------
alter table iam.permissions add column if not exists granted_via text;
alter table iam.permissions drop constraint if exists permissions_granted_via_check;
alter table iam.permissions add constraint permissions_granted_via_check
  check (granted_via is null or granted_via in ('share', 'availability'));
alter table iam.permissions drop constraint permissions_status_check;
alter table iam.permissions add constraint permissions_status_check
  check (status = any (array['active'::text, 'pending'::text, 'rejected'::text, 'archived'::text]));
comment on column iam.permissions.granted_via is
  'SHARE-PEOPLE-ONLY: where the row came from. availability = organization configuration written through iam._org_availability_arm (surface binding, library contribution, HR directory); share = a person named on a thing. An organization grantee is never a share.';

-- 2. the arm and the one guard -------------------------------------------------------------
create table if not exists iam._org_availability_key (key text not null);
revoke all on iam._org_availability_key from public, anon, authenticated;
insert into iam._org_availability_key (key)
select md5(gen_random_uuid()::text || clock_timestamp()::text)
 where not exists (select 1 from iam._org_availability_key);

create or replace function iam._org_availability_token()
 returns text language sql stable security definer set search_path to 'pg_catalog' as $f$
  select md5(statement_timestamp()::text || pg_backend_pid()::text ||
             (select k.key from iam._org_availability_key k limit 1))
$f$;

create or replace function iam._org_availability_arm()
 returns void language plpgsql security definer set search_path to 'pg_catalog' as $f$
begin
  -- The only way to write an ORGANIZATION grantee (chair ruling 2026-09-25). Statement-scoped:
  -- it covers the one client statement that called an availability door and nothing after it.
  perform set_config('iam.org_availability', iam._org_availability_token(), true);
end $f$;

revoke all on function iam._org_availability_token() from public, anon, authenticated;
revoke all on function iam._org_availability_arm() from public, anon, authenticated;
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, non_client_lane, signed_in_callers, anonymous_callers)
select 'iam', '_org_availability_token', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       'migrations/campaign/sharepeople_a_share_names_a_person.sql (lane SHARE-PEOPLE-ONLY)',
       'Takes no arguments; answers a statement-scoped md5 over a private key. No entity id.',
       'server_only: read only by iam._org_availability_arm and the guard trigger iam._a_share_names_a_person, both SECURITY DEFINER; EXECUTE is revoked from every client role.',
       false, false
  from pg_proc p where p.oid = 'iam._org_availability_token()'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do nothing;
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, non_client_lane, signed_in_callers, anonymous_callers)
select 'iam', '_org_availability_arm', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       'migrations/campaign/sharepeople_a_share_names_a_person.sql (lane SHARE-PEOPLE-ONLY)',
       'Takes no arguments and writes one transaction-local setting. No entity id.',
       'server_only: called only by the availability door public.grant_org_availability, hr._reconcile_grants and public.review_org_share; EXECUTE is revoked from every client role.',
       false, false
  from pg_proc p where p.oid = 'iam._org_availability_arm()'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do nothing;

create or replace function iam._a_share_names_a_person()
 returns trigger language plpgsql security definer set search_path to 'pg_catalog' as $f$
begin
  if new.granted_to_organization_id is null then
    return new;
  end if;
  -- Archiving an organization row is always allowed: it takes access away, never gives it.
  if tg_op = 'UPDATE' and new.status = 'archived'
     and old.granted_to_organization_id is not distinct from new.granted_to_organization_id then
    return new;
  end if;
  if coalesce(current_setting('iam.org_availability', true), '') = iam._org_availability_token() then
    new.granted_via := 'availability';
    return new;
  end if;
  raise exception 'Shares name a person, not an organization.'
    using errcode = '42501',
          hint = 'SHARE-PEOPLE-ONLY (access is personal): name the people - the Share dialog''s "Add everyone in <organization>" grants each current member by name. Organization availability (binding an agent to an organization''s surface, contributing to its library, the HR directory) goes through public.grant_org_availability.';
end $f$;

drop trigger if exists _iam_a_share_names_a_person on iam.permissions;
create trigger _iam_a_share_names_a_person
  before insert or update on iam.permissions
  for each row execute function iam._a_share_names_a_person();

-- 3. the availability door and its callers -------------------------------------------------
CREATE OR REPLACE FUNCTION public.grant_org_availability(p_resource_type text, p_resource_id uuid, p_target_org_id uuid, p_permission_level text DEFAULT 'viewer'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid(); v_resolved record; v_owner_col text; v_owner_id uuid; v_new_id uuid;
  v_members_can_add boolean; v_requires_approval boolean; v_default_perm permission_level;
  v_is_admin boolean; v_status text := 'active'; v_level text;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated'); END IF;
  BEGIN SELECT * INTO STRICT v_resolved FROM public.resolve_shareable_resource(p_resource_type);
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', SQLERRM); END;
  v_owner_col := public.shareable_owner_column(v_resolved.schema_name, v_resolved.table_name, v_resolved.owner_column);
  EXECUTE format('SELECT %I FROM %I.%I WHERE %I = $1', v_owner_col, v_resolved.schema_name, v_resolved.table_name, v_resolved.id_column)
    INTO v_owner_id USING p_resource_id;
  IF NOT public.shareable_resource_exists(v_resolved.resource_type, p_resource_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Resource not found');
  END IF;
  IF NOT public.may_manage_sharing(v_resolved.resource_type, p_resource_id) THEN
    RETURN jsonb_build_object('success', false, 'error',
      'You need Admin on this to decide who else may see it. Ask whoever holds it, or an owner of the organization.');
  END IF;
  IF v_resolved.schema_name = 'custom' THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Shares name a person, not an organization. A table in the record store is shared with people by name.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM iam.organization_member WHERE organization_id=p_target_org_id AND user_id=v_uid) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Organization not found or you are not a member'); END IF;
  SELECT members_can_add, needs_approval, default_permission
    INTO v_members_can_add, v_requires_approval, v_default_perm
    FROM platform.org_module_config
   WHERE organization_id = p_target_org_id AND module_token = v_resolved.resource_type;
  v_members_can_add   := COALESCE(v_members_can_add, true);
  v_requires_approval := COALESCE(v_requires_approval, false);
  v_level := COALESCE(p_permission_level, v_default_perm::text, 'viewer');
  IF v_level NOT IN ('viewer', 'commenter', 'editor', 'admin') THEN RETURN jsonb_build_object('success', false, 'error', 'Invalid permission level'); END IF;
  SELECT EXISTS (SELECT 1 FROM iam.organization_member WHERE organization_id=p_target_org_id AND user_id=v_uid AND role IN ('owner','admin')) INTO v_is_admin;
  IF NOT v_members_can_add AND NOT v_is_admin THEN RETURN jsonb_build_object('success', false, 'error', 'Members cannot add this kind to the organization'); END IF;
  IF v_requires_approval AND NOT v_is_admin THEN v_status := 'pending'; END IF;
  IF EXISTS (SELECT 1 FROM iam.permissions WHERE resource_type=v_resolved.resource_type AND resource_id=p_resource_id AND granted_to_organization_id=p_target_org_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Organization already has access'); END IF;
  PERFORM iam._org_availability_arm();
  INSERT INTO iam.permissions (resource_type, resource_id, granted_to_organization_id, permission_level, created_by, status, granted_via)
  VALUES (v_resolved.resource_type, p_resource_id, p_target_org_id, v_level::permission_level, v_uid, v_status, 'availability')
  RETURNING id INTO v_new_id;
  RETURN jsonb_build_object('success', true,
    'message', CASE WHEN v_status='pending' THEN 'Shared — pending admin approval' ELSE 'Available to everyone in the organization' END,
    'permission_id', v_new_id, 'status', v_status, 'permission_level', v_level, 'resource_type', v_resolved.resource_type);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END; $function$;

revoke all on function public.grant_org_availability(text, uuid, uuid, text) from public, anon;
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, signed_in_callers)
select 'public', 'grant_org_availability', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       'migrations/campaign/sharepeople_a_share_names_a_person.sql (lane SHARE-PEOPLE-ONLY)',
       'p_resource_type is resolved through public.resolve_shareable_resource; p_resource_id must exist (shareable_resource_exists) and the caller must hold Admin on it (may_manage_sharing); p_target_org_id must be an organization the caller is a member of (iam.organization_member), and platform.org_module_config decides members_can_add and approval. NULL arguments are refused by those checks. It writes only an organization-availability row stamped granted_via = availability.',
       true
  from pg_proc p where p.oid = 'public.grant_org_availability(text, uuid, uuid, text)'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do nothing;
-- Declared first, then granted: the DDL guard takes back a client grant on an undeclared definer.
grant execute on function public.grant_org_availability(text, uuid, uuid, text) to authenticated;

CREATE OR REPLACE FUNCTION hr._reconcile_grants(p_scope_kind text, p_scope_id uuid, p_at date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare
  v_ins int := 0; v_upd int := 0; v_del int := 0; v_same int := 0;
  d record; v_perm uuid; v_changed boolean;
begin
  perform hr.arm_write();
  -- SHARE-PEOPLE-ONLY: the employee directory is ORGANIZATION AVAILABILITY (chair ruling
  -- 2026-09-25), written through the availability door, never a share.
  perform iam._org_availability_arm();

  create temp table _hr_desired (
    resource_type text, resource_id uuid, grantee_user_id uuid, grantee_organization_id uuid,
    permission_level text, expires_at timestamptz, reason text, basis_kind text, basis_id uuid,
    subject_employment_id uuid) on commit drop;

  if p_scope_kind = 'employment' then
    insert into _hr_desired select * from hr._desired_grants_for_employment(p_scope_id, p_at);
  elsif p_scope_kind = 'requisition' then
    insert into _hr_desired select * from hr._desired_grants_for_requisition(p_scope_id, p_at);
  else
    raise exception 'hr._reconcile_grants: unknown scope kind %', p_scope_kind using errcode = '22023';
  end if;

  -- ---------- upsert every desired row
  for d in select * from _hr_desired loop
    if d.grantee_user_id is not null then
      select p.id,
             (p.permission_level::text is distinct from d.permission_level
              or p.expires_at is distinct from d.expires_at
              or coalesce(p.status,'active') = 'rejected')
        into v_perm, v_changed
        from iam.permissions p
       where p.resource_type = d.resource_type and p.resource_id = d.resource_id
         and p.granted_to_user_id = d.grantee_user_id;

      if v_perm is null then
        insert into iam.permissions (resource_type, resource_id, granted_to_user_id,
                                     permission_level, status, expires_at)
        values (d.resource_type, d.resource_id, d.grantee_user_id,
                d.permission_level::public.permission_level, 'active', d.expires_at)
        returning id into v_perm;
        v_ins := v_ins + 1;
      elsif v_changed then
        update iam.permissions
           set permission_level = d.permission_level::public.permission_level,
               expires_at = d.expires_at, status = 'active'
         where id = v_perm;
        v_upd := v_upd + 1;
      else
        v_same := v_same + 1;
      end if;
    else
      select p.id,
             (p.permission_level::text is distinct from d.permission_level
              or p.expires_at is distinct from d.expires_at)
        into v_perm, v_changed
        from iam.permissions p
       where p.resource_type = d.resource_type and p.resource_id = d.resource_id
         and p.granted_to_organization_id = d.grantee_organization_id;

      if v_perm is null then
        insert into iam.permissions (resource_type, resource_id, granted_to_organization_id,
                                     permission_level, status, expires_at, granted_via)
        values (d.resource_type, d.resource_id, d.grantee_organization_id,
                d.permission_level::public.permission_level, 'active', d.expires_at, 'availability')
        returning id into v_perm;
        v_ins := v_ins + 1;
      elsif v_changed then
        update iam.permissions
           set permission_level = d.permission_level::public.permission_level, expires_at = d.expires_at
         where id = v_perm;
        v_upd := v_upd + 1;
      else
        v_same := v_same + 1;
      end if;
    end if;

    -- the mapping row: this is what makes reconciliation SAFE — HR only ever deletes grants IT
    -- created, so a hand-made grant from the sharing UI is never clobbered.
    insert into hr.derived_grant
      (organization_id, permission_id, subject_employment_id, grantee_user_id,
       grantee_organization_id, resource_type, resource_id, permission_level, expires_at,
       reason, basis_kind, basis_id, derived_at)
    select coalesce(
             (select em.organization_id from hr.employment em where em.id = d.subject_employment_id),
             d.grantee_organization_id),
           v_perm, d.subject_employment_id, d.grantee_user_id, d.grantee_organization_id,
           d.resource_type, d.resource_id, d.permission_level, d.expires_at,
           d.reason, d.basis_kind, d.basis_id, now()
    on conflict (permission_id) do update
       set subject_employment_id = excluded.subject_employment_id,
           expires_at = excluded.expires_at, reason = excluded.reason,
           basis_kind = excluded.basis_kind, basis_id = excluded.basis_id,
           derived_at = now()
     where hr.derived_grant.reason is distinct from excluded.reason
        or hr.derived_grant.expires_at is distinct from excluded.expires_at
        or hr.derived_grant.basis_id is distinct from excluded.basis_id;
  end loop;

  -- ---------- retire every mapping that is no longer desired
  -- 🚨 THE PARENTHESES ARE LOAD-BEARING AND A PROBE CAUGHT THEM MISSING. `and` binds tighter than
  -- `or`, so without the outer brackets the first disjunct carried NO `not exists` guard and the
  -- reconcile DELETED every row it had just written — the first live run reported
  -- `inserted=2, deleted=2` and left nothing behind. A reconciler that silently undoes itself
  -- passes any test that only asserts "the wrong person cannot read", which is exactly why the
  -- idempotency assertion (§9 T-31) is written as "the second run performs ZERO writes".
  for d in
    select dg.id, dg.permission_id
      from hr.derived_grant dg
     where ( (p_scope_kind = 'employment' and dg.subject_employment_id = p_scope_id
              and dg.reason <> 'break_glass')
             or (p_scope_kind = 'requisition' and dg.basis_kind = 'requisition'
                 and dg.basis_id = p_scope_id) )
       and not exists (
         select 1 from _hr_desired x
          where x.resource_type = dg.resource_type and x.resource_id = dg.resource_id
            and x.grantee_user_id is not distinct from dg.grantee_user_id
            and x.grantee_organization_id is not distinct from dg.grantee_organization_id)
  loop
    -- deleting the permission cascades the mapping (FK ON DELETE CASCADE)
    delete from iam.permissions where id = d.permission_id;
    v_del := v_del + 1;
  end loop;

  drop table if exists _hr_desired;

  return jsonb_build_object('scope', p_scope_kind, 'id', p_scope_id, 'as_of', p_at,
                            'inserted', v_ins, 'updated', v_upd, 'deleted', v_del,
                            'unchanged', v_same);
end
$function$;

-- hr._reconcile_grants had no access decision on record; the provision-shape guard asks for one
-- when its body is replaced. Kept by the inverse (the inverse replaces the body too).
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, non_client_lane, signed_in_callers, anonymous_callers)
select 'hr', '_reconcile_grants', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       'migrations/campaign/sharepeople_a_share_names_a_person.sql (lane SHARE-PEOPLE-ONLY)',
       'p_scope_kind is employment or requisition (anything else raises 22023); p_scope_id is only looked up by hr._desired_grants_for_employment / _for_requisition; p_at defaults to today. It writes and deletes only grants it derived itself (hr.derived_grant).',
       'server_only: called by the HR lifecycle functions and triggers (hr.arm_write lane) as the definer; no client calls it and EXECUTE is not granted to any client role.',
       false, false
  from pg_proc p where p.oid = 'hr._reconcile_grants(text, uuid, date)'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do nothing;
CREATE OR REPLACE FUNCTION public.review_org_share(p_permission_id uuid, p_status text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated'); END IF;
  IF p_status NOT IN ('active','pending','rejected') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid status');
  END IF;
  SELECT granted_to_organization_id INTO v_org FROM iam.permissions WHERE id = p_permission_id;
  IF v_org IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not an organization share'); END IF;
  IF NOT EXISTS (
    SELECT 1 FROM iam.organization_member
    WHERE organization_id = v_org AND user_id = v_uid AND role IN ('owner','admin')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only org owners or admins can review shares');
  END IF;
  -- SHARE-PEOPLE-ONLY: approving or rejecting a contribution is organization availability.
  PERFORM iam._org_availability_arm();
  UPDATE iam.permissions
     SET status = p_status, reviewed_by = v_uid, reviewed_at = now(), review_note = p_note
   WHERE id = p_permission_id;
  RETURN jsonb_build_object('success', true, 'message', 'Share ' || p_status, 'status', p_status);
END;
$function$;

-- 4. the share doors refuse an organization ------------------------------------------------
CREATE OR REPLACE FUNCTION public.share_resource_with_org(p_resource_type text, p_resource_id uuid, p_target_org_id uuid, p_permission_level text DEFAULT 'viewer'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- SHARE-PEOPLE-ONLY (owner ruling, Arman 2026-09-23: access is personal). This door shared a
  -- thing with an ORGANIZATION. It now refuses by name. A share names people
  -- (share_resource_with_user); making something available to an organization as organization
  -- configuration (surface binding, library contribution) is public.grant_org_availability.
  RETURN jsonb_build_object('success', false, 'error', 'Shares name a person, not an organization.',
    'hint', 'Share with the people by name. "Add everyone in <organization>" names each current member; people who join later are not included.');
END; $function$;

CREATE OR REPLACE FUNCTION custom.share_grant(p_organization_id uuid, p_subject_id uuid, p_principal_kind text, p_principal_id uuid, p_level permission_level DEFAULT 'viewer'::permission_level)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_kind   text := lower(btrim(coalesce(p_principal_kind, '')));
  v_row    custom.record;
  v_word   text;
  v_perm   uuid;
  v_before public.permission_level;
begin
  perform custom.assert_store_door(p_organization_id, 'share_grant');
  -- THE ONE LADDER at the rung whose whole definition is "can change it and decide who else
  -- may". Not `created_by`: VIS-17 has one ladder and `admin` is on it.
  perform custom.assert_client_may_change(p_organization_id, p_subject_id, 'share_grant',
                                          'admin'::public.permission_level, 'record');

  select r.* into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_subject_id;
  if not found then
    raise exception 'There is no such record in this organization, so it cannot be shared.'
      using errcode = '02000';
  end if;
  v_word := case when v_row.table_id = custom.table_kernel_id() then 'table' else 'record' end;

  if p_level is null then
    raise exception 'A share has to say what the other person may do with it.'
      using errcode = '22004',
            hint = 'Pass one of viewer, commenter, editor, admin — call custom.share_levels() for what each one means.';
  end if;
  -- SHARE-PEOPLE-ONLY (owner ruling, Arman 2026-09-23: access is personal). A share names a
  -- PERSON. An organization is never a grantee here; "Add everyone in <organization>" in the
  -- dialog names each current member instead.
  if v_kind = 'organization' then
    raise exception 'Shares name a person, not an organization.'
      using errcode = '22023',
            hint = 'Name the people. The Share dialog''s "Add everyone in <organization>" lists the organization''s current members and grants each of them by name; people who join later are not included.';
  end if;
  if v_kind not in ('person', 'user') then
    raise exception 'A share names a person, and "%" is not one.', coalesce(p_principal_kind, '<nothing>')
      using errcode = '22023',
            hint = 'Use kind `person` with the person''s id.';
  end if;
  if p_principal_id is null then
    raise exception 'A share has to say WHO it is shared with.' using errcode = '22004';
  end if;

  -- Only a person reaches here (the organization kind was refused above).
  -- VIS-31: a person outside the organization is an EXTERNAL principal, and that lane is off
  -- UNLESS this organization has opened it by declaring a portal and naming this person in
  -- it (PORTAL, 2026-09-20). A portal principal is the one non-member this door will write a
  -- grant for, and it writes exactly the grant the portal's own binding asks for — on the
  -- client's own record, which is the thing every Job and Invoice of theirs hangs off.
  -- Everybody else still gets the refusal below, by name, rather than a grant that confers
  -- nothing.
  if not exists (select 1 from iam.organization_member m
                  where m.organization_id = p_organization_id and m.user_id = p_principal_id)
     and not (coalesce((platform.knob_resolve('custom', 'external_principal_enabled', p_organization_id) #>> '{}')::boolean, false)
              and custom.portal_admits(p_organization_id, p_principal_id)) then
    raise exception 'That person is not in this organization, so they cannot be given access to this % yet.', v_word
      using errcode = '42501',
            hint = 'VIS-31 / custom/external_principal_enabled resolves false for this organization: sharing with somebody who has no membership here is the external-principal lane, and it is not open. Invite them to the organization, or - if they are a client rather than a colleague - put them in a portal, which is the act that opens this lane for one organization and names who may come through it.';
  end if;

  -- WHAT WAS HELD BEFORE, read before the write, because the sentence at the bottom says
  -- "Changed from X to Y" and the write is about to make that unreadable.
  select p.permission_level into v_before
    from iam.permissions p
   where p.resource_type = 'record' and p.resource_id = p_subject_id
     and p.granted_to_user_id = p_principal_id;

  -- PORTAL-BIND: THE ONE WRITER. The authority for this call was decided four lines into
  -- this body (`assert_client_may_change` at admin on the subject) and the ownership rung
  -- and the level shape are judged inside the writer, where the other two callers get the
  -- same answers. This door hand-wrote the row until 2026-09-21 and so did
  -- `custom.table_share_outside_accept`, which is two implementations of one write.
  v_perm := custom._share_write_person(p_organization_id, p_subject_id, p_principal_id,
                                       p_level, custom.query_principal());

  -- The history row is already written: `zzz_history_grant_capture` fired inside this same
  -- statement. Nothing here files a second one.
  return jsonb_build_object(
    'shared', true,
    'subject', v_word,
    'permission_id', v_perm,
    'principal_kind', case when v_kind = 'user' then 'person' else v_kind end,
    'principal_id', p_principal_id,
    'level', p_level::text,
    'level_label', iam.level_label(v_word, p_level),
    'was', v_before::text,
    'message', case when v_before is null
                    then format('Shared at %s.', lower(iam.level_label(v_word, p_level)))
                    else format('Changed from %s to %s.', lower(iam.level_label(v_word, v_before)),
                                lower(iam.level_label(v_word, p_level))) end);
end;
$function$;

-- 5. conversion ----------------------------------------------------------------------------
create table if not exists iam._share_people_conversion (
  org_permission_id    uuid not null,
  organization_id      uuid not null,
  person_permission_id uuid,
  person_id            uuid,
  created_row          boolean not null,
  level_before         public.permission_level,
  status_before        text,
  classified           text not null,
  converted_at         timestamptz not null default now()
);
revoke all on iam._share_people_conversion from public, anon, authenticated;

-- 5a. availability origins are stamped (armed: an origin stamp is an update of an org row)
do $stamp$
begin
perform iam._org_availability_arm();   -- one statement: the arm covers the stamp below
with avail as (
  select p.id, case when dg.permission_id is not null then 'availability:hr_directory'
                    else 'availability:surface_binding' end as why
    from iam.permissions p
    left join hr.derived_grant dg on dg.permission_id = p.id
   where p.granted_to_organization_id is not null
     and p.status <> 'archived'
     and (dg.permission_id is not null
          or (p.resource_type in ('agent', 'agent_card') and exists (
                select 1 from platform.associations a
                 where a.source_type = 'agent' and a.target_type = 'surface'
                   and a.source_id = p.resource_id
                   and a.role = 'binding:o:' || p.granted_to_organization_id::text)))
), stamped as (
  update iam.permissions p set granted_via = 'availability'
    from avail where p.id = avail.id
  returning p.id, p.granted_to_organization_id, avail.why
)
insert into iam._share_people_conversion (org_permission_id, organization_id, created_row, classified)
select id, granted_to_organization_id, false, why from stamped;
end $stamp$;

-- 5b. every other organization row was a share: one person grant per current member
do $conv$
declare
  g record; m record; v_existing record; v_new uuid; v_n int;
begin
  for g in select p.* from iam.permissions p
            where p.granted_to_organization_id is not null
              and p.status <> 'archived'
              and p.granted_via is distinct from 'availability'
            order by p.created_at
  loop
    v_n := 0;
    for m in select om.user_id from iam.organization_member om
              where om.organization_id = g.granted_to_organization_id
    loop
      select p.id, p.permission_level, p.status into v_existing
        from iam.permissions p
       where p.resource_type = g.resource_type and p.resource_id = g.resource_id
         and p.granted_to_user_id = m.user_id;
      if v_existing.id is null then
        insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level,
                                     created_by, status, expires_at, granted_via, review_note)
        values (g.resource_type, g.resource_id, m.user_id, g.permission_level, g.created_by,
                g.status, g.expires_at, 'share',
                'SHARE-PEOPLE-ONLY 2026-09-25: named from the organization share ' || g.id)
        returning id into v_new;
        insert into iam._share_people_conversion values
          (g.id, g.granted_to_organization_id, v_new, m.user_id, true, null, null, 'share:converted', now());
      elsif v_existing.permission_level < g.permission_level or v_existing.status <> 'active' then
        insert into iam._share_people_conversion values
          (g.id, g.granted_to_organization_id, v_existing.id, m.user_id, false,
           v_existing.permission_level, v_existing.status, 'share:raised', now());
        update iam.permissions
           set permission_level = greatest(v_existing.permission_level, g.permission_level),
               status = case when g.status = 'active' then 'active' else status end
         where id = v_existing.id;
      else
        insert into iam._share_people_conversion values
          (g.id, g.granted_to_organization_id, v_existing.id, m.user_id, false,
           v_existing.permission_level, v_existing.status, 'share:already_held', now());
      end if;
      v_n := v_n + 1;
    end loop;
    insert into iam._share_people_conversion values
      (g.id, g.granted_to_organization_id, null, null, false, g.permission_level, g.status, 'share:archived', now());
    update iam.permissions
       set status = 'archived',
           expires_at = coalesce(least(expires_at, now()), now()),
           reviewed_at = now(),
           review_note = format('SHARE-PEOPLE-ONLY 2026-09-25: archived. Shares name a person, not an organization; its %s current member(s) were each granted %s by name. People who join later are not included.', v_n, g.permission_level)
     where id = g.id;
  end loop;
end $conv$;
