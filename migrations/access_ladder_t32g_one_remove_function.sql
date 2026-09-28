-- chair-step: drops iam.unshare_person(uuid, uuid, boolean) — added by T-32e the same day and replaced here by iam.remove_grant, the one remove function for every grant; every caller is repointed in this file; no data is removed.
-- based-on: iam.share_with_person(text, uuid, uuid, permission_level, uuid, boolean, text, timestamp with time zone, boolean, text) 8a710bc9e62250435569ac7fe9712654d73e3e0de9a814dd2086341ec02bec8d
-- based-on: public.revoke_resource_access(text, uuid, uuid) 9e0c3911297324639a5e757265a1c2da63c72b918b2fc786cb2282c60f124b58
-- based-on: communication.meet_remove_invitee(uuid, uuid) a26b5c0adcb6e1eda5aec9d719c1b27df790630c71f366b8d8dfdbebe3d09dec
-- based-on: hr._wf_revoke_step(uuid) d5c0364017df8e22986da75a5fa5d7ef733433d5b46c05c475083b48d568e975
-- based-on: workspace._sync_task_assignee_grant() 25217d239ffb953a7c61d41cccb1eac495a17b1b90294af99dd326e77d12d1c3
-- based-on: public.dm_participant_sync_grant() 44076526002c8f1ec397da9368524034518d107016d65e74edb16318ec9b6169
-- based-on: iam.fn_revoke_resource_permission(text, uuid, uuid, text) 6603c9c8c5f49a44da057f69005171de9f763151e5e0e923750cad40a0ee4d1f
-- based-on: custom.share_revoke(uuid, uuid, text, uuid) 5594de0280350d92ffb465a53e514d692be84d731244eab37023db7cb12ad120
-- based-on: custom.share_lane_set(uuid, uuid, text, permission_level) 5c64ff9bd30fc758955099c6a27a101ed3eac2ffddc97326b28c58dc3657e671
-- based-on: public.revoke_resource_org_access(text, uuid, uuid) b4309945719b1171a1ec7b87370acef92d5cae03b3c7e355ed7ab4541f78eadb
-- based-on: public.grant_org_availability(text, uuid, uuid, text) 9b2a8cd9316cdd538a054c480e7b18f85cf8eb94cd050c667a0f34ea63aa3bc4
-- based-on: hr._reconcile_grants(text, uuid, date) e5bcfa5ccab7b8a0689acf7626662c0b77767b3a5a4deadcc0e9ca444129162b
-- based-on: public.hard_delete_file(uuid) 3a48c63c898c9ffe41d573ca933338fc98ec7b34518989ab65a66a9ff2f02537
-- based-on: public.access_request_decide(uuid, text, text, text) eff51ef15951288e83c73b9032917a5935391f95d43a050f71424138bd5ff2ed
-- based-on: public.hr_break_glass(text, uuid, text, text) 2c5621fad7410bb832f6c2bd614a3aecd6b1068a18fe36e2b90531724b933281
--
-- ACCESS LADDER T-32g — owner rulings on T-32e (2026-09-28):
--   1. Access-request APPROVAL is the owner's/admin's deliberate decision: it gives back a removed grant.
--   2. HR break-glass is the Confidential record's own audited door, not sharing: it opens for its
--      time even where a share was removed; the removal stays on record and returns when time runs out.
--      (The emergency door keeps refusing; it is being retired to account-takeover-only separately.)
--   3. Delete means archive for EVERY grant: organization and public grant removal archive and end
--      now through ONE remove function, iam.remove_grant (which replaces iam.unshare_person); no
--      function deletes an iam.permissions row. Guard: pnpm check:one-person-share-writer.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. ONE REMOVE FUNCTION FOR EVERY GRANT — person, organization, public
-- ════════════════════════════════════════════════════════════════════════════
create or replace function iam.remove_grant(
  p_permission_id uuid,
  p_actor uuid,
  p_by_person boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_row iam.permissions;
begin
  select * into v_row from iam.permissions p where p.id = p_permission_id for update;
  if v_row.id is null then
    return jsonb_build_object('success', false, 'outcome', 'not_found', 'error', 'No matching permission found');
  end if;
  if v_row.status = 'archived' then
    -- Already ended; a person removing it now makes it a removal (ended → removed), never the reverse.
    if p_by_person and p_actor is not null and v_row.reviewed_by is null then
      update iam.permissions set reviewed_by = p_actor, reviewed_at = now() where id = v_row.id;
    end if;
    return jsonb_build_object('success', true, 'outcome', 'already_removed', 'permission_id', v_row.id,
                              'message', 'Access already removed');
  end if;
  update iam.permissions
     set status = 'archived',
         expires_at = least(coalesce(expires_at, now()), now()),
         reviewed_by = case when p_by_person then p_actor end,
         reviewed_at = now()
   where id = v_row.id;
  return jsonb_build_object('success', true, 'outcome', 'removed', 'permission_id', v_row.id,
                            'message', 'Access revoked');
end;
$$;

comment on function iam.remove_grant(uuid, uuid, boolean) is
  'Access ladder T-32e/T-32g: THE one way any grant ends — a person''s, an organization''s or a public one. Archives the row (kept for the record; delete means archive), stamps expires_at so no reader admits it, and records who removed it in reviewed_by when a person did (p_by_person), which is what stops every automated writer giving a person''s access back. p_by_person false = the grant''s basis ended. Guard: pnpm check:one-person-share-writer.';

revoke all on function iam.remove_grant(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function iam.remove_grant(uuid, uuid, boolean) to service_role;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason,
   non_client_lane, signed_in_callers, anonymous_callers)
select 'iam', 'remove_grant', pg_get_function_identity_arguments(p.oid), string_to_array(p.proargtypes::text, ' ')::oid[],
       'access_ladder_t32g_one_remove_function.sql',
       'The one way any grant ends: archives one iam.permissions row by id. No authority of its own; every caller decided first.',
       'server_only: called only from definer doors (revoke_resource_access, revoke_resource_org_access, fn_revoke_resource_permission, custom.share_revoke, custom.share_lane_set, hard_delete_file) and basis triggers (task assignee, DM participant, HR workflow and reconcile, meeting invitee removal); no client ever calls it.',
       false, false
  from pg_proc p
 where p.pronamespace = 'iam'::regnamespace and p.proname = 'remove_grant'
   and not exists (select 1 from platform.client_callable_door c
                    where c.schema_name = 'iam' and c.function_name = 'remove_grant');


-- ════════════════════════════════════════════════════════════════════════════
-- 2. THE WRITER: a timed door that reopens a removed grant keeps the removal on record
-- ════════════════════════════════════════════════════════════════════════════
-- HR break-glass is the Confidential record's own audited door, not sharing (owner ruling
-- 2026-09-28): it opens even for a person whose share was removed. When a caller with a basis
-- reopens a removed grant FOR A TIME (p_expires_at), the remover stays in reviewed_by, and once the
-- time runs out the lapsed row counts as removed again — no group share or invitation can renew it.

CREATE OR REPLACE FUNCTION iam.share_with_person(p_resource_type text, p_resource_id uuid, p_target_user_id uuid, p_level permission_level, p_actor uuid, p_restore_removed boolean DEFAULT true, p_basis text DEFAULT NULL::text, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_exact boolean DEFAULT false, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_resolved record;
  v_type     text := p_resource_type;
  v_row      iam.permissions;
  v_id       uuid;
  v_level    public.permission_level;
  v_expires  timestamptz;
begin
  if p_actor is null and p_basis is null then
    return jsonb_build_object('success', false, 'error', 'Not authenticated');
  end if;
  if p_level is null then
    return jsonb_build_object('success', false, 'error', 'Invalid permission level');
  end if;
  if p_target_user_id is null then
    return jsonb_build_object('success', false, 'error', 'Say which person to share with.');
  end if;

  if p_basis is null then
    begin
      select * into strict v_resolved from public.resolve_shareable_resource(p_resource_type);
    exception when others then
      return jsonb_build_object('success', false, 'error', sqlerrm);
    end;
    v_type := v_resolved.resource_type;

    if not public.shareable_resource_exists(v_type, p_resource_id) then
      return jsonb_build_object('success', false, 'error', 'Resource not found');
    end if;
    if not iam.may_manage_sharing_as(p_actor, v_type, p_resource_id) then
      return jsonb_build_object('success', false, 'error',
        'You need Admin on this to decide who else may see it. Ask whoever holds it, or an owner of the organization.');
    end if;

    -- SCHEMA `custom` KEEPS ITS OWN DOOR (the store switch, VIS-31's external principal, VIS-34's
    -- both-sides wall). That door judges the signed-in caller, so it is only reached by one. It
    -- writes its row back through this function with p_basis = 'record_store'.
    if v_resolved.schema_name = 'custom' then
      if p_actor is distinct from (select auth.uid()) then
        return jsonb_build_object('success', false, 'error',
          'A record in a table is shared by a signed-in person from the table itself; it cannot be shared on someone''s behalf.');
      end if;
      return public.store_door_share(v_type, p_resource_id, 'person', p_target_user_id, p_level::text);
    end if;
  end if;

  insert into iam.permissions
    (resource_type, resource_id, granted_to_user_id, permission_level, created_by, granted_via, status,
     expires_at, review_note)
  values (v_type, p_resource_id, p_target_user_id, p_level, p_actor, 'share', 'active',
          p_expires_at, p_note)
  on conflict (resource_type, resource_id, granted_to_user_id) do nothing
  returning id into v_id;
  if v_id is not null then
    return jsonb_build_object('success', true, 'outcome', 'shared', 'message', 'Successfully shared with user',
      'permission_id', v_id, 'permission_level', p_level::text, 'resource_type', v_type);
  end if;

  select * into v_row from iam.permissions p
   where p.resource_type = v_type and p.resource_id = p_resource_id and p.granted_to_user_id = p_target_user_id
   for update;

  -- A live grant: raise (or, for a rule that owns the level, set exactly).
  -- A removed grant a timed door reopened (reviewed_by kept) is still removed to everyone else.
  if v_row.status = 'active' and v_row.reviewed_by is not null and not p_restore_removed then
    return jsonb_build_object('success', false, 'outcome', 'removed', 'permission_id', v_row.id,
      'resource_type', v_type, 'person', p_target_user_id,
      'error', 'This person''s access was removed earlier, so it is not given back automatically. Share with them directly to give it back.');
  end if;

  if v_row.status = 'active' and (v_row.expires_at is null or v_row.expires_at > now()) then
    if p_exact then
      v_level := p_level;
      v_expires := p_expires_at;
    else
      v_level := greatest(v_row.permission_level, p_level);
      v_expires := case when v_row.expires_at is null or p_expires_at is null then null
                        else greatest(v_row.expires_at, p_expires_at) end;
    end if;
    if v_level = v_row.permission_level and v_expires is not distinct from v_row.expires_at then
      return jsonb_build_object('success', true, 'outcome', 'unchanged',
        'message', format('They already have %s access.', v_row.permission_level::text),
        'permission_id', v_row.id, 'permission_level', v_row.permission_level::text, 'resource_type', v_type);
    end if;
    update iam.permissions set permission_level = v_level, expires_at = v_expires where id = v_row.id;
    return jsonb_build_object('success', true,
      'outcome', case when v_level > v_row.permission_level then 'raised' else 'changed' end,
      'message', format('Changed from %s to %s.', v_row.permission_level::text, v_level::text),
      'permission_id', v_row.id, 'permission_level', v_level::text, 'resource_type', v_type);
  end if;

  -- A lapsed grant (its time ran out) or one that ended with its basis: given again.
  if (v_row.status = 'active' and v_row.reviewed_by is null)
     or (v_row.status = 'archived' and v_row.reviewed_by is null) then
    update iam.permissions
       set status = 'active', permission_level = p_level, expires_at = p_expires_at,
           created_by = coalesce(p_actor, created_by), granted_via = 'share',
           review_note = coalesce(p_note, review_note), reviewed_by = null, reviewed_at = null
     where id = v_row.id;
    return jsonb_build_object('success', true, 'outcome', 'shared', 'message', 'Successfully shared with user',
      'permission_id', v_row.id, 'permission_level', p_level::text, 'resource_type', v_type);
  end if;

  -- REMOVED by a person: only a deliberate share by someone allowed to share gives it back.
  if v_row.status in ('archived', 'active') and p_restore_removed then
    update iam.permissions
       set status = 'active', permission_level = p_level, expires_at = p_expires_at,
           created_by = p_actor, granted_via = 'share',
           reviewed_by = case when p_basis is not null and p_expires_at is not null then reviewed_by end,
           reviewed_at = case when p_basis is not null and p_expires_at is not null then reviewed_at end
     where id = v_row.id;
    return jsonb_build_object('success', true, 'outcome', 'restored', 'message', 'Access given back',
      'permission_id', v_row.id, 'permission_level', p_level::text, 'resource_type', v_type);
  end if;

  return jsonb_build_object('success', false, 'outcome', 'removed', 'permission_id', v_row.id,
    'resource_type', v_type, 'person', p_target_user_id,
    'error', case v_row.status
      when 'pending'  then 'This person''s access is waiting for review, so it is not changed here.'
      when 'rejected' then 'This person''s access was declined in review, so it is not given here.'
      else 'This person''s access was removed earlier, so it is not given back automatically. Share with them directly to give it back.'
    end);
end;
$function$;

CREATE OR REPLACE FUNCTION public.revoke_resource_access(p_resource_type text, p_resource_id uuid, p_target_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_resolved record;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated'); END IF;
  BEGIN
    SELECT * INTO STRICT v_resolved FROM public.resolve_shareable_resource(p_resource_type);
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', SQLERRM); END;

  IF NOT public.may_manage_sharing(v_resolved.resource_type, p_resource_id) THEN
    RETURN jsonb_build_object('success', false, 'error',
      'You need Admin on this to decide who else may see it. Ask whoever holds it, or an owner of the organization.');
  END IF;
  IF v_resolved.schema_name = 'custom' THEN
    RETURN public.store_door_unshare(v_resolved.resource_type, p_resource_id, 'person', p_target_user_id);
  END IF;

  -- REVOCATION RULE (T-32e): the grant is archived, never deleted, and ends now; the remover is
  -- recorded, so no group share, invitation, request or other automated writer gives it back.
  RETURN iam.remove_grant(
    (SELECT p.id FROM iam.permissions p
      WHERE p.resource_type = v_resolved.resource_type AND p.resource_id = p_resource_id
        AND p.granted_to_user_id = p_target_user_id),
    v_uid, true);
END;
$function$;

CREATE OR REPLACE FUNCTION communication.meet_remove_invitee(p_invitee_id uuid, p_by_user_id uuid)
 RETURNS communication.meet_invitees
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_actor uuid; v_mid uuid; v_role text; v_row communication.meet_invitees;
begin
  v_actor := communication._meet_actor(p_by_user_id);
  select i.meeting_id, i.role into v_mid, v_role from communication.meet_invitees i where i.id = p_invitee_id;
  if not communication._meet_may(v_mid, v_actor, case when v_role = 'cohost' then 'admin' else 'editor' end) then
    raise exception 'meet_remove_invitee: only the host, a co-host, or an editor of this meeting can remove an invitation (a co-host only by the host or a co-host)'
      using errcode = '42501';
  end if;
  update communication.meet_invitees set deleted_at = coalesce(deleted_at, now())
   where id = p_invitee_id
  returning * into v_row;
  if not found then
    perform platform.refuse_not_found('meet_remove_invitee: no such invitation');
  end if;
  -- Removing someone from the invitation removes the access the invitation gave them.
  if v_row.invitee_user_id is not null then
    -- A host's removal is a person's removal (T-32e): no later invite or group share gives it back.
    perform iam.remove_grant(p.id, v_actor, true)
       from iam.permissions p
      where p.resource_type = 'meet_meeting' and p.resource_id = v_mid
        and p.granted_to_user_id = v_row.invitee_user_id and p.status = 'active';
  end if;
  if v_row.rsvp_token_id is not null then
    update platform.actor_token
       set is_active = false, revoked_at = coalesce(revoked_at, now()),
           revoked_reason = coalesce(revoked_reason, 'meet: removed from the invitation')
     where id = v_row.rsvp_token_id;
  end if;
  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION hr._wf_revoke_step(p_step uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare st hr.workflow_step%rowtype; u uuid; v_n integer := 0;
begin
  select * into st from hr.workflow_step where id = p_step;
  if not found then return 0; end if;
  foreach u in array coalesce(st.resolved_user_ids,'{}'::uuid[]) loop
    -- keep the grant if ANOTHER still-open step on this instance names the same person
    continue when exists (select 1 from hr.workflow_step s2
                           where s2.workflow_instance_id = st.workflow_instance_id
                             and s2.id <> p_step
                             and s2.state in ('active','awaiting_result')
                             and u = any(s2.resolved_user_ids));
    perform iam.remove_grant(p.id, null, false) from iam.permissions p
     where p.resource_type = 'hr_workflow_instance' and p.resource_id = st.workflow_instance_id
       and p.granted_to_user_id = u and p.status <> 'archived'
       and p.review_note like 'auto:wf_step:%';
    v_n := v_n + 1;
  end loop;
  return v_n;
end $function$;

CREATE OR REPLACE FUNCTION workspace._sync_task_assignee_grant()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'iam', 'workspace'
AS $function$
DECLARE
  v_res jsonb;
BEGIN
  -- Drop the auto grant for a previous/cleared assignee.
  IF TG_OP='UPDATE' AND OLD.assignee_id IS DISTINCT FROM NEW.assignee_id THEN
    PERFORM iam.remove_grant(p.id, NULL, false) FROM iam.permissions p
     WHERE p.resource_type='task' AND p.resource_id=NEW.id AND p.review_note='auto:assignee'
       AND p.status <> 'archived'
       AND (NEW.assignee_id IS NULL OR p.granted_to_user_id IS DISTINCT FROM NEW.assignee_id);
  END IF;
  -- Ensure a grant for the current assignee (never the owner — they already own it).
  IF NEW.assignee_id IS NOT NULL AND NEW.assignee_id IS DISTINCT FROM NEW.created_by THEN
    -- through the one writer (T-32e): raise-only, so a hand-made share is never lowered, and an
    -- assignment never gives back access someone removed — it refuses, naming the remedy.
    v_res := iam.share_with_person('task', NEW.id, NEW.assignee_id, 'editor',
                                   COALESCE(NEW.updated_by, NEW.created_by), false, 'task_assignee',
                                   NULL, false, 'auto:assignee');
    IF NOT COALESCE((v_res ->> 'success')::boolean, false) THEN
      RAISE EXCEPTION 'The person you assigned had their access to this task removed, so assigning it does not give it back.'
        USING errcode = '42501', hint = 'Share the task with them directly first, then assign it.';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.dm_participant_sync_grant()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_res jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM iam.remove_grant(p.id, NULL, false) FROM iam.permissions p
     WHERE p.resource_type='dm_conversation' AND p.resource_id=OLD.conversation_id
       AND p.granted_to_user_id=OLD.user_id;
    RETURN OLD;
  END IF;

  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.deleted_at IS NOT NULL THEN
    -- participant left/removed -> the grant's basis ended: archived (T-32e), never deleted
    PERFORM iam.remove_grant(p.id, NULL, false) FROM iam.permissions p
     WHERE p.resource_type='dm_conversation' AND p.resource_id=NEW.conversation_id
       AND p.granted_to_user_id=NEW.user_id;
  ELSE
    -- active participant -> an active editor grant, through the one writer
    v_res := iam.share_with_person('dm_conversation', NEW.conversation_id, NEW.user_id, 'editor',
                                   COALESCE(NEW.created_by, NEW.user_id), false, 'dm_participant', NULL, true, NULL);
    IF NOT COALESCE((v_res ->> 'success')::boolean, false) THEN
      RAISE EXCEPTION '%', v_res ->> 'error'
        USING errcode = '42501', hint = 'Their access to this conversation was removed; share it with them directly to give it back.';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION iam.fn_revoke_resource_permission(p_resource_type text, p_resource_id uuid, p_grantee_id uuid, p_grantee_type text DEFAULT 'user'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'iam'
AS $function$
declare
  v_deleted integer;
begin
  if p_resource_type not in ('file', 'folder', 'web_site') then
    raise exception 'unsupported resource_type %', p_resource_type;
  end if;
  if p_grantee_type not in ('user', 'organization') then
    raise exception 'unsupported grantee_type %; the user-group ACL path is removed', p_grantee_type;
  end if;
  if not iam.has_access(p_resource_type, p_resource_id, 'admin') then
    raise exception 'insufficient permission on %', p_resource_type;
  end if;

  if p_grantee_type = 'organization' then
    -- delete means archive (T-32g): an organization's grant ends through the one remove function.
    return coalesce((iam.remove_grant(
      (select p.id from iam.permissions p
        where p.resource_type = p_resource_type and p.resource_id = p_resource_id
          and p.granted_to_organization_id = p_grantee_id and p.status <> 'archived'),
      (select auth.uid()), true) ->> 'success')::boolean, false);
  end if;

  -- A person's grant is archived by the one revoke (T-32e), never deleted.
  return coalesce((iam.remove_grant(
    (select p.id from iam.permissions p
      where p.resource_type = p_resource_type and p.resource_id = p_resource_id
        and p.granted_to_user_id = p_grantee_id and p.status <> 'archived'),
    (select auth.uid()), true) ->> 'success')::boolean, false);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.share_revoke(p_organization_id uuid, p_subject_id uuid, p_principal_kind text, p_principal_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_kind  text := lower(btrim(coalesce(p_principal_kind, '')));
  v_row   custom.record;
  v_word  text;
  v_gone  integer;
  v_still public.permission_level;
begin
  perform custom.assert_store_door(p_organization_id, 'share_revoke');
  perform custom.assert_client_may_change(p_organization_id, p_subject_id, 'share_revoke',
                                          'admin'::public.permission_level, 'record');

  select r.* into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_subject_id;
  if not found then
    raise exception 'There is no such record in this organization.' using errcode = '02000';
  end if;
  v_word := case when v_row.table_id = custom.table_kernel_id() then 'table' else 'record' end;

  if v_kind in ('person', 'user') then
    -- REVOCATION RULE (T-32e): a person's share is archived by the one revoke, never deleted.
    select count(*) filter (where coalesce((iam.remove_grant(p.id, (select auth.uid()), true) ->> 'outcome') = 'removed', false))
      into v_gone
      from iam.permissions p
     where p.resource_type = 'record' and p.resource_id = p_subject_id
       and p.granted_to_user_id = p_principal_id and p.status <> 'archived';
  else
    -- delete means archive (T-32g): organization and public grants end through the one remove function.
    select count(*) filter (where coalesce((iam.remove_grant(p.id, (select auth.uid()), true) ->> 'outcome') = 'removed', false))
      into v_gone
      from iam.permissions p
     where p.resource_type = 'record' and p.resource_id = p_subject_id and p.status <> 'archived'
       and ((v_kind = 'organization' and p.granted_to_organization_id = p_principal_id)
         or (v_kind = 'everyone'     and p.is_public));
  end if;

  if v_gone = 0 then
    raise exception 'There is no share here to take back from them.'
      using errcode = '02000',
            hint = 'They may still reach it another way — through the thing that carries it, through the '
                   'organization''s own member default, or because they created it. custom.share_access '
                   'names every reason and says which ones a share dialog can undo.';
  end if;

  -- THE HONEST ANSWER, and the reason this returns more than "done": revoking the grant does
  -- NOT necessarily end their access. Say what is left rather than let a screen imply nothing is.
  if v_kind in ('person', 'user') then
    v_still := custom.effective_level(p_principal_id, p_organization_id, p_subject_id, 'record');
  end if;

  return jsonb_build_object(
    'revoked', true,
    'subject', v_word,
    'grants_removed', v_gone,
    'principal_kind', case when v_kind = 'user' then 'person' else v_kind end,
    'principal_id', p_principal_id,
    'still_reaches', v_still::text,
    'message', case when v_still is null
                    then 'Access removed.'
                    else format('The share is gone, but they still reach this %s at %s another way — see who has access for the reason.',
                                v_word, lower(iam.level_label(v_word, v_still))) end);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.share_lane_set(p_organization_id uuid, p_subject_id uuid, p_choice text, p_level permission_level DEFAULT NULL::permission_level)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_choice record;
  v_row    custom.record;
  v_word   text;
  v_level  public.permission_level;
begin
  perform custom.assert_store_door(p_organization_id, 'share_lane_set');
  perform custom.assert_client_may_change(p_organization_id, p_subject_id, 'share_lane_set',
                                          'admin'::public.permission_level, 'record');

  select r.* into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_subject_id;
  if not found then
    raise exception 'There is no such record in this organization.' using errcode = '02000';
  end if;
  v_word := case when v_row.table_id = custom.table_kernel_id() then 'table' else 'record' end;

  select * into v_choice from custom.share_lanes() l where l.choice = lower(btrim(coalesce(p_choice, '')));
  if not found then
    raise exception 'There is no lane called "%".', coalesce(p_choice, '<nothing>')
      using errcode = '22023',
            hint = 'The lanes are mine, organization, community and world — call custom.share_lanes() for what each one means.';
  end if;

  -- SHARE-TAILS (2026-09-25): THE LANE AND THE VISIBILITY MOVE TOGETHER, IN THIS ONE TRANSACTION.
  -- `custom.record.visibility` is what the access kernel reads for the organization-member lane
  -- (iam.has_access_for_base, iam.member_lane_confers): `internal` means every member reaches it
  -- by default. This door used to write only iam.content_lane, so "Only people I share it with"
  -- left the thing `internal` and every member of the organization still read it while the
  -- dialog said otherwise (measured on the clone as a plain member, 2026-09-25). Access is
  -- personal: `mine` is the owner and the people named, so it is `personal`; the organization
  -- and world lanes reach at least every member, so they are `internal`. The world lane's own
  -- act is still delegated whole below; if it refuses, this line rolls back with it.
  update custom.record r
     set visibility = case when v_choice.choice = 'mine'
                           then 'personal'::platform.visibility
                           else 'internal'::platform.visibility end
   where r.organization_id = p_organization_id and r.id = p_subject_id
     and r.visibility is distinct from (case when v_choice.choice = 'mine'
                                             then 'personal'::platform.visibility
                                             else 'internal'::platform.visibility end);

  if v_choice.lane = 'world' then
    -- Delegated whole: the world lane has its own act, its own admission and its own switch,
    -- and this door does not get a second copy of any of them (VIS-N-5, VIS-N-7).
    perform iam.publish_to_world('record', p_subject_id, p_organization_id, v_choice.discoverable);
    return jsonb_build_object('lane', v_choice.choice, 'message', v_choice.label || '.');
  end if;

  if v_choice.choice = 'organization' then
    v_level := coalesce(p_level, iam.member_default_level(p_organization_id, v_row.table_id),
                        'viewer'::public.permission_level);
    -- SHARE-PEOPLE-ONLY (chair ruling 2026-09-25): the "Everyone in this organization" LANE is the
    -- owner's visibility choice for the thing's OWN organization — one of the four lanes (mine,
    -- organization, community, world) — not a share. It is written through the availability arm
    -- and stamped so, because custom.share_grant now refuses an organization by name.
    perform iam._org_availability_arm();
    insert into iam.permissions (resource_type, resource_id, granted_to_organization_id,
                                 permission_level, created_by, status, granted_via)
    values ('record', p_subject_id, p_organization_id, v_level, custom.query_principal(), 'active', 'availability')
    on conflict (resource_type, resource_id, granted_to_organization_id) do update
       set permission_level = excluded.permission_level, status = 'active', expires_at = null,
           reviewed_by = null, reviewed_at = null;
  else
    -- delete means archive (T-32g)
    perform iam.remove_grant(p.id, custom.query_principal(), true)
       from iam.permissions p
      where p.resource_type = 'record' and p.resource_id = p_subject_id and p.status <> 'archived'
        and (p.granted_to_organization_id = p_organization_id or p.is_public);
    v_level := null;
  end if;

  insert into iam.content_lane as c
        (resource_type, resource_id, organization_id, lane, discoverable, unlisted)
  values ('record', p_subject_id, p_organization_id, 'mine', false, true)
  on conflict (resource_type, resource_id) do update
     set lane = 'mine', discoverable = false, unlisted = true;

  return jsonb_build_object(
    'lane', v_choice.choice,
    'level', v_level::text,
    'message', case when v_choice.choice = 'organization'
                    then format('Everyone in this organization now reaches this %s at %s.',
                                v_word, lower(iam.level_label(v_word, v_level)))
                    else format('Only the people it is shared with reach this %s now.', v_word) end);
end;
$function$;

CREATE OR REPLACE FUNCTION public.revoke_resource_org_access(p_resource_type text, p_resource_id uuid, p_target_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_resolved record;
  v_res      jsonb;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated'); END IF;
  BEGIN
    SELECT * INTO STRICT v_resolved FROM public.resolve_shareable_resource(p_resource_type);
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', SQLERRM); END;

  IF NOT public.may_manage_sharing(v_resolved.resource_type, p_resource_id) THEN
    RETURN jsonb_build_object('success', false, 'error',
      'You need Admin on this to decide who else may see it. Ask whoever holds it, or an owner of the organization.');
  END IF;
  IF v_resolved.schema_name = 'custom' THEN
    RETURN public.store_door_unshare(v_resolved.resource_type, p_resource_id, 'organization', p_target_org_id);
  END IF;

  -- delete means archive (T-32g): the organization's grant is archived and ends now.
  v_res := iam.remove_grant(
    (SELECT p.id FROM iam.permissions p
      WHERE p.resource_type = v_resolved.resource_type AND p.resource_id = p_resource_id
        AND p.granted_to_organization_id = p_target_org_id),
    v_uid, true);
  IF NOT COALESCE((v_res ->> 'success')::boolean, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No matching organization permission found');
  END IF;
  RETURN jsonb_build_object('success', true, 'message', 'Organization access revoked', 'outcome', v_res ->> 'outcome');
END;
$function$;

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
  IF EXISTS (SELECT 1 FROM iam.permissions WHERE resource_type=v_resolved.resource_type AND resource_id=p_resource_id AND granted_to_organization_id=p_target_org_id AND status <> 'archived') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Organization already has access'); END IF;
  PERFORM iam._org_availability_arm();
  -- A grant removed earlier is kept as the record (T-32g); making it available again reopens that row.
  UPDATE iam.permissions
     SET status = v_status, permission_level = v_level::permission_level, created_by = v_uid,
         granted_via = 'availability', expires_at = NULL, reviewed_by = NULL, reviewed_at = NULL
   WHERE resource_type=v_resolved.resource_type AND resource_id=p_resource_id
     AND granted_to_organization_id=p_target_org_id AND status = 'archived'
  RETURNING id INTO v_new_id;
  IF v_new_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true,
      'message', CASE WHEN v_status='pending' THEN 'Shared — pending admin approval' ELSE 'Available to everyone in the organization' END,
      'permission_id', v_new_id, 'status', v_status, 'permission_level', v_level, 'resource_type', v_resolved.resource_type);
  END IF;
  INSERT INTO iam.permissions (resource_type, resource_id, granted_to_organization_id, permission_level, created_by, status, granted_via)
  VALUES (v_resolved.resource_type, p_resource_id, p_target_org_id, v_level::permission_level, v_uid, v_status, 'availability')
  RETURNING id INTO v_new_id;
  RETURN jsonb_build_object('success', true,
    'message', CASE WHEN v_status='pending' THEN 'Shared — pending admin approval' ELSE 'Available to everyone in the organization' END,
    'permission_id', v_new_id, 'status', v_status, 'permission_level', v_level, 'resource_type', v_resolved.resource_type);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END; $function$;

CREATE OR REPLACE FUNCTION hr._reconcile_grants(p_scope_kind text, p_scope_id uuid, p_at date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare
  v_ins int := 0; v_upd int := 0; v_del int := 0; v_same int := 0;
  d record; v_perm uuid; v_changed boolean; v_res jsonb; v_not_given jsonb := '[]'::jsonb;
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
              or coalesce(p.status,'active') <> 'active')
        into v_perm, v_changed
        from iam.permissions p
       where p.resource_type = d.resource_type and p.resource_id = d.resource_id
         and p.granted_to_user_id = d.grantee_user_id;

      if v_perm is null or v_changed then
        -- THE ONE WRITER (T-32e): HR sets its level exactly; access a person removed is skipped
        -- and named in the result, never given back.
        v_res := iam.share_with_person(d.resource_type, d.resource_id, d.grantee_user_id,
                                       d.permission_level::public.permission_level, null, false,
                                       'hr_derived', d.expires_at, true, null);
        if not coalesce((v_res ->> 'success')::boolean, false) then
          v_not_given := v_not_given || jsonb_build_object('resource_type', d.resource_type,
            'resource_id', d.resource_id, 'person', d.grantee_user_id, 'why', v_res ->> 'error');
          continue;
        end if;
        if v_perm is null then v_ins := v_ins + 1; else v_upd := v_upd + 1; end if;
        v_perm := (v_res ->> 'permission_id')::uuid;
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
           set permission_level = d.permission_level::public.permission_level, expires_at = d.expires_at,
               status = 'active', reviewed_by = null, reviewed_at = null
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
    -- The grant's basis ended: archived by the one remove function (T-32e/g), never deleted; the
    -- mapping stays so the grant is recognised as HR's if the rule applies again. Already-ended
    -- rows are not counted, so the second run still performs zero writes.
    if (iam.remove_grant(d.permission_id, null, false) ->> 'outcome') = 'removed' then
      v_del := v_del + 1;
    end if;
  end loop;

  drop table if exists _hr_desired;

  return jsonb_build_object('scope', p_scope_kind, 'id', p_scope_id, 'as_of', p_at,
                            'inserted', v_ins, 'updated', v_upd, 'deleted', v_del,
                            'unchanged', v_same, 'not_given', v_not_given);
end
$function$;

CREATE OR REPLACE FUNCTION public.hard_delete_file(p_file_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_main_uri TEXT;
    v_version_uris TEXT[] := ARRAY[]::TEXT[];
    v_extra_uris TEXT[] := ARRAY[]::TEXT[];
    v_child_retained TEXT[] := ARRAY[]::TEXT[];
    v_purge_uris TEXT[] := ARRAY[]::TEXT[];
    v_retained_uris TEXT[] := ARRAY[]::TEXT[];
    v_main_retained BOOLEAN := FALSE;
    v_child_id UUID;
    v_child_purge JSONB;
    v_uri TEXT;
    v_group RECORD;
    v_root_id UUID;
    v_heir_id UUID;
BEGIN
    IF auth.uid() IS NOT NULL AND NOT iam.has_access('file', p_file_id, 'admin') THEN
        RAISE EXCEPTION 'forbidden: not authorized to permanently delete file %', p_file_id
            USING ERRCODE = '42501';
    END IF;

    FOR v_child_id IN
        SELECT id FROM files.files WHERE parent_file_id = p_file_id
    LOOP
        v_child_purge := hard_delete_file(v_child_id);
        IF v_child_purge IS NOT NULL THEN
            IF v_child_purge->>'main' IS NOT NULL THEN
                v_extra_uris := array_append(v_extra_uris, v_child_purge->>'main');
            END IF;
            FOR v_uri IN
                SELECT jsonb_array_elements_text(COALESCE(v_child_purge->'versions', '[]'::jsonb))
            LOOP
                v_extra_uris := array_append(v_extra_uris, v_uri);
            END LOOP;
            -- AD238: a child's retained decision was made while THIS row still existed;
            -- it is re-checked below, after this row is deleted.
            FOR v_uri IN
                SELECT jsonb_array_elements_text(COALESCE(v_child_purge->'retained', '[]'::jsonb))
            LOOP
                v_child_retained := array_append(v_child_retained, v_uri);
            END LOOP;
        END IF;
    END LOOP;

    SELECT storage_uri INTO v_main_uri
      FROM files.files
     WHERE id = p_file_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'main', NULL,
            'versions', to_jsonb(v_extra_uris),
            'main_retained', FALSE,
            'retained', to_jsonb(v_child_retained)
        );
    END IF;

    SELECT COALESCE(array_agg(storage_uri) FILTER (WHERE storage_uri IS NOT NULL), ARRAY[]::TEXT[])
      INTO v_version_uris
      FROM files.file_versions
     WHERE file_id = p_file_id;

    -- Free the live-only canonical index slot before promoting an alias. A
    -- trashed target is already outside the partial index.
    UPDATE files.files
       SET deleted_at = COALESCE(deleted_at, now())
     WHERE id = p_file_id;

    FOR v_group IN
        SELECT organization_id, created_by, checksum
          FROM files.files
         WHERE duplicate_of_file_id = p_file_id
         GROUP BY organization_id, created_by, checksum
    LOOP
        SELECT id
          INTO v_root_id
          FROM files.files
         WHERE id <> p_file_id
           AND deleted_at IS NULL
           AND duplicate_of_file_id IS NULL
           AND parent_file_id IS NULL
           AND organization_id = v_group.organization_id
           AND created_by = v_group.created_by
           AND checksum IS NOT DISTINCT FROM v_group.checksum
         ORDER BY created_at, id
         LIMIT 1
         FOR UPDATE;

        IF v_root_id IS NULL THEN
            SELECT id
              INTO v_heir_id
              FROM files.files
             WHERE duplicate_of_file_id = p_file_id
               AND organization_id = v_group.organization_id
               AND created_by = v_group.created_by
               AND checksum IS NOT DISTINCT FROM v_group.checksum
             ORDER BY (deleted_at IS NOT NULL), created_at, id
             LIMIT 1
             FOR UPDATE;

            v_root_id := v_heir_id;
            UPDATE files.files
               SET duplicate_of_file_id = NULL
             WHERE id = v_root_id;
        END IF;

        UPDATE files.files
           SET duplicate_of_file_id = v_root_id
         WHERE duplicate_of_file_id = p_file_id
           AND id <> v_root_id
           AND organization_id = v_group.organization_id
           AND created_by = v_group.created_by
           AND checksum IS NOT DISTINCT FROM v_group.checksum;

        v_root_id := NULL;
        v_heir_id := NULL;
    END LOOP;

    DELETE FROM platform.share_links
     WHERE resource_type = 'file' AND resource_id = p_file_id;
    -- delete means archive (T-32g): the file's grants are kept as the record and end now.
    PERFORM iam.remove_grant(p.id, NULL, false) FROM iam.permissions p
     WHERE p.resource_type = 'file' AND p.resource_id = p_file_id AND p.status <> 'archived';
    DELETE FROM files.file_versions WHERE file_id = p_file_id;
    DELETE FROM files.files WHERE id = p_file_id;

    FOREACH v_uri IN ARRAY (v_version_uris || v_extra_uris || v_child_retained)
    LOOP
        IF EXISTS (SELECT 1 FROM files.files WHERE storage_uri = v_uri)
           OR EXISTS (SELECT 1 FROM files.file_versions WHERE storage_uri = v_uri)
        THEN
            v_retained_uris := array_append(v_retained_uris, v_uri);
        ELSE
            v_purge_uris := array_append(v_purge_uris, v_uri);
        END IF;
    END LOOP;

    IF v_main_uri IS NOT NULL AND (
        EXISTS (SELECT 1 FROM files.files WHERE storage_uri = v_main_uri)
        OR EXISTS (SELECT 1 FROM files.file_versions WHERE storage_uri = v_main_uri)
    ) THEN
        v_main_retained := TRUE;
        v_retained_uris := array_append(v_retained_uris, v_main_uri);
        v_main_uri := NULL;
    END IF;

    SELECT COALESCE(array_agg(DISTINCT value), ARRAY[]::TEXT[])
      INTO v_retained_uris
      FROM unnest(v_retained_uris) AS value;
    SELECT COALESCE(array_agg(DISTINCT value), ARRAY[]::TEXT[])
      INTO v_purge_uris
      FROM unnest(v_purge_uris) AS value;

    IF auth.uid() IS NOT NULL THEN
        RETURN jsonb_build_object(
            'deleted', TRUE,
            'versions_deleted', cardinality(v_purge_uris),
            'objects_retained', cardinality(v_retained_uris)
        );
    END IF;

    RETURN jsonb_build_object(
        'main', v_main_uri,
        'versions', to_jsonb(v_purge_uris),
        'main_retained', v_main_retained,
        'retained', to_jsonb(v_retained_uris)
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.access_request_decide(p_request_id uuid, p_decision text, p_level text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'iam'
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_req record;
  v_level public.permission_level;
  v_meta record;
  v_attrs record;
  v_can_decide boolean;
  v_res jsonb;
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if p_decision not in ('grant', 'decline', 'complete') then
    raise exception 'Unsupported decision.' using errcode = '22023';
  end if;

  select * into v_req
  from iam.access_requests
  where id = p_request_id and deleted_at is null
  for update;

  if v_req.id is null then
    raise exception 'That request no longer exists.' using errcode = '02000';
  end if;
  if v_req.created_by = v_uid then
    raise exception 'You cannot answer your own request.' using errcode = '42501';
  end if;
  if v_req.status <> 'pending' then
    return jsonb_build_object('id', v_req.id, 'status', v_req.status,
                              'already', true);
  end if;

  v_can_decide := iam.can_decide_access_request(
    v_uid, v_req.resource_type, v_req.resource_id
  ) or (
    v_req.request_kind = 'resource_action'
    and coalesce(v_req.request_payload->'recipient_ids', '[]'::jsonb) ? v_uid::text
  );
  if not v_can_decide then
    raise exception 'You are not able to answer this request.' using errcode = '42501';
  end if;

  if p_decision = 'complete' and v_req.request_kind <> 'resource_action' then
    raise exception 'Only an action request can be completed.' using errcode = '22023';
  end if;

  if p_decision = 'grant' then
    select et.schema_name, et.table_name into v_meta
    from platform.entity_types et where et.token = v_req.resource_type;
    if v_meta.schema_name is not null then
      select * into v_attrs
      from platform.entity_row_access_attrs(v_meta.schema_name, v_meta.table_name,
                                            v_req.resource_id);
      if not coalesce(v_attrs.o_found, false) then
        raise exception 'That item no longer exists, so access cannot be granted.'
          using errcode = '02000';
      end if;
    end if;

    v_level := coalesce(nullif(p_level, ''), v_req.requested_level)::public.permission_level;

    -- A shareable resource takes an ordinary grant; a membership container takes
    -- a membership. See access_request_decide_container_grants_membership.sql.
    if exists (select 1 from platform.shareable_resource_registry sr
                where sr.resource_type = v_req.resource_type) then
      -- THE ONE WRITER (T-32e). Approving a request is the owner's/admin's deliberate decision about
      -- this person (owner ruling 2026-09-28), so it gives back access removed earlier.
      v_res := iam.share_with_person(v_req.resource_type, v_req.resource_id, v_req.created_by, v_level,
                                     v_uid, true, 'access_request', null, true, null);
      if not coalesce((v_res ->> 'success')::boolean, false) then
        raise exception '%', v_res ->> 'error'
          using errcode = '42501',
                hint = 'Their access was removed earlier. To give it back, share it with them directly; this request stays open until you decline it.';
      end if;
    elsif exists (select 1 from iam.memberships m
                   where m.container_type = v_req.resource_type
                     and m.deleted_at is null) then
      -- DD-191: LENIENT on purpose — this reads resource_org_id ONLY, and the decider was already
      -- authorized by iam.can_decide_access_request above. mbr_add below runs its own authority.
      perform public.mbr_add(
        v_req.resource_type,
        v_req.resource_id,
        v_req.created_by,
        (select c.resource_org_id
           from iam._container_authz(v_req.resource_type, v_req.resource_id, v_uid, false) c),
        case when v_level = 'admin'::public.permission_level then 'admin'
             else 'member' end,
        'active',
        jsonb_build_object('grant_source', 'access_request',
                           'request_id', p_request_id));
    else
      raise exception 'Access to this % cannot be granted from a request.',
        lower(coalesce((select label from platform.entity_types
                         where token = v_req.resource_type), 'item'))
        using errcode = '42501';
    end if;
  end if;

  update iam.access_requests
     set status = case when p_decision in ('grant', 'complete') then 'granted' else 'declined' end,
         decided_by = v_uid,
         decided_at = now(),
         decision_note = nullif(btrim(p_note), ''),
         requested_level = case when p_decision = 'grant' then v_level::text else requested_level end
   where id = p_request_id;

  return jsonb_build_object(
    'id', p_request_id,
    'status', case when p_decision in ('grant', 'complete') then 'granted' else 'declined' end,
    'already', false,
    'request_kind', v_req.request_kind,
    'action_key', nullif(v_req.request_key, ''),
    'requester_id', v_req.created_by,
    'resource_type', v_req.resource_type,
    'resource_id', v_req.resource_id,
    'entity_label', coalesce(v_req.request_payload->>'entity_label',
      (select label from platform.entity_types where token = v_req.resource_type)),
    'entity_title', coalesce(v_req.request_payload->>'entity_title',
      platform.entity_title(v_req.resource_type, v_req.resource_id))
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.hr_break_glass(p_token text, p_id uuid, p_purpose text, p_justification text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare
  v_share jsonb;
  v_uid uuid := auth.uid(); d record; v_min int; v_ttl int; v_org uuid; v_schema text;
  v_table text; v_audit uuid; v_perm uuid; v_subject uuid; v_verdict jsonb; v_note_kind text;
  nk record; v_bg_ok boolean;
begin
  if v_uid is null then
    raise exception 'hr_break_glass: no authenticated caller' using errcode = '42501';
  end if;
  select * into d from hr._door_spec(p_token);
  if not found then
    raise exception 'hr_break_glass: % is not an audited-tier token', p_token using errcode = '22023';
  end if;

  select e.schema_name, e.table_name into v_schema, v_table
    from platform.entity_types e where e.token = p_token;
  execute format('select organization_id from %I.%I where id = $1', v_schema, v_table)
     into v_org using p_id;
  if v_org is null then
    perform platform.refuse_not_found(format('hr_break_glass: no %s row with id %s', p_token, p_id));
  end if;

  -- ---- the caller must hold a role whose catalogue row says break_glass_allowed
  if not exists (
    select 1 from hr.role_assignment ra
      join lateral (select ar.break_glass_allowed from hr.access_role ar
                     where ar.role_key = ra.role_key and ar.deleted_at is null and ar.is_active
                       and ar.organization_id in (ra.organization_id,
                                                  '39c38960-d30c-4840-b0c1-c9960de95582'::uuid)
                     order by (ar.organization_id = ra.organization_id) desc limit 1) role on true
     where ra.organization_id = v_org
       and ra.employment_id = any(hr.employments_of(v_uid))
       and ra.is_active and ra.revoked_at is null
       and ra.effective_from <= current_date
       and (ra.effective_to is null or ra.effective_to >= current_date)
       and role.break_glass_allowed)
  then
    v_audit := hr._record_access_audit(
      p_organization_id => v_org, p_action => 'denied', p_target_token => p_token,
      p_purpose => coalesce(p_purpose,'(none given)'), p_basis => 'refused', p_granted => false,
      p_target_ids => ARRAY[p_id], p_sensitivity_tier => d.tier, p_is_break_glass => true,
      p_justification => p_justification,
      p_denial_reason => 'the caller holds no role with break_glass_allowed; a manager never can');
    return jsonb_build_object('granted', false, 'reason', 'no_break_glass_role', 'audit_id', v_audit);
  end if;

  -- ---- the justification floor, from the knob (D13: a missing knob raises)
  v_min := (hr._knob('hr.domain_wide','break_glass_justification_min_chars') #>> '{}')::integer;
  if p_justification is null or length(p_justification) < v_min then
    v_audit := hr._record_access_audit(
      p_organization_id => v_org, p_action => 'denied', p_target_token => p_token,
      p_purpose => coalesce(p_purpose,'(none given)'), p_basis => 'refused', p_granted => false,
      p_target_ids => ARRAY[p_id], p_sensitivity_tier => d.tier, p_is_break_glass => false,
      p_denial_reason => format('justification is shorter than the %s-character floor', v_min));
    return jsonb_build_object('granted', false, 'reason', 'justification_too_short',
      'detail', format('hr.domain_wide.break_glass_justification_min_chars is %s', v_min),
      'audit_id', v_audit);
  end if;

  -- ---- the purpose must come from the controlled dimension, not from prose
  if not exists (select 1 from platform.categories c
                  where c.dimension = 'hr_access_purpose' and c.slug = p_purpose
                    and c.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
                    and c.deleted_at is null) then
    v_audit := hr._record_access_audit(
      p_organization_id => v_org, p_action => 'denied', p_target_token => p_token,
      p_purpose => '(unregistered)', p_basis => 'refused', p_granted => false,
      p_target_ids => ARRAY[p_id], p_sensitivity_tier => d.tier,
      p_justification => p_justification,
      p_denial_reason => format('purpose %s is not in the hr_access_purpose dimension', p_purpose));
    return jsonb_build_object('granted', false, 'reason', 'unregistered_purpose', 'audit_id', v_audit);
  end if;

  -- ---- 🚨 TWO THINGS BREAK-GLASS CAN NEVER REACH (§4.3), and both are checked before any grant:
  --      an hr.incident where the caller is a party (§5's veto is absolute), and an individual
  --      hr.eeo_response (no such read path exists in any function). The MEDICAL note class is a
  --      third, from §3.1a — otherwise the merged table makes the medical wall a formality.
  v_bg_ok := d.allows_break_glass;
  if p_token = 'hr_restricted_note' then
    execute 'select note_kind from hr.restricted_note where id = $1' into v_note_kind using p_id;
    select * into nk from hr._note_kind_caps(v_note_kind);
    v_bg_ok := coalesce(nk.allows_break_glass, false);
  end if;

  v_verdict := hr._door_verdict(v_uid, p_token, p_id, false);
  if (v_verdict ->> 'basis') = 'subject_excluded' then
    v_audit := hr._record_access_audit(
      p_organization_id => v_org, p_action => 'denied', p_target_token => p_token,
      p_purpose => p_purpose, p_basis => 'refused', p_granted => false,
      p_target_ids => ARRAY[p_id], p_sensitivity_tier => d.tier, p_is_break_glass => true,
      p_justification => p_justification,
      p_denial_reason => 'SPEC-ACCESS §5: the subject-exclusion veto overrides break-glass, absolutely');
    return jsonb_build_object('granted', false, 'reason', 'subject_excluded', 'audit_id', v_audit);
  end if;

  if not v_bg_ok then
    v_audit := hr._record_access_audit(
      p_organization_id => v_org, p_action => 'denied', p_target_token => p_token,
      p_purpose => p_purpose, p_basis => 'refused', p_granted => false,
      p_target_ids => ARRAY[p_id], p_sensitivity_tier => d.tier, p_is_break_glass => true,
      p_justification => p_justification,
      p_denial_reason => coalesce(d.no_door_reason,
        format('break-glass is not permitted on %s%s', p_token,
               case when v_note_kind is null then '' else ' / ' || v_note_kind end)));
    return jsonb_build_object('granted', false, 'reason', 'break_glass_not_permitted',
                              'audit_id', v_audit);
  end if;

  -- ---- §4.3: write a REAL, time-boxed grant, so the person can actually do the work. A one-shot
  --      read that forces twelve more break-glass calls is over-tightening dressed as rigour.
  v_ttl := (hr._hr_knob('hr.access','break_glass_grant_ttl_minutes', v_org, null) #>> '{}')::integer;
  v_subject := nullif(v_verdict ->> 'subject_employment_id','')::uuid;

  perform hr.arm_write();
  -- THE ONE WRITER (T-32e): viewer for v_ttl minutes, raise-only; removed access is refused by name.
  -- Break-glass is the Confidential record's own audited door, not sharing (owner ruling 2026-09-28):
  -- it opens for its time even where a share was removed; the removal stays on record and returns
  -- when the time runs out.
  v_share := iam.share_with_person(p_token, p_id, v_uid, 'viewer', v_uid, true, 'hr_break_glass',
                                   now() + make_interval(mins => v_ttl), false, null);
  if not coalesce((v_share ->> 'success')::boolean, false) then
    raise exception 'Break-glass does not give back access that was removed from you: %', v_share ->> 'error'
      using errcode = '42501', hint = 'Ask an HR administrator of the organization to share it with you directly.';
  end if;
  v_perm := (v_share ->> 'permission_id')::uuid;

  insert into hr.derived_grant
    (organization_id, permission_id, subject_employment_id, grantee_user_id, resource_type,
     resource_id, permission_level, expires_at, reason, basis_kind, basis_id)
  values (v_org, v_perm, v_subject, v_uid, p_token, p_id, 'viewer',
          now() + make_interval(mins => v_ttl), 'break_glass', 'break_glass', p_id)
  on conflict (permission_id) do update
     set expires_at = excluded.expires_at, reason = 'break_glass', derived_at = now();

  v_audit := hr._record_access_audit(
    p_organization_id => v_org, p_action => 'read', p_target_token => p_token,
    p_purpose => p_purpose, p_basis => 'break_glass', p_granted => true,
    p_target_ids => ARRAY[p_id], p_row_count => 1, p_sensitivity_tier => d.tier,
    p_subject_employment_id => v_subject, p_justification => p_justification,
    p_is_break_glass => true);

  -- 🚨 THE NOTIFICATION AUDIENCE IS NOT DECIDED HERE. Per D24g, recipients come from the
  -- principal-governed alert-routing panel (SPEC-DOMAIN-WIDE / hr.alert_routing_rule). This lane
  -- declares the EVENT and its tier — hr.access.break_glass_used, tier `immediate` — and resolves
  -- the audience through hr.alert_recipients; the org owner + every hr_owner is the seeded default
  -- the panel starts from, never a hard-coded recipient list here.
  -- DD-137a — HR IS A CALLER OF THE PLATFORM DOOR, NOT A SIBLING OF IT. hr.access_audit stays
  -- HR's own domain ledger and keeps every row it has; the platform ledger gets the same act so
  -- that "who opened my data" is ONE list for a person, not one per module. And the SUBJECT is
  -- told — HR notified compliance and never told the person (VISIBILITY-BY-CLASS §3.5).
  declare v_plat_audit uuid; v_subject_user uuid; begin
    select e.login_user_id into v_subject_user from hr.employment em
      join hr.employee e on e.id = em.employee_id where em.id = v_subject;
    v_plat_audit := iam._record_access_audit(
      p_organization_id => v_org, p_action => 'read', p_target_token => p_token,
      p_data_class => case when d.tier = 'restricted' then 'private' else 'confidential' end,
      p_purpose => p_purpose, p_basis => 'emergency_door', p_granted => true,
      p_target_ids => ARRAY[p_id], p_row_count => 1, p_subject_user_id => v_subject_user,
      p_justification => p_justification, p_permission_id => v_perm,
      p_grant_expires_at => now() + make_interval(mins => v_ttl));
    perform iam._notify_door(v_org, 'platform.access.emergency_door_opened', v_subject_user,
      jsonb_build_object('token', p_token, 'target_id', p_id, 'opened_by', v_uid,
                         'purpose', p_purpose, 'justification', p_justification,
                         'expires_at', now() + make_interval(mins => v_ttl),
                         'audit_id', v_plat_audit),
      v_plat_audit, '/me/access-log', 'edoor:open:' || v_plat_audit::text);
  end;
  return jsonb_build_object(
    'granted', true, 'audit_id', v_audit, 'permission_id', v_perm,
    'expires_at', now() + make_interval(mins => v_ttl),
    'alert_event', 'hr.access.break_glass_used', 'alert_tier', 'immediate',
    'alert_recipients', (select coalesce(jsonb_agg(x), '[]'::jsonb)
                           from hr.alert_recipients(v_org, 'compliance',
                                'hr.access.break_glass_used', 'organization', null, 'urgent') x),
    'row', hr._project_row(p_token, v_schema, v_table, p_id));
end
$function$;


-- ════════════════════════════════════════════════════════════════════════════
-- 3. THE PERSON-ONLY REVOKE RETIRES INTO THE ONE REMOVE FUNCTION
-- ════════════════════════════════════════════════════════════════════════════
delete from platform.client_callable_door where schema_name = 'iam' and function_name = 'unshare_person';
drop function iam.unshare_person(uuid, uuid, boolean);
