-- chair-step: drops iam.share_with_person(6 args) and custom._share_write_person(5 args) only to re-create each with added defaulted parameters in this same file (callers resolve unchanged); no data is removed.
-- based-on: public.revoke_resource_access(text, uuid, uuid) a825b8214a5eeb1b720a288760b47f5fdfdc2471477195f227c4befc488ebe74
-- based-on: iam.fn_revoke_resource_permission(text, uuid, uuid, text) 58cb91e6e85a7151c02fb4f20e3d6456ce65589e839bbf35d14bca90133f40db
-- based-on: custom.share_revoke(uuid, uuid, text, uuid) 239a8123aac4702e471a91c52b653f86449fbd6a6a312e69319a70d7e8af84b3
-- based-on: communication.meet_remove_invitee(uuid, uuid) a9c5dc511a010f6cebd9ee4b93ca18d5b01d0f57891cdf6a0f880c5e92724ea9
-- based-on: custom.table_share_outside_accept(text) 50b32913b22e5678ba848c0fe55196c191c50a3f35db57031cc7a9d3ae0c0ef9
-- based-on: custom.portal_principal_bind(uuid, uuid, uuid) 385403160b2b74ad8763b9e42bd4f21d963283c652bf5a0e5b48cfca233dd3f0
-- based-on: communication._meet_grant(uuid, uuid, text, uuid, boolean) 09e90b484e383a265ed42d8b3437ac4eb5e576b97b46387279ada78941ed5911
-- based-on: public.access_request_decide(uuid, text, text, text) b9d7706e97089716cf88c778cfd8479b388a59018cd7c3db223fee2176fedf1c
-- based-on: public.dm_participant_sync_grant() 6e3287794d84f73646912778c3aba8cf5733ffeb3727ac795d4108b03b32ad23
-- based-on: workspace._sync_task_assignee_grant() c4155940296a564f227b9e1b0ccfead0fe3fcd03f9057421faec7e8f7c817413
-- based-on: hr._wf_grant_step(uuid) a259398e10abc0bf42109a3d46def7c440180deaf8ebab9b92d14dedd93f8029
-- based-on: hr._wf_revoke_step(uuid) 825a8eb9f18a267076c9d389490bd6595f23c94e0e49744d615b13d9c8919cdc
-- based-on: hr._reconcile_grants(text, uuid, date) 79712a0113066fdb9bfefd73dd0888b740de25015cf7d76444df59bc9abd0673
-- based-on: iam.emergency_door_open(text, uuid, text, text) 8239cf2feb1b6325efd5587cd985f8f9c1b75b514c744d03daf8f8821214de6c
-- based-on: iam.emergency_door_approve(uuid, text) 1e2314b6b5eee580f972923128659b1c1b93dae3765166dae820290cbb638a8e
-- based-on: public.hr_break_glass(text, uuid, text, text) 81b070ca207aac9c4c2efed230a1335b82daabd6fb9feb25f3d3cc52dc0fd6b9
-- based-on: iam.fn_grant_resource_permission(text, uuid, uuid, text, text, timestamp with time zone) b0895479786e7eed96e0959ec67a64cea7fa8eca33c06e4570a7bcadb30d8278
-- based-on: platform._cutover_carry_back(uuid, platform.cutover_seam_press, boolean, uuid, uuid, boolean) 94ea0610d99a8d83349ec2bf3b9991fa0f787c2d18ccf45d4a1b71285813625b
-- based-on: platform.kernel_equivalence_answers() 0b3ec03da2adeec74b38171d9c669b3f6cd7f9238dd2154c0dcc71fb5c0e8897
-- based-on: audit.user_delete_probe(text) 3324d7695a9a8f2c2aa6bdbfeb997802a4a2a765b36d4e18f9b431e0d0fc4014
-- based-on: iam.share_with_person(text, uuid, uuid, permission_level, uuid, boolean) b26ef2d59f35e323021f56311065f967c72cb09546f2c83b06ace4795fedbdc3
-- based-on: custom._share_write_person(uuid, uuid, uuid, permission_level, uuid) affc71a1d83cc25f8f4f3aebfdbe5ad9594868c98366854b0b8f0691308f1a7b
--
-- ACCESS LADDER T-32e — THE REVOCATION RULE, AND EVERY PERSON-SHARE WRITER THROUGH ONE WRITER.
--
-- Owner ruling (champion: Google Drive):
--   1. Removing a person's access ends it immediately. The grant row is ARCHIVED (kept for the
--      record), never deleted, and an archived grant never admits.
--   2. Automated or bulk sharing (group sharing, meeting invitations, access-request approval,
--      emergency doors, HR rules, record-store invitations and portals, cutover carries, any server
--      caller) never gives back a grant a person removed: it skips that person and says so.
--   3. Only a deliberate direct share of that person by someone allowed to share restores it.
--
-- How: an archived row always carries expires_at <= now() (trigger), so every reader refuses it
-- without touching the kernel; iam.unshare_person archives and records the remover in reviewed_by;
-- iam.share_with_person reads reviewed_by to tell REMOVED (by a person) from ENDED (by its basis);
-- the 14 functions that inserted person grants directly now call it, and the removals archive.
-- Guard: pnpm check:one-person-share-writer (live function bodies; ratchet at zero).

-- ════════════════════════════════════════════════════════════════════════════
-- 1. A REMOVED GRANT ENDS NOW — for every reader, whoever archived it
-- ════════════════════════════════════════════════════════════════════════════
-- Every reader of a person grant (the access kernel, the generated read policies, the list and
-- search functions) admits a row when `status <> 'rejected' and (expires_at is null or
-- expires_at > now())`. An archived row passed that test, so a removed person kept access. The
-- readers are many and another lane owns their bodies; the invariant is one: an archived grant
-- carries the moment it ended in expires_at, so no reader can admit it. The SHARE-PEOPLE-ONLY
-- archive (2026-09-25) already wrote its rows this way; this makes it true for every writer.
create or replace function iam._removed_grant_ends_now()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if new.status = 'archived' and (new.expires_at is null or new.expires_at > now()) then
    new.expires_at := now();
  end if;
  return new;
end;
$$;

comment on function iam._removed_grant_ends_now() is
  'Revocation rule (access ladder T-32e): an archived iam.permissions row always carries expires_at <= now(), so every reader that honours expiry refuses it. Removal is archive, never delete; the row stays as the record.';

create trigger _iam_removed_grant_ends_now
  before insert or update of status, expires_at on iam.permissions
  for each row execute function iam._removed_grant_ends_now();

-- The rows already archived keep their stamp; any that lack it get it (none today, measured).
update iam.permissions set expires_at = now()
 where status = 'archived' and (expires_at is null or expires_at > now());


-- ════════════════════════════════════════════════════════════════════════════
-- 2. THE ONE WRITER, TAUGHT THE REVOCATION RULE
-- ════════════════════════════════════════════════════════════════════════════
-- A person share is written only here. Who removed an archived grant is read from reviewed_by:
--   archived + reviewed_by set   → REMOVED by a person (owner/admin, or a host). Only a deliberate
--                                  share of that person by someone allowed to share gives it back:
--                                  p_restore_removed = true, which a share (p_basis null, authority
--                                  asked here) or a door that asked the same authority itself passes.
--                                  Every automated or bulk caller passes false, skips the person and
--                                  answers outcome = 'removed' with the sentence to show.
--   archived + reviewed_by empty → ENDED by its basis (task reassigned, left the conversation,
--                                  workflow step closed, HR rule no longer applies). The basis
--                                  coming back brings it back.
-- p_basis null   = a SHARE: the actor's authority is asked here (owner, or Admin on the thing).
-- p_basis 'name' = the calling rule already decided (the record store's door, an assignment, a
--                  participant, an approved request, an emergency door, an HR rule, a cutover
--                  carry, a fixture). Only a door that judged a deliberate share (record store
--                  share, ACL grant) passes p_restore_removed = true.
drop function if exists iam.share_with_person(text, uuid, uuid, public.permission_level, uuid, boolean);

create or replace function iam.share_with_person(
  p_resource_type text,
  p_resource_id uuid,
  p_target_user_id uuid,
  p_level public.permission_level,
  p_actor uuid,
  p_restore_removed boolean default true,
  p_basis text default null,
  p_expires_at timestamptz default null,
  p_exact boolean default false,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
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
  if (v_row.status = 'active')
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
  if v_row.status = 'archived' and p_restore_removed then
    update iam.permissions
       set status = 'active', permission_level = p_level, expires_at = p_expires_at,
           created_by = p_actor, granted_via = 'share', reviewed_by = null, reviewed_at = null
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
$$;

comment on function iam.share_with_person(text, uuid, uuid, public.permission_level, uuid, boolean, text, timestamptz, boolean, text) is
  'Access ladder T-32/T-32e: THE one writer of a person share (iam.permissions). p_basis null = a share: asks the actor''s authority (owner or Admin on the thing) and only raises. p_basis set = the calling rule decided (record store, assignment, participant, request, emergency door, HR rule, carry, fixture). A grant a person removed (archived, reviewed_by set) comes back only when p_restore_removed — a deliberate direct share by someone allowed to share; every automated or bulk caller passes false and gets outcome removed. Guard: pnpm check:one-person-share-writer.';

-- ════════════════════════════════════════════════════════════════════════════
-- 3. ITS REVOKE COUNTERPART — archive, never delete
-- ════════════════════════════════════════════════════════════════════════════
create or replace function iam.unshare_person(
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
  if v_row.id is null or v_row.granted_to_user_id is null then
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

comment on function iam.unshare_person(uuid, uuid, boolean) is
  'Access ladder T-32e: THE way a person share ends. Archives the row (kept for the record), stamps expires_at so no reader admits it, and records who removed it in reviewed_by when a person did (p_by_person) — which is what stops every automated or bulk writer giving it back. p_by_person false = the grant''s basis ended (reassigned, left, step closed).';

revoke all on function iam.share_with_person(text, uuid, uuid, public.permission_level, uuid, boolean, text, timestamptz, boolean, text) from public, anon, authenticated;
revoke all on function iam.unshare_person(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function iam._removed_grant_ends_now() from public, anon, authenticated;
-- Server callers (the service role, invoker-rights fixtures it runs) write through the one writer too.
grant execute on function iam.share_with_person(text, uuid, uuid, public.permission_level, uuid, boolean, text, timestamptz, boolean, text) to service_role;
grant execute on function iam.unshare_person(uuid, uuid, boolean) to service_role;

update platform.client_callable_door c
   set identity_args = pg_get_function_identity_arguments(p.oid),
       identity_argtypes = string_to_array(p.proargtypes::text, ' ')::oid[],
       declared_by = 'access_ladder_t32e_revocation_rule.sql'
  from pg_proc p
 where c.schema_name = 'iam' and c.function_name = 'share_with_person'
   and p.pronamespace = 'iam'::regnamespace and p.proname = 'share_with_person';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason,
   non_client_lane, signed_in_callers, anonymous_callers)
select 'iam', 'unshare_person', pg_get_function_identity_arguments(p.oid), string_to_array(p.proargtypes::text, ' ')::oid[],
       'access_ladder_t32e_revocation_rule.sql',
       'The one way a person share ends: archives one row by id. No authority of its own; every caller decided first.',
       'server_only: called only from definer doors (revoke_resource_access, fn_revoke_resource_permission, custom.share_revoke) and basis triggers (task assignee, DM participant, HR workflow and reconcile); no client ever calls it.',
       false, false
  from pg_proc p
 where p.pronamespace = 'iam'::regnamespace and p.proname = 'unshare_person'
   and not exists (select 1 from platform.client_callable_door c
                    where c.schema_name = 'iam' and c.function_name = 'unshare_person');


-- ════════════════════════════════════════════════════════════════════════════
-- 4. THE SHARE DIALOG'S REVOKE, AND EVERY OTHER REMOVAL, ARCHIVE
-- ════════════════════════════════════════════════════════════════════════════

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
  RETURN iam.unshare_person(
    (SELECT p.id FROM iam.permissions p
      WHERE p.resource_type = v_resolved.resource_type AND p.resource_id = p_resource_id
        AND p.granted_to_user_id = p_target_user_id),
    v_uid, true);
END;
$function$;

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
    delete from iam.permissions
    where resource_type = p_resource_type
      and resource_id = p_resource_id
      and granted_to_organization_id = p_grantee_id;
    get diagnostics v_deleted = row_count;
    return v_deleted > 0;
  end if;

  -- A person's grant is archived by the one revoke (T-32e), never deleted.
  return coalesce((iam.unshare_person(
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
    select count(*) filter (where coalesce((iam.unshare_person(p.id, (select auth.uid()), true) ->> 'outcome') = 'removed', false))
      into v_gone
      from iam.permissions p
     where p.resource_type = 'record' and p.resource_id = p_subject_id
       and p.granted_to_user_id = p_principal_id and p.status <> 'archived';
  else
    delete from iam.permissions p
     where p.resource_type = 'record' and p.resource_id = p_subject_id
       and ((v_kind = 'organization' and p.granted_to_organization_id = p_principal_id)
         or (v_kind = 'everyone'     and p.is_public));
    get diagnostics v_gone = row_count;
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
    perform iam.unshare_person(p.id, v_actor, true)
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


-- ════════════════════════════════════════════════════════════════════════════
-- 5. EVERY OTHER PERSON-SHARE WRITER, THROUGH THE ONE WRITER
-- ════════════════════════════════════════════════════════════════════════════

drop function if exists custom._share_write_person(uuid, uuid, uuid, public.permission_level, uuid);

CREATE OR REPLACE FUNCTION custom._share_write_person(p_organization_id uuid, p_subject_id uuid, p_user_id uuid, p_level permission_level, p_by uuid DEFAULT NULL::uuid, p_restore_removed boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row  custom.record;
  v_word text;
  v_perm uuid;
  v_res  jsonb;
begin
  -- 🚨 THIS FUNCTION DECIDES NOTHING ABOUT THE CALLER, ON PURPOSE, AND HOLDS NO GRANT TO
  -- `authenticated`. Its three callers each hold a DIFFERENT authority — a caller at admin on
  -- the record, an invitation token an admin minted, and a portal bind ladder — and the one
  -- thing they share is the row they end up writing. Folding the authority in here would mean
  -- one shape for three authorities, which is how the portal door came to demand a level the
  -- arriving person could never hold. Its registry row in `platform.client_callable_door`
  -- carries this same sentence as a `non_client_lane`.
  if p_user_id is null then
    raise exception 'A share has to say WHO it is shared with.' using errcode = '22004';
  end if;
  if p_level is null then
    raise exception 'A share has to say what the other person may do with it.'
      using errcode = '22004',
            hint = 'Pass one of viewer, commenter, editor, admin — call custom.share_levels() for what each one means.';
  end if;

  select r.* into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_subject_id;
  if not found then
    raise exception 'There is no such record in this organization, so it cannot be shared.'
      using errcode = '02000';
  end if;
  v_word := case when v_row.table_id = custom.table_kernel_id() then 'table' else 'record' end;

  if p_user_id = v_row.created_by then
    raise exception 'That person already owns this %, which is the rung above every level you could grant.', v_word
      using errcode = '23505', hint = 'VIS-25: Owner is the top rung and is held on the record itself.';
  end if;

  -- THE ONE WRITER (T-32e). The store's door decided the authority; the level is set exactly.
  -- A grant a person removed comes back only on a deliberate share (p_restore_removed): an
  -- invitation accepted later or a portal bind never gives it back, and says so.
  v_res := iam.share_with_person('record', p_subject_id, p_user_id, p_level,
                                 coalesce(p_by, custom.query_principal()), p_restore_removed, 'record_store',
                                 null, true, null);
  if not coalesce((v_res ->> 'success')::boolean, false) then
    raise exception '%', v_res ->> 'error'
      using errcode = '42501', hint = 'Share it with them directly, from the record''s Share, to give it back.';
  end if;
  v_perm := (v_res ->> 'permission_id')::uuid;

  -- The history row is already written: `zzz_history_grant_capture` fired inside the same
  -- statement. Nothing here files a second one.
  return v_perm;
end $function$;

revoke all on function custom._share_write_person(uuid, uuid, uuid, public.permission_level, uuid, boolean) from public, anon, authenticated;
update platform.client_callable_door c
   set identity_args = pg_get_function_identity_arguments(p.oid),
       identity_argtypes = string_to_array(p.proargtypes::text, ' ')::oid[]
  from pg_proc p
 where c.schema_name = 'custom' and c.function_name = '_share_write_person'
   and p.pronamespace = 'custom'::regnamespace and p.proname = '_share_write_person';

CREATE OR REPLACE FUNCTION custom.table_share_outside_accept(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_inv   iam.invitations;
  v_me    uuid := custom.query_principal();
  v_mail  text;
  v_level public.permission_level;
  v_perm  uuid;
  v_name  text;
  v_org   text;
begin
  if v_me is null then
    raise exception 'Sign in first, and then this invitation opens the table it was sent for.'
      using errcode = '42501';
  end if;
  select lower(u.email) into v_mail from auth.users u where u.id = v_me;

  select * into v_inv from iam.invitations i
   where i.token = p_token
     and i.target_type = 'custom_table'
     and i.deleted_at is null
     and i.status = 'pending'
     and (i.expires_at is null or i.expires_at > now())
     and (i.invited_user_id = v_me or lower(i.email) = v_mail);
  if not found then
    -- ONE SENTENCE for a token that never existed, one that has been used, one that has
    -- run out and one addressed to somebody else. A link must not be usable to learn
    -- that something is there.
    raise exception 'This invitation cannot be used: it has been withdrawn, already used, run out, or was sent to a different email address than the one you are signed in with.'
      using errcode = '02000',
            hint = 'Ask whoever sent it to send a fresh one, to the address you sign in with.';
  end if;

  v_level := coalesce(nullif(v_inv.metadata ->> 'level', ''), 'viewer')::public.permission_level;
  select coalesce(nullif(r.data ->> 'name', ''), 'that table') into v_name
    from custom.record r where r.organization_id = v_inv.organization_id and r.id = v_inv.target_id;
  select o.name into v_org from iam.organizations o where o.id = v_inv.organization_id;

  -- THE LANE STILL HAS TO BE OPEN AT THIS MOMENT. An organization that closed its
  -- outside door after sending an invitation has closed it, and the link says so
  -- instead of quietly writing a grant that admits nobody.
  if not coalesce((platform.knob_resolve('custom', 'external_principal_enabled', v_inv.organization_id) #>> '{}')::boolean, false) then
    raise exception '% has turned off sharing with people outside it, so this invitation cannot be used.',
      coalesce(v_org, 'That organization')
      using errcode = '42501',
            hint = 'Ask whoever invited you — an owner or an administrator of that organization can turn it back on.';
  end if;

  -- THE GRANT. The same row, in the same table, at the same rung, that
  -- `custom.share_grant` writes for a colleague — because there is ONE ladder and this
  -- is not a second one. It is not written THROUGH `share_grant` for one reason:
  -- `share_grant` judges the CALLER at Admin on the subject, and the caller here is the
  -- person being let in. The act was already judged when the invitation was made.
  --
  -- PORTAL-BIND, 2026-09-21: it used to hand-write the insert/update here, which made it a
  -- SECOND implementation of the row `share_grant` writes — and the portal's own bind door,
  -- which has the same problem, had neither and so could not complete at all. All three now
  -- go through `custom._share_write_person`: one writer, three authorities, each decided by
  -- the door that holds it. `v_inv.created_by` is carried as the author of the grant because
  -- the person who made the invitation is who gave this access, not the person accepting it.
  v_perm := custom._share_write_person(v_inv.organization_id, v_inv.target_id, v_me,
                                       v_level, v_inv.created_by, false);

  update iam.invitations
     set status = 'accepted', accepted_at = now(), invited_user_id = v_me,
         updated_by = v_me, updated_at = now()
   where id = v_inv.id;

  return jsonb_build_object(
    'accepted', true,
    'organization_id', v_inv.organization_id,
    'organization', v_org,
    'table_id', v_inv.target_id,
    'table', v_name,
    'level', v_level::text,
    'level_label', iam.level_label('table', v_level),
    'permission_id', v_perm,
    'say', format('%s shared %s with you as a %s. That table is all you can see here — nothing else of %s is open to you.',
                  coalesce(v_org, 'An organization'), v_name, v_level::text,
                  coalesce(v_org, 'theirs')));
end;
$function$;

CREATE OR REPLACE FUNCTION custom.portal_principal_bind(p_organization_id uuid, p_principal_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_pp    custom.portal_principal;
  v_p     custom.portal;
  v_lv    public.permission_level;
  v_email text;
  v_who   uuid := custom.query_principal();
begin
  perform custom.assert_store_door(p_organization_id, 'custom.portal_principal_bind');
  if p_user_id is null then
    raise exception 'Binding a portal principal needs the identity the platform''s auth gave them.'
      using errcode = '22004';
  end if;

  select * into v_pp from custom.portal_principal
   where id = p_principal_id and organization_id = p_organization_id;
  if not found then
    raise exception 'There is no such portal principal in this organization.' using errcode = '02000';
  end if;
  select * into v_p from custom.portal where id = v_pp.portal_id;

  -- AN INVITATION THAT IS ALREADY SOMEBODY'S STAYS THEIRS. Re-pointing a live portal login
  -- at a different person is a takeover, not a bind, and it belongs to no arm below.
  if v_pp.user_id is not null and v_pp.user_id <> p_user_id then
    raise exception 'That invitation already belongs to somebody else, so it cannot be bound again.'
      using errcode = '42501',
            hint = 'Withdraw it and invite the new person, so the customer who holds it now keeps their own record.';
  end if;

  -- WHO MAY BIND. The organization admin who invited them, the server lane that owns the
  -- store, or the invited person THEMSELF — and "themself" is settled by the address the
  -- invitation was sent to, read from the platform's own auth, never from an argument.
  if not custom.query_is_store_owner() then
    select u.email into v_email from auth.users u where u.id = p_user_id;
    if v_who is not null
       and v_who = p_user_id
       and v_email is not null
       and lower(btrim(v_email)) = lower(btrim(coalesce(v_pp.email, '')))
    then
      null;  -- the outsider arriving on their own link, at their own address
    else
      perform custom.assert_client_may_change(p_organization_id, v_p.client_table_id,
                'custom.portal_principal_bind', 'admin'::public.permission_level, 'table');
    end if;
  end if;

  if not v_pp.is_active or not v_p.is_active then
    raise exception 'That invitation has been withdrawn, so it cannot be used to sign in.'
      using errcode = '42501';
  end if;

  update custom.portal_principal
     set user_id = p_user_id, bound_at = coalesce(bound_at, now())
   where id = v_pp.id;

  -- WHO DID IT. `iam._org_audit` stamps `actor_user_id` from `auth.uid()` inside itself, so
  -- the row names the seat that actually called this door.
  perform iam._org_audit(p_organization_id, p_user_id, 'portal_principal_bind',
            jsonb_build_object('principal_id', v_pp.id, 'portal_id', v_p.id, 'email', v_pp.email));

  -- THE ONE GRANT, WRITTEN AS THE AUTHORITY THIS DOOR ALREADY ESTABLISHED. This is the only
  -- access a portal ever writes: the outsider holds their own client record, and the
  -- association the portal declared carries every record that names it. Nothing here touches
  -- a Job or an Invoice, and nothing has to be re-run when one is written.
  --
  -- 🚨 PORTAL-BIND, 2026-09-21 — WHY THIS IS NO LONGER `custom.share_grant`. It was, and that
  -- is why the legitimate outsider could never finish: `share_grant` judges the CALLER at
  -- `admin` on the record being shared, and the customer arriving on her own link holds
  -- nothing on her client record — that is the whole point of her arriving. So the honest
  -- self-bind arm above was reachable, correct, and then died one call later, every time.
  -- (Lane GUARD-STAMPS measured it and named it as a product limitation for whoever owns this
  -- flow.) The authority for this grant was settled THIRTY LINES ABOVE, in this same
  -- transaction: the caller is the store owner, or an admin of the portal's client Table, or
  -- the invited person proved by the address the platform's own auth holds for them. Asking
  -- the arriving person for a level they can never hold was never a check — it was a bug that
  -- happened to look like one.
  --
  -- `invited_by` is carried as the author of the grant: the organization admin who invited
  -- this customer is who gave her this access, not the customer who followed the link.
  select max(pt.conveys_max) into v_lv from custom.portal_table pt where pt.portal_id = v_p.id;
  perform custom._share_write_person(p_organization_id, v_pp.client_record_id, p_user_id,
                                     coalesce(v_lv, 'viewer'::public.permission_level),
                                     coalesce(v_pp.invited_by, v_p.created_by), false);

  return jsonb_build_object(
    'bound', true,
    'principal_id', v_pp.id,
    'user_id', p_user_id,
    'client_record_id', v_pp.client_record_id,
    'level', coalesce(v_lv, 'viewer'::public.permission_level)::text,
    'say', format('%s now holds their own client record at %s, and every record that names it reaches them through it.',
                  v_pp.email, coalesce(v_lv, 'viewer'::public.permission_level)::text));
end $function$;

CREATE OR REPLACE FUNCTION communication._meet_grant(p_meeting_id uuid, p_user_id uuid, p_level text, p_actor uuid, p_force boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_res jsonb;
begin
  -- THE ONE WRITER (T-32e). An invitation never gives back access a host removed: it says so.
  v_res := iam.share_with_person('meet_meeting', p_meeting_id, p_user_id, p_level::public.permission_level,
                                 p_actor, false, 'meeting_invitation', null, p_force, null);
  if not coalesce((v_res ->> 'success')::boolean, false) then
    raise exception '% was removed from this meeting earlier, so inviting them again does not give it back.',
      coalesce(iam._person_name(p_user_id), 'This person')
      using errcode = '42501',
            hint = 'Share the meeting with them directly (Share, then add the person) to give it back.';
  end if;
end;
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
      -- THE ONE WRITER (T-32e). Approving a request never gives back access someone removed.
      v_res := iam.share_with_person(v_req.resource_type, v_req.resource_id, v_req.created_by, v_level,
                                     v_uid, false, 'access_request', null, true, null);
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
    PERFORM iam.unshare_person(p.id, NULL, false) FROM iam.permissions p
     WHERE p.resource_type='dm_conversation' AND p.resource_id=OLD.conversation_id
       AND p.granted_to_user_id=OLD.user_id;
    RETURN OLD;
  END IF;

  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.deleted_at IS NOT NULL THEN
    -- participant left/removed -> the grant's basis ended: archived (T-32e), never deleted
    PERFORM iam.unshare_person(p.id, NULL, false) FROM iam.permissions p
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
    PERFORM iam.unshare_person(p.id, NULL, false) FROM iam.permissions p
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

CREATE OR REPLACE FUNCTION hr._wf_grant_step(p_step uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'hr', 'public'
AS $function$
declare st hr.workflow_step%rowtype; u uuid; v_n integer := 0; v_res jsonb;
begin
  select * into st from hr.workflow_step where id = p_step;
  foreach u in array st.resolved_user_ids loop
    -- through the one writer (T-32e); a person whose access was removed is skipped and said so.
    v_res := iam.share_with_person('hr_workflow_instance', st.workflow_instance_id, u, 'editor'::permission_level,
                                   null, false, 'hr_workflow_step', null, true, 'auto:wf_step:' || p_step::text);
    if coalesce((v_res ->> 'success')::boolean, false) then
      update iam.permissions set review_note = 'auto:wf_step:' || p_step::text
       where id = (v_res ->> 'permission_id')::uuid and review_note is distinct from 'auto:wf_step:' || p_step::text;
      v_n := v_n + 1;
    else
      insert into ops.system_error (kind, error_text, user_id, source_app, source_feature, context)
      values ('removed_access_not_restored',
              format('A workflow step did not give access back to a person whose access was removed: %s', v_res ->> 'error'),
              u, 'database', 'hr_workflow',
              jsonb_build_object('step_id', p_step, 'workflow_instance_id', st.workflow_instance_id,
                                 'remedy', 'Share the workflow with them directly to give it back, or reassign the step.'));
    end if;
  end loop;
  return v_n;
end $function$;

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
    perform iam.unshare_person(p.id, null, false) from iam.permissions p
     where p.resource_type = 'hr_workflow_instance' and p.resource_id = st.workflow_instance_id
       and p.granted_to_user_id = u and p.status <> 'archived'
       and p.review_note like 'auto:wf_step:%';
    v_n := v_n + 1;
  end loop;
  return v_n;
end $function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason,
   non_client_lane, signed_in_callers, anonymous_callers)
select 'hr', p.proname, pg_get_function_identity_arguments(p.oid), string_to_array(p.proargtypes::text, ' ')::oid[],
       'access_ladder_t32e_revocation_rule.sql',
       'p_step is an hr.workflow_step id read by the HR workflow engine; the people it names were resolved by that engine, never by a caller.',
       'server_only: called only by the HR workflow engine (hr.wf_activate_step, wf_reassign_step, wf_escalate, _wf_close_step, _wf_close_instance, _wf_target_changed); no client ever calls it.',
       false, false
  from pg_proc p
 where p.pronamespace = 'hr'::regnamespace and p.proname in ('_wf_grant_step', '_wf_revoke_step')
   and not exists (select 1 from platform.client_callable_door c
                    where c.schema_name = 'hr' and c.function_name = p.proname);

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
    if exists (select 1 from iam.permissions p where p.id = d.permission_id and p.granted_to_user_id is not null) then
      -- a person's grant: its basis ended — archived by the one revoke (T-32e); the mapping stays
      -- so the grant is recognised as HR's if the rule applies again. Already-ended rows are not
      -- counted, so the second run still performs zero writes.
      if (iam.unshare_person(d.permission_id, null, false) ->> 'outcome') = 'removed' then
        v_del := v_del + 1;
      end if;
    else
      -- deleting the permission cascades the mapping (FK ON DELETE CASCADE)
      delete from iam.permissions where id = d.permission_id;
      v_del := v_del + 1;
    end if;
  end loop;

  drop table if exists _hr_desired;

  return jsonb_build_object('scope', p_scope_kind, 'id', p_scope_id, 'as_of', p_at,
                            'inserted', v_ins, 'updated', v_upd, 'deleted', v_del,
                            'unchanged', v_same, 'not_given', v_not_given);
end
$function$;

CREATE OR REPLACE FUNCTION iam.emergency_door_open(p_token text, p_id uuid, p_purpose text, p_justification text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'iam', 'platform', 'communication', 'hr', 'public'
AS $function$
declare
  v_share jsonb;
  v_uid uuid := auth.uid();
  v_class text; v_t record; v_min integer; v_ttl integer; v_audit uuid; v_perm uuid;
  v_req uuid; v_is_admin boolean; v_is_owner boolean; v_expires timestamptz; v_rec record;
begin
  if v_uid is null then
    raise exception 'emergency_door_open: no authenticated caller' using errcode = '42501';
  end if;

  if exists (select 1 from hr._door_spec(p_token)) then
    return public.hr_break_glass(p_token, p_id, p_purpose, p_justification);
  end if;

  v_class := iam.emergency_door_class(p_token);
  select * into v_t from iam._door_target(p_token, p_id);

  if v_t.o_schema is null then
    raise exception 'emergency_door_open: % is not a registered entity token, so there is no row for this door to open. Register it in platform.entity_types first.', p_token
      using errcode = '22023';
  end if;
  if v_t.o_org is null then
    perform platform.refuse_not_found(format('emergency_door_open: no %s row with id %s', p_token, p_id));
  end if;

  select bool_or(om.role in ('owner','admin')), bool_or(om.role = 'owner')
    into v_is_admin, v_is_owner
    from iam.organization_member om
   where om.user_id = v_uid and om.organization_id = v_t.o_org;
  v_is_admin := coalesce(v_is_admin, false);
  v_is_owner := coalesce(v_is_owner, false);

  if v_class is null then
    v_audit := iam._record_access_audit(
      v_t.o_org, 'denied', p_token, '(unclassified)', coalesce(p_purpose,'(none given)'), 'refused',
      false, ARRAY[p_id], null, v_t.o_subject, p_justification,
      format('%s has no data class yet, so this door cannot know how strictly to open it. Classify the token in platform.entity_types before asking for emergency access.', p_token));
    return jsonb_build_object('granted', false, 'reason', 'unclassified_token',
      'message', format('%s has no data class yet. Nobody can open it in an emergency until someone says how private it is.', p_token),
      'audit_id', v_audit);
  end if;

  if v_class not in ('private', 'confidential') then
    v_audit := iam._record_access_audit(
      v_t.o_org, 'denied', p_token, v_class, coalesce(p_purpose,'(none given)'), 'refused',
      false, ARRAY[p_id], null, v_t.o_subject, p_justification,
      format('%s is %s-class data, which is reached by ordinary access rather than by an emergency door.', p_token, v_class));
    return jsonb_build_object('granted', false, 'reason', 'no_door_needed',
      'message', format('%s is %s data. Ask for ordinary access to it — this door is for private data only.', p_token, v_class),
      'audit_id', v_audit);
  end if;

  if not v_is_admin then
    v_audit := iam._record_access_audit(
      v_t.o_org, 'denied', p_token, v_class, coalesce(p_purpose,'(none given)'), 'refused',
      false, ARRAY[p_id], null, v_t.o_subject, p_justification,
      'the caller is not an owner or admin of the organization that owns this row');
    return jsonb_build_object('granted', false, 'reason', 'not_an_org_admin',
      'message', 'Only an owner or admin of the organization that owns this data can open the emergency door on it.',
      'audit_id', v_audit);
  end if;

  v_min := iam._door_min_chars(v_t.o_org);
  if p_justification is null or length(btrim(p_justification)) < v_min then
    v_audit := iam._record_access_audit(
      v_t.o_org, 'denied', p_token, v_class, coalesce(p_purpose,'(none given)'), 'refused',
      false, ARRAY[p_id], null, v_t.o_subject, p_justification,
      format('justification is shorter than the %s-character floor', v_min));
    return jsonb_build_object('granted', false, 'reason', 'justification_too_short',
      'message', format('Say why, in at least %s characters. This sentence goes to the person whose data you are opening.', v_min),
      'audit_id', v_audit);
  end if;

  if not exists (select 1 from platform.categories cat
                  where cat.dimension = 'access_purpose' and cat.slug = p_purpose
                    and cat.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
                    and cat.deleted_at is null) then
    v_audit := iam._record_access_audit(
      v_t.o_org, 'denied', p_token, v_class, '(unregistered)', 'refused',
      false, ARRAY[p_id], null, v_t.o_subject, p_justification,
      format('purpose %s is not in the access_purpose dimension', coalesce(p_purpose,'(null)')));
    return jsonb_build_object('granted', false, 'reason', 'unregistered_purpose',
      'message', 'Pick a reason from the list. A typed reason cannot be reported on, so it is not accepted.',
      'audit_id', v_audit);
  end if;

  if v_t.o_subject = v_uid then
    return jsonb_build_object('granted', false, 'reason', 'self',
      'message', 'This is your own data. You can already read it.');
  end if;

  if not exists (select 1 from platform.shareable_resource_registry srr
                  where srr.is_active and srr.resource_type = p_token) then
    v_audit := iam._record_access_audit(
      v_t.o_org, 'denied', p_token, v_class, p_purpose, 'refused', false, ARRAY[p_id], null,
      v_t.o_subject, p_justification,
      format('%s is not a registered sharing token, so no grant can be written for it', p_token));
    return jsonb_build_object('granted', false, 'reason', 'token_not_grantable',
      'message', format('%s cannot carry a grant, so the emergency door has nothing to open. Register it as a shareable resource first.', p_token),
      'audit_id', v_audit);
  end if;

  v_ttl := iam._door_ttl_minutes(v_t.o_org);

  if v_class = 'private' then
    insert into iam.emergency_door_request
      (organization_id, target_token, target_id, subject_user_id, data_class, purpose,
       justification, requested_by, status, request_expires_at, created_by, visibility)
    values (v_t.o_org, p_token, p_id, v_t.o_subject, v_class, p_purpose, p_justification, v_uid,
            'pending', now() + interval '24 hours', v_uid, 'personal'::platform.visibility)
    returning id into v_req;

    v_audit := iam._record_access_audit(
      v_t.o_org, 'requested', p_token, v_class, p_purpose, 'requested', false, ARRAY[p_id], null,
      v_t.o_subject, p_justification, null, v_req);

    perform iam._notify_door(v_t.o_org, 'platform.access.emergency_door_requested', v_t.o_subject,
      jsonb_build_object('token', p_token, 'target_id', p_id, 'requested_by', v_uid,
                         'purpose', p_purpose, 'justification', p_justification,
                         'request_id', v_req, 'data_class', v_class),
      v_req, '/me/access-log', 'edoor:req:' || v_req::text || ':' || coalesce(v_t.o_subject::text,'-'));

    for v_rec in select om.user_id from iam.organization_member om
                  where om.organization_id = v_t.o_org and om.role = 'owner' and om.user_id <> v_uid loop
      perform iam._notify_door(v_t.o_org, 'platform.access.emergency_door_approval_needed', v_rec.user_id,
        jsonb_build_object('token', p_token, 'target_id', p_id, 'requested_by', v_uid,
                           'purpose', p_purpose, 'justification', p_justification,
                           'request_id', v_req, 'subject_user_id', v_t.o_subject),
        v_req, '/organizations/emergency-access', 'edoor:appr:' || v_req::text || ':' || v_rec.user_id::text);
    end loop;

    return jsonb_build_object('granted', false, 'reason', 'awaiting_approval', 'request_id', v_req,
      'audit_id', v_audit, 'data_class', v_class,
      'message', 'This is private data, so one person cannot open it. The organization''s owner has been asked to approve, and the person whose data it is has been told you asked.');
  end if;

  v_expires := now() + make_interval(mins => v_ttl);
  perform set_config('iam.emergency_door', 'on', true);
  -- THE ONE WRITER (T-32e): viewer until v_expires, raise-only (a standing share is never cut
  -- short). Access someone removed is not given back through the door; it refuses by name.
  v_share := iam.share_with_person(p_token, p_id, v_uid, 'viewer', v_uid, false, 'emergency_door',
                                   v_expires, false, null);
  if not coalesce((v_share ->> 'success')::boolean, false) then
    raise exception 'The emergency door does not give back access that was removed from this person: %', v_share ->> 'error'
      using errcode = '42501', hint = 'Ask the owner, or an admin of the organization, to share it with them directly.';
  end if;
  v_perm := (v_share ->> 'permission_id')::uuid;

  v_audit := iam._record_access_audit(
    v_t.o_org, 'read', p_token, v_class, p_purpose, 'emergency_door', true, ARRAY[p_id], 1,
    v_t.o_subject, p_justification, null, null, v_perm, v_expires);

  perform iam._notify_door(v_t.o_org, 'platform.access.emergency_door_opened', v_t.o_subject,
    jsonb_build_object('token', p_token, 'target_id', p_id, 'opened_by', v_uid,
                       'purpose', p_purpose, 'justification', p_justification,
                       'expires_at', v_expires, 'data_class', v_class, 'audit_id', v_audit),
    v_audit, '/me/access-log', 'edoor:open:' || v_audit::text || ':' || coalesce(v_t.o_subject::text,'-'));

  return jsonb_build_object('granted', true, 'audit_id', v_audit, 'permission_id', v_perm,
    'permission_level', 'viewer', 'expires_at', v_expires, 'data_class', v_class,
    'alert_event', 'platform.access.emergency_door_opened', 'alert_tier', 'immediate',
    'message', format('Opened, read-only, until %s. The person whose data this is has been told who you are and why.',
                      to_char(v_expires, 'HH24:MI')));
end $function$;

CREATE OR REPLACE FUNCTION iam.emergency_door_approve(p_request_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'iam', 'platform', 'communication', 'public'
AS $function$
declare
  v_share jsonb;
  v_uid uuid := auth.uid();
  q iam.emergency_door_request%rowtype;
  v_t record; v_class text; v_entity_schema text; v_entity_table text;
  v_requester_role text; v_approver_role text;
  v_ttl integer; v_perm uuid; v_audit uuid; v_expires timestamptz;
begin
  if v_uid is null then
    raise exception 'emergency_door_approve: no authenticated caller' using errcode = '42501';
  end if;

  -- The lock is the claim. A second decider waits, then observes the completed status and emits
  -- no second permission/audit/notification.
  select * into q
    from iam.emergency_door_request
   where id = p_request_id
   for update;
  if not found then
    perform platform.refuse_not_found(format('emergency_door_approve: no request %s', p_request_id));
  end if;

  if q.status <> 'pending' then
    return jsonb_build_object('granted', false, 'reason', 'not_pending',
      'message', format('This request was already %s.', q.status));
  end if;

  -- An elapsed request is no longer pending work. It transitions once under the claim, without
  -- creating a grant, an access audit, or a subject notification for an obsolete request.
  if q.request_expires_at <= now() then
    update iam.emergency_door_request
       set status = 'expired', updated_at = now()
     where id = q.id and status = 'pending';
    return jsonb_build_object('granted', false, 'reason', 'request_expired',
      'message', 'This request has lapsed. If the emergency is still live, ask again.');
  end if;

  -- Hold the entity-type row before resolving class/table. Reclassification or a table remap now
  -- waits until this decision commits.
  select et.schema_name, et.table_name into v_entity_schema, v_entity_table
    from platform.entity_types et
   where et.token = q.target_token
   for share;
  if not found then
    return jsonb_build_object('granted', false, 'reason', 'stale_request',
      'message', 'This request no longer matches a registered record, so it cannot be approved. If access is still needed, open a new request.');
  end if;

  -- `_door_target_lock` locks the actual row using the entity mapping now held above. Resolve the
  -- canonical facts only AFTER the row lock: a concurrent update before the lock is observed, and
  -- one after it waits for this transaction.
  if not iam._door_target_lock(q.target_token, q.target_id) then
    return jsonb_build_object('granted', false, 'reason', 'stale_request',
      'message', 'This request no longer matches a current record, so it cannot be approved. If access is still needed, open a new request.');
  end if;
  v_class := iam.emergency_door_class(q.target_token);
  select * into v_t from iam._door_target(q.target_token, q.target_id);
  if v_t.o_org is null
     or v_t.o_org is distinct from q.organization_id
     or v_t.o_subject is distinct from q.subject_user_id
     or v_class is distinct from q.data_class
     or v_class is distinct from 'private' then
    return jsonb_build_object('granted', false, 'reason', 'stale_request',
      'message', 'This request no longer matches the current record, so it cannot be approved. If access is still needed, open a new request.');
  end if;

  -- The eventual grantee must still be a current organization admin/owner — the same standing
  -- that was required to ask for the private door in the first place. FOR SHARE prevents removal
  -- or a role change between this decision and the grant.
  select om.role into v_requester_role
    from iam.organization_member om
   where om.user_id = q.requested_by and om.organization_id = v_t.o_org
   for share;
  if not found or coalesce(v_requester_role::text, 'none') not in ('owner', 'admin') then
    return jsonb_build_object('granted', false, 'reason', 'requester_no_longer_eligible',
      'message', 'The requester no longer has the organization standing required for this emergency grant, so it cannot be approved.');
  end if;

  select om.role into v_approver_role
    from iam.organization_member om
   where om.user_id = v_uid and om.organization_id = v_t.o_org
   for share;

  if not found or coalesce(v_approver_role::text, 'none') <> 'owner' then
    v_audit := iam._record_access_audit(
      v_t.o_org, 'denied', q.target_token, v_class, q.purpose, 'refused', false,
      ARRAY[q.target_id], null, v_t.o_subject, q.justification,
      'only an organization OWNER can approve a private-class emergency request', q.id,
      null, null, true, null, q.requested_by);
    perform iam._notify_door(v_t.o_org, 'platform.access.emergency_door_denied',
      v_t.o_subject,
      jsonb_build_object('token', q.target_token, 'target_id', q.target_id,
                         'requested_by', q.requested_by, 'denied_by', v_uid,
                         'purpose', q.purpose, 'note', 'the approver was not an organization owner',
                         'audit_id', v_audit),
      v_audit, '/me/access-log', 'edoor:deny:' || v_audit::text);
    return jsonb_build_object('granted', false, 'reason', 'not_an_org_owner',
      'message', 'Only an owner of this organization can approve emergency access to private data.',
      'audit_id', v_audit);
  end if;

  if q.requested_by = v_uid then
    v_audit := iam._record_access_audit(
      v_t.o_org, 'denied', q.target_token, v_class, q.purpose, 'refused', false,
      ARRAY[q.target_id], null, v_t.o_subject, q.justification,
      'the person who asked cannot also be the person who approves', q.id,
      null, null, true, null, q.requested_by);
    perform iam._notify_door(v_t.o_org, 'platform.access.emergency_door_denied',
      v_t.o_subject,
      jsonb_build_object('token', q.target_token, 'target_id', q.target_id,
                         'requested_by', q.requested_by, 'denied_by', v_uid,
                         'purpose', q.purpose,
                         'note', 'the person who asked tried to approve their own request',
                         'audit_id', v_audit),
      v_audit, '/me/access-log', 'edoor:deny:' || v_audit::text);
    return jsonb_build_object('granted', false, 'reason', 'same_person',
      'message', 'You asked for this access, so you cannot also approve it. Another owner has to.',
      'audit_id', v_audit);
  end if;

  v_ttl := iam._door_ttl_minutes(v_t.o_org);
  v_expires := now() + make_interval(mins => v_ttl);

  perform set_config('iam.emergency_door', 'on', true);
  -- THE ONE WRITER (T-32e): viewer until v_expires, raise-only (a standing share is never cut
  -- short). Access someone removed is not given back through the door; it refuses by name.
  v_share := iam.share_with_person(q.target_token, q.target_id, q.requested_by, 'viewer', v_uid, false, 'emergency_door',
                                   v_expires, false, null);
  if not coalesce((v_share ->> 'success')::boolean, false) then
    raise exception 'The emergency door does not give back access that was removed from this person: %', v_share ->> 'error'
      using errcode = '42501', hint = 'Ask the owner, or an admin of the organization, to share it with them directly.';
  end if;
  v_perm := (v_share ->> 'permission_id')::uuid;

  update iam.emergency_door_request
     set status = 'approved', decided_by = v_uid, decided_at = now(), decision_note = p_note,
         permission_id = v_perm, grant_expires_at = v_expires, updated_at = now()
   where id = q.id and status = 'pending';
  if not found then
    -- The claim means this is unreachable unless a new writer violates the row-lock protocol.
    -- Raise so PostgreSQL rolls back the permission rather than leaving a grant without its request.
    raise exception 'emergency_door_approve: claimed request % was no longer pending', q.id
      using errcode = '40001';
  end if;

  v_audit := iam._record_access_audit(
    v_t.o_org, 'approved', q.target_token, v_class, q.purpose, 'emergency_door', true,
    ARRAY[q.target_id], 1, v_t.o_subject, q.justification, null, q.id, v_perm, v_expires,
    true, null, q.requested_by);

  perform iam._notify_door(v_t.o_org, 'platform.access.emergency_door_opened',
    v_t.o_subject,
    jsonb_build_object('token', q.target_token, 'target_id', q.target_id,
                       'opened_by', q.requested_by, 'approved_by', v_uid, 'purpose', q.purpose,
                       'justification', q.justification, 'expires_at', v_expires,
                       'data_class', v_class, 'audit_id', v_audit),
    v_audit, '/me/access-log',
    'edoor:open:' || v_audit::text || ':' || coalesce(v_t.o_subject::text,'-'));

  return jsonb_build_object('granted', true, 'audit_id', v_audit, 'permission_id', v_perm,
    'permission_level', 'viewer', 'expires_at', v_expires,
    'message', format('Approved, read-only, until %s. The person whose data it is has been told.',
                      to_char(v_expires, 'HH24:MI')));
end $function$;

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
  v_share := iam.share_with_person(p_token, p_id, v_uid, 'viewer', v_uid, false, 'hr_break_glass',
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

CREATE OR REPLACE FUNCTION iam.fn_grant_resource_permission(p_resource_type text, p_resource_id uuid, p_grantee_id uuid, p_grantee_type text DEFAULT 'user'::text, p_level text DEFAULT 'read'::text, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'iam'
AS $function$
declare
  v_canonical_level public.permission_level;
  v_row iam.permissions%rowtype;
  v_res jsonb;
begin
  if p_resource_type not in ('file', 'folder', 'web_site') then
    raise exception 'unsupported resource_type %', p_resource_type;
  end if;
  if p_grantee_type not in ('user', 'organization') then
    raise exception 'unsupported grantee_type %; the user-group ACL path is removed', p_grantee_type;
  end if;
  if p_level not in ('read', 'write', 'viewer', 'commenter', 'editor', 'admin') then
    raise exception 'unsupported permission level %', p_level;
  end if;
  if not iam.has_access(p_resource_type, p_resource_id, 'admin') then
    raise exception 'insufficient permission on %', p_resource_type;
  end if;

  v_canonical_level := case p_level
    when 'read' then 'viewer'::public.permission_level
    when 'viewer' then 'viewer'::public.permission_level
    when 'write' then 'editor'::public.permission_level
    when 'editor' then 'editor'::public.permission_level
    when 'admin' then 'admin'::public.permission_level
  end;

  if p_grantee_type = 'organization' then
    insert into iam.permissions (
      resource_type, resource_id, granted_to_organization_id,
      permission_level, created_by, status, expires_at
    )
    values (
      p_resource_type, p_resource_id, p_grantee_id,
      v_canonical_level, (select auth.uid()), 'active', p_expires_at
    )
    on conflict (resource_type, resource_id, granted_to_organization_id)
    do update set
      permission_level = excluded.permission_level,
      created_by = excluded.created_by,
      status = 'active',
      expires_at = excluded.expires_at
    returning * into v_row;
  else
    -- THE ONE WRITER (T-32e). The caller was asked for Admin above; this is a deliberate share of
    -- one person, so it may give back access removed earlier. Level and expiry set exactly.
    v_res := iam.share_with_person(p_resource_type, p_resource_id, p_grantee_id, v_canonical_level,
                                   (select auth.uid()), true, 'acl_grant', p_expires_at, true, null);
    if not coalesce((v_res ->> 'success')::boolean, false) then
      raise exception '%', v_res ->> 'error' using errcode = '42501';
    end if;
    select * into v_row from iam.permissions p where p.id = (v_res ->> 'permission_id')::uuid;
  end if;

  return jsonb_build_object(
    'resource_id', v_row.resource_id,
    'resource_type', v_row.resource_type,
    'grantee_id', coalesce(v_row.granted_to_organization_id, v_row.granted_to_user_id),
    'grantee_type', p_grantee_type,
    'permission_level', v_row.permission_level::text,
    'granted_by', v_row.created_by,
    'expires_at', v_row.expires_at
  );
end;
$function$;

CREATE OR REPLACE FUNCTION platform._cutover_carry_back(p_org uuid, p_last platform.cutover_seam_press, p_apply boolean, p_press uuid DEFAULT NULL::uuid, p_actor uuid DEFAULT NULL::uuid, p_accepted boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_share_res jsonb;
  v_at        timestamptz := p_last.pressed_at;
  v_ids       uuid[];
  v_t         record;
  v_r         record;
  v_f         record;
  v_s         record;
  v_w_id      uuid;
  v_w_data    jsonb;
  v_w_del     timestamptz;
  v_q         iam.permissions;
  v_revoke    jsonb;
  v_tr        custom.record;
  v_cols      jsonb;
  v_then      jsonb;
  v_then_data jsonb;
  v_patch     jsonb;
  v_arch      boolean;
  v_rest      boolean;
  v_style     jsonb;
  v_meta      jsonb;
  v_label     text;
  v_fmt_now   text;
  v_fmt_then  text;
  v_req       boolean;
  v_changed   boolean;
  v_name      text;
  v_desc      text;
  v_n         bigint;
  n_upd int; n_new int; n_arch int; n_rest int; n_col int; n_share int;
  b_colour boolean; b_renamed boolean;
  v_rows      jsonb;
  v_fields    jsonb;
  v_perms     jsonb;
  v_table_before jsonb;
  v_parts     text[];
  v_tnot      text[];
  v_says      text[] := '{}';
  v_not       text[] := '{}';
  v_tables    jsonb := '[]'::jsonb;
  v_born      jsonb;
  v_sentence  text;
  v_keep      text;
  -- CHOICE-COLUMN-EDIT: a column's choices and a pick list's choices, edited in the new system.
  v_c         record;
  v_o         record;
  v_l         record;
  v_oldch     jsonb;
  v_newch     jsonb;
  v_ren       jsonb;
  v_pair      record;
  v_rw        record;
  v_words     text;
  v_items     jsonb;
  v_lrows     jsonb;
  v_lparts    text[];
  v_lists     jsonb := '[]'::jsonb;
  n_ch int; n_cells int;
  n_lr int; n_la int; n_lg int; n_lb int; n_le int; n_lc int;
  b_ch boolean;
begin
  if p_last.id is null or p_last.direction <> 'new' or p_last.seam_key <> 'older_tables' then
    return jsonb_build_object('tables', '[]'::jsonb, 'says', '[]'::jsonb, 'not_carried', '[]'::jsonb,
                              'born', '[]'::jsonb, 'needs_confirm', false);
  end if;
  select coalesce(array_agg(x::uuid), '{}') into v_ids
    from jsonb_array_elements_text(coalesce(p_last.did -> 'archived', '[]'::jsonb)) x;

  if p_apply then
    v_keep := current_setting('app.relabel_keeps_updated_at', true);
    perform set_config('app.relabel_keeps_updated_at', 'on', true);
  end if;

  for v_t in
    select d.id, d.table_name::text as table_name, d.description, d.metadata, d.user_id, d.created_by
      from workbench.udt_datasets d
     where d.id = any (v_ids) and d.organization_id = p_org
     order by d.table_name, d.id
  loop
    n_upd := 0; n_new := 0; n_arch := 0; n_rest := 0; n_col := 0; n_share := 0; n_ch := 0; n_cells := 0;
    b_colour := false; b_renamed := false;
    v_rows := '[]'::jsonb; v_fields := '[]'::jsonb; v_perms := '[]'::jsonb; v_table_before := null;
    v_parts := '{}'; v_tnot := '{}';
    v_name := v_t.table_name;

    -- The columns both sides hold (same id: the mover kept it), keyed as each side keys its cells.
    select coalesce(jsonb_agg(jsonb_build_object(
             'name', f.field_name, 'key', cf.data ->> 'key', 'st', cf.data ->> 'type',
             'opt', cf.data -> 'config' ->> 'options_table_id', 'ot', f.data_type::text)), '[]'::jsonb)
      into v_cols
      from workbench.udt_dataset_fields f
      join custom.record cf on cf.organization_id = p_org and cf.id = f.id and cf.data_class = 'field'
     where f.table_id = v_t.id and f.deleted_at is null and cf.data ->> 'key' is not null;

    -- A. ROWS — each record the new system touched since the switch, against itself AT the switch.
    for v_r in
      select r.id, r.data, r.created_at, r.updated_at, r.deleted_at, r.created_by
        from custom.record r
       where r.organization_id = p_org and r.table_id = v_t.id and r.data_class = 'record'
         and greatest(r.created_at, r.updated_at, coalesce(r.deleted_at, r.created_at)) > v_at
       order by r.created_at, r.id
    loop
      v_then := null;
      select s.state into v_then from custom.record_state_as_of(v_r.id, v_at) s;
      v_then_data := coalesce(v_then -> 'data', '{}'::jsonb);
      v_w_id := null; v_w_data := null; v_w_del := null;
      select w.id, w.data, w.deleted_at into v_w_id, v_w_data, v_w_del from workbench.udt_dataset_rows w where w.id = v_r.id;

      select coalesce(jsonb_object_agg(c ->> 'name',
               coalesce(platform._carried_back_value(p_org, c ->> 'st', nullif(c ->> 'opt', '')::uuid, c ->> 'ot',
                                                    v_r.data -> (c ->> 'key')), 'null'::jsonb)), '{}'::jsonb)
        into v_patch
        from jsonb_array_elements(v_cols) c
       where (v_then is null and v_r.data ? (c ->> 'key'))
          or (v_then is not null and (v_r.data -> (c ->> 'key')) is distinct from (v_then_data -> (c ->> 'key')));

      if v_w_id is null then
        -- Made in the new system. Made and archived there: nobody ever saw it here; nothing to bring.
        continue when v_r.deleted_at is not null;
        n_new := n_new + 1;
        if p_apply then
          insert into workbench.udt_dataset_rows
            (id, table_id, organization_id, data, user_id, created_by, created_at, updated_at)
          values
            (v_r.id, v_t.id, p_org, v_patch, coalesce(v_r.created_by, v_t.user_id),
             coalesce(v_r.created_by, v_t.created_by, v_t.user_id), v_r.created_at, v_r.updated_at);
          v_rows := v_rows || jsonb_build_object('id', v_r.id, 'existed', false);
        end if;
        continue;
      end if;

      -- Only what the older row does not already say (compared as words: 12 and "12" are the same).
      select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_patch
        from jsonb_each(v_patch) e
       where (v_w_data ->> e.key) is distinct from (e.value #>> '{}');
      v_arch := v_r.deleted_at is not null and v_r.deleted_at > v_at and v_w_del is null;
      v_rest := v_r.deleted_at is null and v_w_del is not null and (v_then ->> 'deleted_at') is not null;
      continue when v_patch = '{}'::jsonb and not v_arch and not v_rest;

      if v_patch <> '{}'::jsonb then n_upd := n_upd + 1; end if;
      if v_arch then n_arch := n_arch + 1; end if;
      if v_rest then n_rest := n_rest + 1; end if;
      if p_apply then
        v_rows := v_rows || jsonb_build_object('id', v_r.id, 'existed', true, 'data', v_w_data, 'deleted_at', v_w_del);
        update workbench.udt_dataset_rows
           set data = coalesce(data, '{}'::jsonb) || v_patch,
               deleted_at = case when v_arch then v_r.deleted_at when v_rest then null else deleted_at end,
               updated_at = v_r.updated_at,
               updated_by = coalesce(p_actor, updated_by)
         where id = v_r.id;
      end if;
    end loop;

    -- B. COLUMNS the new system changed since the switch: name, format and required carry; a
    -- column archived there is archived here; checks and kind are the older table's own and are named.
    for v_f in
      select f.id, f.field_name::text as field_name, coalesce(f.display_name, f.field_name)::text as label,
             f.metadata, f.is_required, f.deleted_at as fdel, cf.data as cdoc, cf.deleted_at as cdel
        from workbench.udt_dataset_fields f
        join custom.record cf on cf.organization_id = p_org and cf.id = f.id and cf.data_class = 'field'
       where f.table_id = v_t.id and f.deleted_at is null
         and greatest(cf.updated_at, coalesce(cf.deleted_at, cf.updated_at)) > v_at
       order by f.field_order, f.id
    loop
      v_then := null;
      select s.state into v_then from custom.record_state_as_of(v_f.id, v_at) s;
      continue when v_then is null;
      v_then_data := coalesce(v_then -> 'data', '{}'::jsonb);
      v_changed := false;
      v_label := v_f.label;
      v_meta := coalesce(v_f.metadata, '{}'::jsonb);
      v_req := v_f.is_required;

      if (v_f.cdoc ->> 'label') is distinct from (v_then_data ->> 'label')
         and nullif(btrim(v_f.cdoc ->> 'label'), '') is not null and (v_f.cdoc ->> 'label') <> v_f.label then
        v_label := v_f.cdoc ->> 'label'; v_changed := true;
      end if;
      v_fmt_now  := coalesce(v_f.cdoc ->> 'format', v_f.cdoc -> 'display_format' ->> 'id');
      v_fmt_then := coalesce(v_then_data ->> 'format', v_then_data -> 'display_format' ->> 'id');
      if v_fmt_now is distinct from v_fmt_then and v_fmt_now is distinct from (v_meta -> 'format' ->> 'id') then
        v_meta := case when v_fmt_now is null then v_meta - 'format'
                       else v_meta || jsonb_build_object('format',
                              coalesce(case when jsonb_typeof(v_meta -> 'format') = 'object' then v_meta -> 'format' end, '{}'::jsonb)
                              || jsonb_build_object('id', v_fmt_now)) end;
        v_changed := true;
      end if;
      if coalesce((v_f.cdoc ->> 'required')::boolean, false) is distinct from coalesce((v_then_data ->> 'required')::boolean, false)
         and coalesce((v_f.cdoc ->> 'required')::boolean, false) is distinct from coalesce(v_f.is_required, false) then
        v_req := coalesce((v_f.cdoc ->> 'required')::boolean, false); v_changed := true;
      end if;
      if (v_f.cdoc -> 'rules') is distinct from (v_then_data -> 'rules') then
        v_tnot := v_tnot || format('%s: the checks on the column %s changed in the new system. The older table keeps the checks it had.',
                                   v_name, v_f.label);
      end if;
      if (v_f.cdoc ->> 'type') is distinct from (v_then_data ->> 'type') then
        v_tnot := v_tnot || format('%s: the column %s became a different kind of column in the new system. The older table keeps it as the kind it was.',
                                   v_name, v_f.label);
      end if;
      if v_f.cdel is not null and (v_then ->> 'deleted_at') is null then
        v_changed := true;
      end if;
      continue when not v_changed;
      n_col := n_col + 1;
      if p_apply then
        v_fields := v_fields || jsonb_build_object('id', v_f.id, 'display_name', v_f.label, 'metadata', v_f.metadata,
                                                   'is_required', v_f.is_required, 'deleted_at', v_f.fdel);
        update workbench.udt_dataset_fields
           set display_name = v_label, metadata = v_meta, is_required = v_req,
               deleted_at = case when v_f.cdel is not null and (v_then ->> 'deleted_at') is null then v_f.cdel else deleted_at end
         where id = v_f.id;
      end if;
    end loop;

    -- B2. A COLUMN'S OWN CHOICES, EDITED IN THE NEW SYSTEM (lane CHOICE-COLUMN-EDIT, 2026-09-27).
    -- A choice re-worded, added, retired or moved on the copy's options since the switch: the older
    -- column's choices become the copy's live options, in their order, each keeping the older
    -- choice's own settings (its colour) where the option is the same one (same key); a re-worded
    -- choice's cells on the older table take the new words, as they would have there. A pick
    -- list's copy is carried below (G), once for every table that chooses from it.
    for v_c in
      select f.id, coalesce(f.display_name, f.field_name)::text as label, f.field_name::text as field_name,
             f.metadata, f.is_required, f.deleted_at as fdel,
             (cf.data -> 'config' ->> 'options_table_id')::uuid as opt
        from workbench.udt_dataset_fields f
        join custom.record cf on cf.organization_id = p_org and cf.id = f.id and cf.data_class = 'field'
                             and cf.deleted_at is null and cf.data ->> 'type' = 'list'
       where f.table_id = v_t.id and f.deleted_at is null
         and nullif(cf.data -> 'config' ->> 'options_table_id', '') is not null
         and not exists (select 1 from workbench.udt_structured_lists l
                          where l.id::text = cf.data -> 'config' ->> 'options_table_id')
         and exists (select 1 from custom.record o
                      where o.organization_id = p_org
                        and o.table_id = (cf.data -> 'config' ->> 'options_table_id')::uuid
                        and coalesce(o.data_class, 'record') = 'record'
                        and greatest(o.created_at, o.updated_at, coalesce(o.deleted_at, o.created_at)) > v_at)
       order by f.field_order, f.id
    loop
      v_oldch := case when jsonb_typeof(v_c.metadata #> '{format,options,choices}') = 'array'
                      then v_c.metadata #> '{format,options,choices}' else '[]'::jsonb end;
      with opts as (
        select o.id, o.created_at, (o.metadata ->> 'option_position')::integer as pos,
               coalesce(nullif(o.data ->> 'title', ''), nullif(o.data ->> 'name', '')) as words,
               coalesce(nullif(o.metadata ->> 'option_key', ''),
                        custom.choice_slug(coalesce(o.data ->> 'title', o.data ->> 'name'))) as k,
               nullif(o.data ->> 'color', '') as color
          from custom.record o
         where o.organization_id = p_org and o.table_id = v_c.opt
           and coalesce(o.data_class, 'record') = 'record' and o.deleted_at is null
      ), olds as (
        select c, custom.choice_slug(case when jsonb_typeof(c) = 'object' then coalesce(c ->> 'value', c ->> 'label')
                                          else c #>> '{}' end) as k,
               case when jsonb_typeof(c) = 'object' then coalesce(c ->> 'value', c ->> 'label') else c #>> '{}' end as words
          from jsonb_array_elements(v_oldch) c
      )
      select coalesce(jsonb_agg(
               coalesce((select case when jsonb_typeof(x.c) = 'object' then x.c else '{}'::jsonb end
                           from olds x where x.k = o.k limit 1),
                        case when o.color is not null then jsonb_build_object('color', o.color) else '{}'::jsonb end)
               || jsonb_build_object('value', o.words)
               order by o.pos nulls last, o.created_at, o.id), '[]'::jsonb),
             coalesce((select jsonb_object_agg(x.words, o2.words)
                         from olds x join opts o2 on o2.k = x.k
                        where o2.words is distinct from x.words and x.words is not null and o2.words is not null), '{}'::jsonb)
        into v_newch, v_ren
        from opts o
       where o.words is not null;

      continue when (select coalesce(jsonb_agg(case when jsonb_typeof(c) = 'object' then coalesce(c ->> 'value', c ->> 'label') else c #>> '{}' end), '[]'::jsonb)
                       from jsonb_array_elements(v_oldch) c)
                    = (select coalesce(jsonb_agg(c ->> 'value'), '[]'::jsonb) from jsonb_array_elements(v_newch) c);
      n_ch := n_ch + 1;
      if p_apply then
        if not v_fields @> jsonb_build_array(jsonb_build_object('id', v_c.id)) then
          v_fields := v_fields || jsonb_build_object('id', v_c.id, 'display_name', v_c.label, 'metadata', v_c.metadata,
                                                     'is_required', v_c.is_required, 'deleted_at', v_c.fdel);
        end if;
        update workbench.udt_dataset_fields
           set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('format',
                 coalesce(case when jsonb_typeof(metadata -> 'format') = 'object' then metadata -> 'format' end,
                          jsonb_build_object('id', 'choice'))
                 || jsonb_build_object('options',
                      coalesce(case when jsonb_typeof(metadata #> '{format,options}') = 'object' then metadata #> '{format,options}' end, '{}'::jsonb)
                      || jsonb_build_object('choices', v_newch)))
         where id = v_c.id;
      end if;
      -- The older cells that hold a re-worded choice's old words.
      for v_pair in select key as was, value #>> '{}' as now from jsonb_each(v_ren) loop
        for v_rw in
          select w.id, w.data, w.deleted_at from workbench.udt_dataset_rows w
           where w.table_id = v_t.id and w.deleted_at is null
             and ((jsonb_typeof(w.data -> v_c.field_name) = 'string' and w.data ->> v_c.field_name = v_pair.was)
                  or (jsonb_typeof(w.data -> v_c.field_name) = 'array' and (w.data -> v_c.field_name) ? v_pair.was))
        loop
          n_cells := n_cells + 1;
          if p_apply then
            if not v_rows @> jsonb_build_array(jsonb_build_object('id', v_rw.id)) then
              v_rows := v_rows || jsonb_build_object('id', v_rw.id, 'existed', true, 'data', v_rw.data, 'deleted_at', v_rw.deleted_at);
            end if;
            update workbench.udt_dataset_rows
               set data = jsonb_set(data, array[v_c.field_name],
                            case when jsonb_typeof(data -> v_c.field_name) = 'array'
                                 then (select coalesce(jsonb_agg(case when e #>> '{}' = v_pair.was then to_jsonb(v_pair.now) else e end order by n), '[]'::jsonb)
                                         from jsonb_array_elements(data -> v_c.field_name) with ordinality a(e, n))
                                 else to_jsonb(v_pair.now) end),
                   updated_by = coalesce(p_actor, updated_by)
             where id = v_rw.id;
          end if;
        end loop;
      end loop;
    end loop;

    -- C. COLUMNS ADDED IN THE NEW SYSTEM: the older table has no column for them. Named, never guessed.
    for v_f in
      select cf.id, coalesce(nullif(cf.data ->> 'label', ''), cf.data ->> 'key') as label, cf.data ->> 'key' as key
        from custom.record cf
       where cf.organization_id = p_org and cf.data_class = 'field' and cf.deleted_at is null
         and cf.data ->> 'entity_definition_id' = v_t.id::text and cf.created_at > v_at
         and not exists (select 1 from workbench.udt_dataset_fields f where f.id = cf.id)
       order by cf.created_at, cf.id
    loop
      select count(*) into v_n from custom.record r
       where r.organization_id = p_org and r.table_id = v_t.id and r.data_class = 'record' and r.deleted_at is null
         and r.data ? v_f.key and (r.data -> v_f.key) not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb);
      v_tnot := v_tnot || format('%s: the column %s was added in the new system. It and its %s stay in the new table and are not carried back.',
                                 v_name, v_f.label, case v_n when 1 then '1 value' else v_n || ' values' end);
    end loop;

    -- D. THE TABLE ITSELF: name, description, colours — against the copy at the switch.
    v_tr := null;
    select * into v_tr from custom.record
     where organization_id = p_org and id = v_t.id and data_class = 'table';
    if v_tr.id is not null and greatest(v_tr.updated_at, coalesce(v_tr.deleted_at, v_tr.updated_at)) > v_at then
      v_then := null;
      select s.state into v_then from custom.record_state_as_of(v_t.id, v_at) s;
      if v_then is not null then
        v_then_data := coalesce(v_then -> 'data', '{}'::jsonb);
        v_desc := v_t.description;
        if (v_tr.data ->> 'name') is distinct from (v_then_data ->> 'name')
           and nullif(btrim(v_tr.data ->> 'name'), '') is not null and (v_tr.data ->> 'name') <> v_t.table_name then
          v_name := v_tr.data ->> 'name'; b_renamed := true;
        end if;
        if (v_tr.data ->> 'description') is distinct from (v_then_data ->> 'description')
           and (v_tr.data ->> 'description') is distinct from v_t.description then
          v_desc := v_tr.data ->> 'description'; b_renamed := true;
        end if;
        v_style := v_t.metadata -> 'style';
        if (v_tr.data -> 'decorations') is distinct from (v_then_data -> 'decorations') then
          v_style := platform._decorations_in_older_words(v_t.id, v_tr.data -> 'decorations', v_t.metadata -> 'style');
          b_colour := v_style is distinct from (v_t.metadata -> 'style');
        end if;
        if p_apply and (b_renamed or b_colour) then
          v_table_before := jsonb_build_object('table_name', v_t.table_name, 'description', v_t.description,
                                               'style', v_t.metadata -> 'style');
          update workbench.udt_datasets
             set table_name = v_name, description = v_desc,
                 metadata = case when b_colour then jsonb_set(coalesce(metadata, '{}'::jsonb), '{style}', coalesce(v_style, '{}'::jsonb))
                                 else metadata end
           where id = v_t.id;
        end if;
      end if;
    end if;

    -- E. SHARES: the copy's people and organization lane, at the copy's level, on the older table;
    -- a share the copy no longer holds is TAKEN BACK here through the older Share dialog's own door
    -- (public.revoke_resource_access / revoke_resource_org_access, as the person pressing), which
    -- removes the grant: an archived grant still opened the table (iam.accessible_entity_ids admits
    -- every status but rejected), so marking it archived left the person seeing it (lane
    -- LIST-COPY-PERMISSIVE, 2026-09-26). The grant as it was is kept in this carry's history
    -- (before.shares) so the carry can be undone. A refusal by the door is named, never skipped.
    -- A share to someone outside the organization rides on an outside invitation on the copy and is
    -- left as it is.
    for v_s in
      select p.granted_to_user_id as u, p.granted_to_organization_id as o, p.permission_level as lvl
        from iam.permissions p
       where p.resource_type = 'record' and p.resource_id = v_t.id and p.status = 'active'
         and not coalesce(p.is_public, false)
    loop
      v_q := null;
      select q.* into v_q from iam.permissions q
       where q.resource_type = 'dataset' and q.resource_id = v_t.id
         and ((v_s.u is not null and q.granted_to_user_id = v_s.u) or (v_s.o is not null and q.granted_to_organization_id = v_s.o))
       limit 1;
      if v_s.u is not null and (v_q.id is null or v_q.status <> 'active' or v_q.permission_level <> v_s.lvl) then
        -- A PERSON's share goes through the one writer (T-32e): level set exactly, and access a
        -- person removed on the older table is never given back by the carry — it is named.
        n_share := n_share + 1;
        if p_apply then
          v_share_res := iam.share_with_person('dataset', v_t.id, v_s.u, v_s.lvl, p_actor, false,
                                               'cutover_carry', null, true, null);
          if coalesce((v_share_res ->> 'success')::boolean, false) then
            v_perms := v_perms || case when v_q.id is null
              then jsonb_build_object('user', v_s.u, 'organization', null, 'existed', false)
              else jsonb_build_object('id', v_q.id, 'existed', true, 'status', v_q.status, 'level', v_q.permission_level) end;
          else
            v_perms := v_perms || jsonb_build_object('user', v_s.u, 'existed', v_q.id is not null,
                                                     'not_given', v_share_res ->> 'error');
          end if;
        end if;
      elsif v_q.id is null then
        n_share := n_share + 1;
        if p_apply then
          insert into iam.permissions (resource_type, resource_id, granted_to_organization_id,
                                       is_public, permission_level, created_by, status, granted_via)
          values ('dataset', v_t.id, v_s.o, false, v_s.lvl, p_actor, 'active', 'share');
          v_perms := v_perms || jsonb_build_object('user', null, 'organization', v_s.o, 'existed', false);
        end if;
      elsif v_q.status <> 'active' or v_q.permission_level <> v_s.lvl then
        n_share := n_share + 1;
        if p_apply then
          v_perms := v_perms || jsonb_build_object('id', v_q.id, 'existed', true, 'status', v_q.status, 'level', v_q.permission_level);
          update iam.permissions set status = 'active', permission_level = v_s.lvl where id = v_q.id;
        end if;
      end if;
    end loop;
    for v_q in
      select q.* from iam.permissions q
       where q.resource_type = 'dataset' and q.resource_id = v_t.id and q.status = 'active'
         and not coalesce(q.is_public, false)
         and not exists (select 1 from iam.permissions p
                          where p.resource_type = 'record' and p.resource_id = v_t.id and p.status = 'active'
                            and (p.granted_to_user_id = q.granted_to_user_id or p.granted_to_organization_id = q.granted_to_organization_id))
         and not exists (select 1 from iam.invitations i
                          where i.target_type = 'custom_table' and i.target_id = v_t.id and i.deleted_at is null
                            and i.status in ('pending', 'accepted')
                            and (i.invited_user_id = q.granted_to_user_id
                                 or lower(i.email) = (select lower(u.email) from auth.users u where u.id = q.granted_to_user_id)))
    loop
      n_share := n_share + 1;
      if p_apply then
        v_revoke := case when v_q.granted_to_user_id is not null
                         then public.revoke_resource_access('dataset', v_t.id, v_q.granted_to_user_id)
                         else public.revoke_resource_org_access('dataset', v_t.id, v_q.granted_to_organization_id) end;
        if coalesce((v_revoke ->> 'success')::boolean, false) then
          v_perms := v_perms || jsonb_build_object('id', v_q.id, 'existed', true, 'status', v_q.status, 'level', v_q.permission_level,
                                                   'taken_back', true, 'grant', to_jsonb(v_q));
        else
          n_share := n_share - 1;
          v_tnot := v_tnot || format('%s: a share the new table no longer holds is still on the older table (%s).',
                                     v_name, coalesce(v_revoke ->> 'error', 'the Share door refused'));
        end if;
      end if;
    end loop;

    -- The sentence for this table.
    if n_upd > 0 then v_parts := v_parts || format('%s edited %s', n_upd, case n_upd when 1 then 'row' else 'rows' end); end if;
    if n_new > 0 then v_parts := v_parts || format('%s new %s', n_new, case n_new when 1 then 'row' else 'rows' end); end if;
    if n_arch > 0 then v_parts := v_parts || format('%s archived %s', n_arch, case n_arch when 1 then 'row' else 'rows' end); end if;
    if n_rest > 0 then v_parts := v_parts || format('%s restored %s', n_rest, case n_rest when 1 then 'row' else 'rows' end); end if;
    if n_col > 0 then v_parts := v_parts || format('%s changed %s', n_col, case n_col when 1 then 'column' else 'columns' end); end if;
    if n_ch > 0 then v_parts := v_parts || format('the changed choices of %s %s', n_ch, case n_ch when 1 then 'column' else 'columns' end); end if;
    if n_cells > 0 then v_parts := v_parts || format('%s %s holding a re-worded choice', n_cells, case n_cells when 1 then 'cell' else 'cells' end); end if;
    if b_renamed then v_parts := v_parts || 'its new name'::text; end if;
    if b_colour then v_parts := v_parts || 'its colours'::text; end if;
    if n_share > 0 then v_parts := v_parts || format('%s changed %s', n_share, case n_share when 1 then 'share' else 'shares' end); end if;

    continue when cardinality(v_parts) = 0 and cardinality(v_tnot) = 0;
    v_sentence := case when cardinality(v_parts) = 0 then null
                       else format('%s: %s %s carried back into the older table.', v_name,
                              case cardinality(v_parts) when 1 then v_parts[1]
                                   else array_to_string(v_parts[1:cardinality(v_parts) - 1], ', ') || ' and ' || v_parts[cardinality(v_parts)] end,
                              case when cardinality(v_parts) = 1 and (v_parts[1] like '1 %' or v_parts[1] = 'its new name')
                                   then 'is' else 'are' end) end;
    if v_sentence is not null then v_says := v_says || v_sentence; end if;
    v_not := v_not || v_tnot;
    v_tables := v_tables || jsonb_build_object(
      'table_id', v_t.id, 'table_name', v_name, 'rows_updated', n_upd, 'rows_created', n_new,
      'rows_archived', n_arch, 'rows_restored', n_rest, 'columns_changed', n_col, 'colours_changed', b_colour,
      'renamed', b_renamed, 'shares_changed', n_share, 'choice_columns_changed', n_ch, 'cells_reworded', n_cells,
      'says', v_sentence, 'not_carried', to_jsonb(v_tnot));

    if p_apply then
      perform history.migration_record(
        p_org, 'carried back from the new tables at Switch back', 'udt_dataset', v_t.id,
        jsonb_build_object(
          'kind', 'none',
          'why', 'the older table''s rows are not store records, so the store''s own undo cannot write them; '
                 || 'before holds each carried older row, column, table and share exactly as it was — writing those back undoes this carry',
          'before', jsonb_build_object('rows', v_rows, 'fields', v_fields, 'table', v_table_before, 'shares', v_perms),
          'press', p_press, 'undid_press', p_last.id,
          'counts', jsonb_build_object('rows_updated', n_upd, 'rows_created', n_new, 'rows_archived', n_arch,
                                       'rows_restored', n_rest, 'columns_changed', n_col, 'colours_changed', b_colour,
                                       'renamed', b_renamed, 'shares_changed', n_share,
                                       'choice_columns_changed', n_ch, 'cells_reworded', n_cells),
          'not_carried', to_jsonb(v_tnot),
          'not_carried_accepted', cardinality(v_tnot) > 0 and coalesce(p_accepted, false)),
        concat_ws(' ', v_sentence, array_to_string(v_tnot, ' ')));
    end if;
  end loop;

  -- G. PICK LISTS EDITED IN THE NEW SYSTEM (lane CHOICE-COLUMN-EDIT, 2026-09-27). A moved list's
  -- copy is the live list while switched (same id, same choice ids), so at Switch back the older list
  -- becomes what the copy is: every choice re-worded, added, retired or brought back on the copy (while
  -- switched, or on the copy before the press — the press does not undo a choice edit) is carried
  -- into the older list, and every older
  -- cell of a column that chooses from the list and holds a re-worded choice's old words takes the
  -- new ones. Before this, Switch back only unarchived the older list and every such edit was lost.
  for v_l in
    select l.id, coalesce(nullif(btrim(l.list_name), ''), 'Untitled list') as name, l.user_id, l.created_by
      from workbench.udt_structured_lists l
      join custom.record t on t.organization_id = p_org and t.id = l.id and t.data_class = 'table'
     where l.organization_id = p_org and (l.deleted_at is null or l.metadata ? 'moved_to')
       and t.metadata #>> '{moved_from,table}' = 'workbench.udt_structured_lists'
     order by l.list_name, l.id
  loop
    n_lr := 0; n_la := 0; n_lg := 0; n_lb := 0; n_le := 0; n_lc := 0;
    v_items := '[]'::jsonb; v_lrows := '[]'::jsonb; v_ren := '{}'::jsonb; v_lparts := '{}';
    for v_o in
      select o.id, o.data, o.deleted_at, i.id as iid, i.label, i.deleted_at as idel,
             i.group_name, i.help_text, i.description
        from custom.record o
        left join workbench.udt_structured_list_items i on i.id = o.id and i.list_id = v_l.id
       where o.organization_id = p_org and o.table_id = v_l.id and coalesce(o.data_class, 'record') = 'record'
         -- A choice the mover once invented from an off-list cell is never an older choice.
         and coalesce(o.metadata #>> '{moved_from,table}', '') <> 'workbench.udt_dataset_rows'
       order by (o.metadata ->> 'option_position')::integer nulls last, o.created_at, o.id
    loop
      v_words := coalesce(nullif(v_o.data ->> 'name', ''), nullif(v_o.data ->> 'title', ''));
      continue when v_words is null;
      if v_o.iid is null then
        -- Made in the new system; made and retired there, nobody here ever saw it.
        continue when v_o.deleted_at is not null;
        n_la := n_la + 1;
        if p_apply then
          insert into workbench.udt_structured_list_items
            (id, list_id, label, description, help_text, group_name, organization_id, user_id, created_by)
          values
            (v_o.id, v_l.id, v_words, v_o.data ->> 'description', v_o.data ->> 'help_text', v_o.data ->> 'group_name',
             p_org, v_l.user_id, coalesce(p_actor, v_l.created_by, v_l.user_id));
          v_items := v_items || jsonb_build_object('id', v_o.id, 'existed', false);
        end if;
        continue;
      end if;
      b_ch := false;
      if v_o.label is distinct from v_words then
        n_lr := n_lr + 1; b_ch := true;
        if v_o.label is not null then v_ren := v_ren || jsonb_build_object(v_o.label, v_words); end if;
      end if;
      if v_o.deleted_at is not null and v_o.idel is null then n_lg := n_lg + 1; b_ch := true; end if;
      if v_o.deleted_at is null and v_o.idel is not null then n_lb := n_lb + 1; b_ch := true; end if;
      if not b_ch and ((v_o.data ? 'group_name' and (v_o.data ->> 'group_name') is distinct from v_o.group_name)
                       or (v_o.data ? 'help_text' and (v_o.data ->> 'help_text') is distinct from v_o.help_text)
                       or (v_o.data ? 'description' and (v_o.data ->> 'description') is distinct from v_o.description)) then
        n_le := n_le + 1; b_ch := true;
      end if;
      continue when not b_ch;
      if p_apply then
        v_items := v_items || jsonb_build_object('id', v_o.iid, 'existed', true, 'label', v_o.label, 'deleted_at', v_o.idel,
                                                 'group_name', v_o.group_name, 'help_text', v_o.help_text,
                                                 'description', v_o.description);
        update workbench.udt_structured_list_items
           set label = v_words,
               group_name = case when v_o.data ? 'group_name' then v_o.data ->> 'group_name' else group_name end,
               help_text = case when v_o.data ? 'help_text' then v_o.data ->> 'help_text' else help_text end,
               description = case when v_o.data ? 'description' then v_o.data ->> 'description' else description end,
               deleted_at = case when v_o.deleted_at is not null and v_o.idel is null then v_o.deleted_at
                                 when v_o.deleted_at is null and v_o.idel is not null then null
                                 else deleted_at end,
               updated_by = coalesce(p_actor, updated_by)
         where id = v_o.iid;
      end if;
    end loop;

    -- The older cells, in every column that chooses from this list, that hold a re-worded choice's old words.
    for v_pair in select key as was, value #>> '{}' as now from jsonb_each(v_ren) loop
      for v_rw in
        select w.id, w.data, w.deleted_at, f.field_name::text as field_name
          from workbench.udt_dataset_fields f
          join workbench.udt_dataset_rows w on w.table_id = f.table_id and w.deleted_at is null
         where f.organization_id = p_org and f.deleted_at is null
           and f.metadata #>> '{format,options,structuredList,listId}' = v_l.id::text
           and ((jsonb_typeof(w.data -> f.field_name::text) = 'string' and w.data ->> f.field_name::text = v_pair.was)
                or (jsonb_typeof(w.data -> f.field_name::text) = 'array' and (w.data -> f.field_name::text) ? v_pair.was))
      loop
        n_lc := n_lc + 1;
        if p_apply then
          if not v_lrows @> jsonb_build_array(jsonb_build_object('id', v_rw.id)) then
            v_lrows := v_lrows || jsonb_build_object('id', v_rw.id, 'existed', true, 'data', v_rw.data, 'deleted_at', v_rw.deleted_at);
          end if;
          update workbench.udt_dataset_rows
             set data = jsonb_set(data, array[v_rw.field_name],
                          case when jsonb_typeof(data -> v_rw.field_name) = 'array'
                               then (select coalesce(jsonb_agg(case when e #>> '{}' = v_pair.was then to_jsonb(v_pair.now) else e end order by n), '[]'::jsonb)
                                       from jsonb_array_elements(data -> v_rw.field_name) with ordinality a(e, n))
                               else to_jsonb(v_pair.now) end),
                 updated_by = coalesce(p_actor, updated_by)
           where id = v_rw.id;
        end if;
      end loop;
    end loop;

    if n_lr > 0 then v_lparts := v_lparts || format('%s re-worded %s', n_lr, case n_lr when 1 then 'choice' else 'choices' end); end if;
    if n_la > 0 then v_lparts := v_lparts || format('%s new %s', n_la, case n_la when 1 then 'choice' else 'choices' end); end if;
    if n_lg > 0 then v_lparts := v_lparts || format('%s removed %s', n_lg, case n_lg when 1 then 'choice' else 'choices' end); end if;
    if n_lb > 0 then v_lparts := v_lparts || format('%s %s brought back', n_lb, case n_lb when 1 then 'choice' else 'choices' end); end if;
    if n_le > 0 then v_lparts := v_lparts || format('%s edited %s', n_le, case n_le when 1 then 'choice' else 'choices' end); end if;
    if n_lc > 0 then v_lparts := v_lparts || format('%s %s holding a re-worded choice', n_lc, case n_lc when 1 then 'cell' else 'cells' end); end if;
    continue when cardinality(v_lparts) = 0;
    v_sentence := format('%s: %s %s carried back into the older list.', v_l.name,
                         case cardinality(v_lparts) when 1 then v_lparts[1]
                              else array_to_string(v_lparts[1:cardinality(v_lparts) - 1], ', ') || ' and ' || v_lparts[cardinality(v_lparts)] end,
                         case when cardinality(v_lparts) = 1 and v_lparts[1] like '1 %' then 'is' else 'are' end);
    v_says := v_says || v_sentence;
    v_lists := v_lists || jsonb_build_object('list_id', v_l.id, 'list_name', v_l.name, 'choices_reworded', n_lr,
                                             'choices_added', n_la, 'choices_removed', n_lg, 'choices_back', n_lb,
                                             'choices_edited', n_le, 'cells_reworded', n_lc, 'says', v_sentence);
    if p_apply then
      perform history.migration_record(
        p_org, 'carried back from the new tables at Switch back', 'udt_structured_list', v_l.id,
        jsonb_build_object(
          'kind', 'none',
          'why', 'the older list''s choices are not store records, so the store''s own undo cannot write them; '
                 || 'before holds each carried older choice and older row exactly as it was — writing those back undoes this carry',
          'before', jsonb_build_object('items', v_items, 'rows', v_lrows),
          'press', p_press, 'undid_press', p_last.id,
          'counts', jsonb_build_object('choices_reworded', n_lr, 'choices_added', n_la, 'choices_removed', n_lg,
                                       'choices_back', n_lb, 'choices_edited', n_le, 'cells_reworded', n_lc)),
        v_sentence);
    end if;
  end loop;

  -- F. TABLES MADE IN THE NEW SYSTEM while switched: they stay there, and the /data home lists them.
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', coalesce(nullif(t.data ->> 'name', ''), '(unnamed table)'))
                            order by t.data ->> 'name', t.id), '[]'::jsonb)
    into v_born
    from custom.record t
   where t.organization_id = p_org and t.data_class = 'table' and t.deleted_at is null
     and not coalesce((t.data ->> 'kept_by_the_app')::boolean, false)
     and t.created_at > v_at
     and not exists (select 1 from workbench.udt_datasets d where d.id = t.id);
  if jsonb_array_length(v_born) > 0 then
    v_says := v_says || format('%s made in the new system %s there and on /data: %s.',
                               case jsonb_array_length(v_born) when 1 then '1 table' else jsonb_array_length(v_born) || ' tables' end,
                               case jsonb_array_length(v_born) when 1 then 'stays' else 'stay' end,
                               (select string_agg(b ->> 'name', ', ') from jsonb_array_elements(v_born) b));
  end if;
  if cardinality(v_says) = 0 and cardinality(v_not) = 0 then
    v_says := array['Nothing was written in the new tables since the switch, so the older tables come back exactly as they were.'];
  end if;

  if p_apply then
    perform set_config('app.relabel_keeps_updated_at', coalesce(v_keep, ''), true);
  end if;

  return jsonb_build_object('since', v_at, 'undoes', p_last.id, 'tables', v_tables, 'lists', v_lists,
                            'says', to_jsonb(v_says), 'not_carried', to_jsonb(v_not), 'born', v_born,
                            'needs_confirm', cardinality(v_not) > 0);
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
  c_version constant text := 'v2';
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
      {"token":"record","schema":"custom","table":"record","thing":"row_of_a_mine_table","id":"f1ce0000-0000-4000-8000-0000000000f2","sets":false}
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
        if (t->>'sets')::boolean then
          v_set := iam.accessible_entity_ids(t->>'token', 'viewer'::public.permission_level, 0, true);
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

CREATE OR REPLACE FUNCTION audit.user_delete_probe(p_persona text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_p text := p_persona;
  v_result jsonb;
  v_org uuid := (select organization_id from users.profiles p join auth.users u on u.id = p.id where u.email = 'admin@admin.com');
  v_id uuid := gen_random_uuid();
  v_admin uuid := (select id from auth.users where email = 'admin@admin.com');
  v_email text;
  v_anon boolean;
  v_agent uuid; v_dev uuid; v_perm uuid; v_task uuid;
  v_snap jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_outcome jsonb;
  r record; v_pk text; v_pks jsonb; v_c0 bigint; v_exists bigint; v_null bigint; v_sql text;
begin
  if p_persona not in ('A0','A1','A2','A3','A4','A5','R','B') then
    raise exception 'unknown persona %', p_persona;
  end if;
  begin
  perform set_config('app.actor_system', 'p2pre-delete-harness', true);  -- undone with the subtransaction
  -- The plan's clone personas; production already holds admin+g2v.priya@admin.com, so B's synthetic
  -- account carries a unique sub-address of it (auth.users.email is unique).
  v_email := case v_p when 'B' then 'admin+g2v.priya.probe.' || left(v_id::text, 8) || '@admin.com'
                      when 'R' then 'g2r.restrict@example.com'
                      else 'g2r.marisol@example.com' end;
  v_anon := v_p <> 'B';
  insert into auth.users (id, instance_id, aud, role, email, is_anonymous, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          case when v_anon then null else v_email end, v_anon, case when v_anon then null else now() end,
          jsonb_build_object('full_name', case v_p when 'B' then 'Priya Natarajan' when 'R' then 'Rafael Ortiz' else 'Marisol Reyes' end),
          now(), now());
  if v_p like 'A%' then
    -- every A persona: nullable SET NULL links, and a CASCADE row
    insert into ops.app_log (user_id, level, message) values (v_id, 'INFO', 'Opened the invoices page');
    insert into api.html_extractions (user_id, url, html_content)
    values (v_id, 'https://example.com/invoices', '<html><body><h1>Invoices</h1></body></html>');
    insert into public.app_instances (user_id, instance_id, organization_id)
    values (v_id, 'marisol-macbook-air', v_org) returning id into v_dev;
  end if;
  if v_p = 'A1' then
    -- chain agent.drift_alert: created_by/updated_by NO ACTION; row removed via recipient_id -> iam.users CASCADE.
    -- The agent belongs to the admin test account (an agent created by A writes agent.definition_version.created_by = A,
    -- NO ACTION and never cascaded, which would block the delete on its own).
    insert into agent.definition (name, organization_id, created_by, updated_by)
    values ('Invoice follow-up assistant', v_org, v_admin, v_admin) returning id into v_agent;
    insert into agent.drift_alert (agent_id, agent_name, severity, fingerprint, created_by, updated_by, organization_id, recipient_id)
    values (v_agent, 'Invoice follow-up assistant', 'warning', 'p2pre-' || v_id, v_id, v_id, v_org, v_id);
  elsif v_p = 'A2' then
    -- chain files.sync_mappings: created_by/updated_by NO ACTION; row removed via device_id -> app_instances (user_id CASCADE)
    insert into files.sync_mappings (device_id, local_path, organization_id, created_by, updated_by)
    values (v_dev, '/Users/marisol/Documents/Invoices', v_org, v_id, v_id);
  elsif v_p = 'A3' then
    -- chain hr.derived_grant: created_by/updated_by/grantee_user_id NO ACTION; removed via permission_id -> iam.permissions (granted_to_user_id CASCADE)
    insert into agent.definition (name, organization_id, created_by, updated_by)
    values ('Invoice follow-up assistant', v_org, v_admin, v_admin) returning id into v_agent;
    v_perm := (iam.share_with_person('agent', v_agent, v_id, 'viewer', v_admin, false, 'fixture') ->> 'permission_id')::uuid;
    perform hr.arm_write();   -- hr.* seed writes need the privileged lane; disarmed right after so the delete is not
    insert into hr.derived_grant (permission_id, resource_type, resource_id, reason, organization_id, created_by, updated_by, grantee_user_id)
    values (v_perm, 'agent', v_agent, 'Manager of the invoicing team', v_org, v_id, v_id, v_id);
    perform set_config('hr.privileged_write', '', true);
  elsif v_p in ('A4', 'A5') then
    -- chains scheduler.sch_trigger (A4) / scheduler.sch_run (A5): created_by NO ACTION; row removed via
    -- user_id CASCADE and via task_id -> sch_task (user_id CASCADE). The task's own created_by is the admin.
    insert into scheduler.sch_task (kind, title, organization_id, user_id, created_by)
    values ('ping', 'Weekly overdue-invoice check', v_org, v_id, v_admin) returning id into v_task;
    if v_p = 'A4' then
      insert into scheduler.sch_trigger (task_id, type, config, organization_id, user_id, created_by, updated_by)
      values (v_task, 'cron', '{"expression":"0 9 * * 1"}'::jsonb, v_org, v_id, v_id, v_id);
    else
      insert into scheduler.sch_run (task_id, due_at, organization_id, user_id, created_by, updated_by)
      values (v_task, now() + interval '1 day', v_org, v_id, v_id, v_id);
    end if;
  elsif v_p = 'R' then
    insert into browser.profile (display_name, home_region, egress_class, organization_id, owner_type, owner_user_id)
    values ('Research browser', 'us-east-1', 'standard', v_org, 'user', v_id);
  elsif v_p = 'B' then
    insert into files.folders (created_by, folder_path, folder_name, organization_id)
    values (v_id, 'Client contracts', 'Client contracts', v_org);
  end if;

  -- Snapshot: every column linked to auth.users or iam.users that holds the persona, with its rows' keys.
  for r in
    select distinct n.nspname sch, cl.relname tbl, a.attname col, cl.oid rel
      from pg_constraint con join pg_class cl on cl.oid = con.conrelid join pg_namespace n on n.oid = cl.relnamespace
      join pg_attribute a on a.attrelid = cl.oid and a.attnum = con.conkey[1]
     where con.contype = 'f' and con.confrelid in ('auth.users'::regclass, 'iam.users'::regclass)
       and cl.relkind = 'r'                                -- partitions counted themselves; parents skipped
  loop
    select string_agg(format('t.%I', pa.attname), ', ' order by k.ord) into v_pk
      from pg_index i cross join unnest(i.indkey) with ordinality k(attnum, ord)
      join pg_attribute pa on pa.attrelid = i.indrelid and pa.attnum = k.attnum
     where i.indrelid = r.rel and i.indisprimary;
    if v_pk is null then v_pk := 't.ctid::text'; end if;
    execute format('select count(*), jsonb_agg(jsonb_build_array(%s)) from %I.%I t where t.%I = $1', v_pk, r.sch, r.tbl, r.col)
      into v_c0, v_pks using v_id;
    if v_c0 > 0 then
      v_snap := v_snap || jsonb_build_object(format('%s.%s.%s', r.sch, r.tbl, r.col),
                  jsonb_build_object('sch', r.sch, 'tbl', r.tbl, 'col', r.col, 'pk', v_pk, 'n', v_c0, 'keys', v_pks));
    end if;
  end loop;

  begin
    delete from auth.users where id = v_id;
    v_outcome := jsonb_build_object('outcome', 'ok');
    for r in select key, value from jsonb_each(v_snap) loop
      execute format('select count(*), count(*) filter (where t.%I is null) from %I.%I t where jsonb_build_array(%s) in (select jsonb_array_elements($1))',
                     r.value->>'col', r.value->>'sch', r.value->>'tbl', r.value->>'pk')
        into v_exists, v_null using r.value->'keys';
      v_after := v_after || jsonb_build_object(r.key, jsonb_build_object(
        'before', (r.value->>'n')::bigint, 'deleted', (r.value->>'n')::bigint - v_exists, 'nulled', v_null, 'kept', v_exists - v_null));
    end loop;
    raise exception using errcode = 'P0001', message = 'undo-delete';
  exception when others then
    if sqlerrm <> 'undo-delete' then
      declare v_con text; v_tab text;
      begin
        get stacked diagnostics v_con = constraint_name, v_tab = table_name;
        v_outcome := jsonb_build_object('outcome', sqlstate, 'constraint', v_con, 'table', v_tab, 'message', left(sqlerrm, 160));
      end;
      for r in select key, value from jsonb_each(v_snap) loop
        v_after := v_after || jsonb_build_object(r.key, jsonb_build_object('before', (r.value->>'n')::bigint));
      end loop;
    end if;
  end;
    v_result := jsonb_build_object('persona', v_p, 'email', v_email) || v_outcome || jsonb_build_object('children', v_after);
    raise exception using errcode = 'P0001', message = 'undo-probe';
  exception when others then
    if sqlerrm <> 'undo-probe' then raise; end if;
  end;
  return v_result;
end $function$;
