-- target: branch,production
-- additive: yes
--   It REPLACES three bodies, each with a `-- based-on:` line and each gaining exactly one
--   arm: `custom.assert_client_may_reach` (the organization wall now has a door for a live
--   portal principal), `custom.share_grant` (VIS-31's refusal gains its one exception), and
--   `iam.may_touch_field` (a portal principal's field reach is NARROWED to what the portal
--   declared). Nothing is dropped, revoked or widened for anybody else. The inverse is
--   `migrations/inverse/portal_the_wall_has_a_door_for_the_client_it_named_down.sql`.
-- guard: custom/external_principal_enabled
-- based-on: custom.assert_client_may_reach(uuid, text) 154d344ef5cf38a47aa71e8a3873231b076b25be8bbfddfe7276a2030753add4
-- based-on: custom.share_grant(uuid, uuid, text, uuid, permission_level) 87c095a5e0a493a634a362af62f94f62dd7447951f8cfd94caabc901c23d39d3
-- based-on: iam.may_touch_field(uuid, uuid, uuid, permission_level, text) f4564cb5332949056109e653df99a7db9d5125d3eb337b088f3bdf1f384adcc7
--
-- PORTAL — THE THREE PLACES A PORTAL PRINCIPAL EXISTS, AND THERE ARE ONLY THREE.
--
-- Before this file an outsider could hold a grant and still see nothing, because every door
-- in the store asks `custom.assert_client_may_reach` FIRST and that function knows one way in:
-- `iam.has_org_access`, which is membership. VIS-31 says an external principal is a signed-in
-- person with NO membership and that Visibility alone decides what they see — so the wall and
-- the primitive disagreed, and the wall won. W2-EXT proved the outsider's reach in SQL through
-- `iam.external_principal_reach`, which reads `iam.permissions` directly, precisely because the
-- store's own doors would have refused her at the wall.
--
-- 1. THE WALL. A live portal principal of this organization may REACH its doors. That is all
--    it grants: the very next line of every door is the ladder, and she holds one grant, on
--    one record. She cannot list a Table she was not given, cannot read a record that does not
--    name her, and cannot write anything the portal did not declare editable. The switch is
--    read inside `custom.portal_admits` and nowhere else, so while an organization's
--    `custom/external_principal_enabled` is false this arm answers false for everybody in it
--    and the wall is exactly what it was before this file.
--
-- 2. THE SHARE DOOR. `custom.share_grant` refused every grant to a non-member by name, citing
--    VIS-31 and the closed knob. That refusal was right and stays right for everybody who is
--    not a portal principal; this adds its one exception, so the portal writes its grant
--    through the SAME door a colleague's share goes through — one share system, one history
--    row, one revoke.
--
-- 3. THE FIELDS. A portal declares which fields an outsider sees and which she may change.
--    That answer belongs in the one place the platform already asks it — `iam.may_touch_field`,
--    which `iam.visible_field_ids` calls and `custom.read_record` masks by — and NOT in a
--    portal-shaped read door. So a portal screen shows the allowed fields and an edit through
--    `custom.record_update` refuses a field the portal did not open, without either of them
--    knowing a portal exists. It NARROWS ONLY: the sensitivity ladder underneath still runs,
--    so a portal cannot hand out a field the ordinary rules would have hidden.
--
-- WHAT THIS DOES NOT DO. It does not make an outsider a member, does not put her in any list
-- of people, does not let her be @-mentioned or invited to anything, and does not change one
-- character of what a member sees. Every arm below is entered only by somebody who has a live
-- `custom.portal_principal` row, which only `custom.portal_invite` writes and only an
-- organization admin of the portal's client Table can call.

create or replace function custom.assert_client_may_reach(p_organization_id uuid, p_door text)
returns void
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  v_owner oid;
  v_who   name := custom.caller_role();
begin
  -- The campaign's own lanes run as the role that owns the store. Read the owner from the
  -- catalogue, never as a role literal (rule 15), so this cannot drift from the table.
  select c.relowner into v_owner from pg_class c where c.oid = 'custom.record'::regclass;
  if pg_has_role(v_who, v_owner, 'member') then
    return;
  end if;

  if p_organization_id is null then
    raise exception 'custom: % was called without an organization, and the store is keyed (organization_id, id).',
      coalesce(nullif(btrim(p_door), ''), 'that door')
      using errcode = '22004',
            hint = 'Name the organization you are working in. A door that took null would be a door onto every organization at once.';
  end if;

  if iam.has_org_access(p_organization_id) then
    return;
  end if;

  -- VIS-31 / PORTAL (2026-09-20). A live portal principal of THIS organization may reach its
  -- doors. Not because she is a member — she is not, and nothing here says she is — but
  -- because the organization named her, through a portal, as somebody whose own records live
  -- here. The next line of every door is the ladder, and she holds exactly one grant.
  -- THE SWITCH, NAMED HERE AS WELL AS INSIDE `custom.portal_admits`. Not belt and braces:
  -- the rule that lets this file name production requires the body it replaces to READ the
  -- knob that holds it off, and that rule is right — a switch a body never reads is a
  -- comment, not a switch. It costs nothing, because this line is only reached after
  -- membership has already said no. (`#>> '{}'`, not `#>> '{value}'`: `platform.knob_resolve`
  -- answers a BARE jsonb scalar, and the other spelling reads null forever — W2-TRUST's own
  -- defect, found by its suite before it shipped.)
  if coalesce((platform.knob_resolve('custom', 'external_principal_enabled', p_organization_id) #>> '{}')::boolean, false)
     and custom.portal_admits(p_organization_id) then
    return;
  end if;

  raise exception 'You are not a member of that organization, so % has nothing to do there.',
    coalesce(nullif(btrim(p_door), ''), 'that door')
    using errcode = '42501',
          hint = 'REC-29 / T15: organizations are hard walls, and a door decides who may reach one before it decides anything else. Switch to an organization you belong to, or ask an owner of that one to add you.';
end $function$;

create or replace function custom.share_grant(p_organization_id uuid, p_subject_id uuid, p_principal_kind text, p_principal_id uuid, p_level permission_level default 'viewer'::permission_level)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
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
    if p_principal_id = v_row.created_by then
      raise exception 'That person already owns this %, which is the rung above every level you could grant.', v_word
        using errcode = '23505', hint = 'VIS-25: Owner is the top rung and is held on the record itself.';
    end if;
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

    select p.id, p.permission_level into v_perm, v_before
      from iam.permissions p
     where p.resource_type = 'record' and p.resource_id = p_subject_id
       and p.granted_to_user_id = p_principal_id;

    if v_perm is null then
      insert into iam.permissions (resource_type, resource_id, granted_to_user_id,
                                   permission_level, created_by, status)
      values ('record', p_subject_id, p_principal_id, p_level, custom.query_principal(), 'active')
      returning id into v_perm;
    else
      update iam.permissions
         set permission_level = p_level, status = 'active', expires_at = null
       where id = v_perm;
    end if;
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

create or replace function iam.may_touch_field(p_user_id uuid, p_field_id uuid, p_organization_id uuid, p_level_on_record permission_level, p_action text default 'read'::text)
returns boolean
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_sensitivity text;
  v_required    public.permission_level;
  v_granted     public.permission_level;
begin
  if p_field_id is null then return true; end if;

  select f.data ->> 'sensitivity'
    into v_sensitivity
    from custom.record f
   where f.organization_id = p_organization_id
     and f.id = p_field_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null;
  if not found then
    -- A field nobody declared is not a field this store will hand out.
    return false;
  end if;

  -- PORTAL (2026-09-20) — AN OUTSIDER'S FIELDS ARE THE ONES HER PORTAL DECLARED, AND THIS
  -- NARROWS ONLY. A portal says which fields a client sees and which she may change; the
  -- answer belongs here, in the one question the platform already asks about a field, so a
  -- portal screen and an edit through `custom.record_update` cannot disagree and neither of
  -- them needs to know a portal exists.
  --
  -- The first test is one index probe on `custom.portal_principal (user_id, organization_id)`
  -- and finds nothing for every member of every organization, which is the whole platform
  -- except the handful of people a portal named. A person who is BOTH a member here and a
  -- portal principal here is a member: the portal is for outsiders, and narrowing a colleague
  -- because somebody put their address in a client row would be a new way to lose access.
  if coalesce((platform.knob_resolve('custom', 'external_principal_enabled', p_organization_id) #>> '{}')::boolean, false)
     and exists (select 1 from custom.portal_principal pp
                  where pp.user_id = p_user_id
                    and pp.organization_id = p_organization_id
                    and pp.is_active)
     and not iam.has_org_access_for(p_user_id, p_organization_id) then
    if not exists (
      select 1
        from custom.portal_table pt
        join custom.portal p on p.id = pt.portal_id and p.is_active
        join custom.portal_principal pp on pp.portal_id = p.id
       where pt.organization_id = p_organization_id
         and pp.user_id = p_user_id
         and pp.is_active
         and case when p_action = 'read'
                  then p_field_id = any (pt.visible_field_ids)
                  else p_field_id = any (pt.editable_field_ids)
             end) then
      return false;
    end if;
  end if;

  v_required := iam.field_sensitivity_level(v_sensitivity, p_action, p_organization_id);

  -- VIS-21 / VIS-26: the OVERRIDE is a row in the one grant table, on the field record.
  v_granted := iam.granted_level(p_user_id, 'record', p_field_id);
  if v_granted is not null and v_granted >= v_required then
    return true;
  end if;

  return p_level_on_record is not null and p_level_on_record >= v_required;
end $function$;
