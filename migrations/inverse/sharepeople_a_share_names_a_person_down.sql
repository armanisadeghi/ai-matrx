-- INVERSE of migrations/campaign/sharepeople_a_share_names_a_person.sql (lane SHARE-PEOPLE-ONLY).
-- Puts every converted row back exactly (from iam._share_people_conversion), restores the four
-- bodies byte-for-byte, drops the guard, the door, the arm and the column.
set local lock_timeout = '2s';

drop trigger if exists _iam_a_share_names_a_person on iam.permissions;

-- converted shares: person rows this file created are removed; raised rows get their level back;
-- the organization row is un-archived.
delete from iam.permissions p using iam._share_people_conversion c
 where c.classified = 'share:converted' and p.id = c.person_permission_id;
update iam.permissions p
   set permission_level = c.level_before, status = c.status_before
  from iam._share_people_conversion c
 where c.classified = 'share:raised' and p.id = c.person_permission_id;
update iam.permissions p
   set status = c.status_before,
       expires_at = null,
       reviewed_at = null,
       review_note = null
  from iam._share_people_conversion c
 where c.classified = 'share:archived' and p.id = c.org_permission_id;
-- (expires_at: every converted organization row had none - checked at conversion; see the lane doc)

drop table iam._share_people_conversion;

CREATE OR REPLACE FUNCTION public.share_resource_with_org(p_resource_type text, p_resource_id uuid, p_target_org_id uuid, p_permission_level text DEFAULT 'viewer'::text)
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
    RETURN public.store_door_share(v_resolved.resource_type, p_resource_id, 'organization', p_target_org_id, p_permission_level);
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
  INSERT INTO iam.permissions (resource_type, resource_id, granted_to_organization_id, permission_level, created_by, status)
  VALUES (v_resolved.resource_type, p_resource_id, p_target_org_id, v_level::permission_level, v_uid, v_status)
  RETURNING id INTO v_new_id;
  RETURN jsonb_build_object('success', true,
    'message', CASE WHEN v_status='pending' THEN 'Shared — pending admin approval' ELSE 'Shared with organization' END,
    'permission_id', v_new_id, 'status', v_status, 'permission_level', v_level, 'resource_type', v_resolved.resource_type);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', SQLERRM);
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
  if v_kind not in ('person', 'user', 'organization') then
    raise exception 'A share names a person or an organization, and "%" is neither.', coalesce(p_principal_kind, '<nothing>')
      using errcode = '22023',
            hint = 'VIS-23: cross-organization sharing is a grant whose principal is the other organization — the same one grant table, never a separate system. Use kind `person` or `organization`.';
  end if;
  if p_principal_id is null then
    raise exception 'A share has to say WHO it is shared with.' using errcode = '22004';
  end if;

  if v_kind in ('person', 'user') then
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
              hint = 'VIS-31 / custom/external_principal_enabled resolves false for this organization: sharing with somebody who has no membership here is the external-principal lane, and it is not open. Invite them to the organization, share with their organization instead (VIS-23), or - if they are a client rather than a colleague - put them in a portal, which is the act that opens this lane for one organization and names who may come through it.';
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
  else
    if p_principal_id <> p_organization_id
       and not custom.cross_organization_links_open(p_organization_id, p_principal_id) then
      raise exception 'That organization has not agreed to links with this one, so this % cannot be shared with it.', v_word
        using errcode = '42501',
              hint = 'VIS-34: reaching across the organization wall takes BOTH organizations — each one turns on "Links to other organizations" in its own settings (custom/cross_organization_links). One organization''s flag is not consent from the other.';
    end if;

    select p.id, p.permission_level into v_perm, v_before
      from iam.permissions p
     where p.resource_type = 'record' and p.resource_id = p_subject_id
       and p.granted_to_organization_id = p_principal_id;

    if v_perm is null then
      insert into iam.permissions (resource_type, resource_id, granted_to_organization_id,
                                   permission_level, created_by, status)
      values ('record', p_subject_id, p_principal_id, p_level, custom.query_principal(), 'active')
      returning id into v_perm;
    else
      update iam.permissions
         set permission_level = p_level, status = 'active', expires_at = null
       where id = v_perm;
    end if;
  end if;

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
                                     permission_level, status, expires_at)
        values (d.resource_type, d.resource_id, d.grantee_organization_id,
                d.permission_level::public.permission_level, 'active', d.expires_at)
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
  UPDATE iam.permissions
     SET status = p_status, reviewed_by = v_uid, reviewed_at = now(), review_note = p_note
   WHERE id = p_permission_id;
  RETURN jsonb_build_object('success', true, 'message', 'Share ' || p_status, 'status', p_status);
END;
$function$;

delete from platform.client_callable_door
 where (schema_name, function_name) in (('public','grant_org_availability'),('iam','_org_availability_arm'),('iam','_org_availability_token'));
drop function if exists public.grant_org_availability(text, uuid, uuid, text);
drop function if exists iam._a_share_names_a_person();
drop function if exists iam._org_availability_arm();
drop function if exists iam._org_availability_token();
drop table if exists iam._org_availability_key;

alter table iam.permissions drop constraint if exists permissions_granted_via_check;
alter table iam.permissions drop column if exists granted_via;
alter table iam.permissions drop constraint permissions_status_check;
alter table iam.permissions add constraint permissions_status_check
  check (status = any (array['active'::text, 'pending'::text, 'rejected'::text]));
