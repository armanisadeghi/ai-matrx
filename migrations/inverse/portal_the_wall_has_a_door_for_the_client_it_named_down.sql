-- chair-step: this puts `custom.assert_client_may_reach`, `custom.share_grant` and `iam.may_touch_field` back to the bodies they held before lane PORTAL — removing ONE arm from each. After it: the organization wall knows membership and nothing else, so every portal principal is refused 42501 at the first line of every door; `custom.share_grant` refuses every grant to a non-member again, so no new portal principal can be bound; and a portal's own field list stops narrowing anything, so an outsider who somehow still holds a grant would read every field the sensitivity ladder allows. It REVOKES nothing, DROPS nothing, and changes not one character of what a member sees.
-- lane: PORTAL (the outsider portal, PRODUCTS row 2)
--
-- RUN THIS BEFORE `portal_a_portal_is_a_view_of_one_organization_for_an_outsider_down.sql`:
-- these three bodies are the only things outside the lane's own prefix that call
-- `custom.portal_admits`, so dropping that function first would leave them raising 42883.

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
                    where m.organization_id = p_organization_id and m.user_id = p_principal_id) then
      raise exception 'That person is not in this organization, so they cannot be given access to this % yet.', v_word
        using errcode = '42501',
              hint = 'VIS-31 / custom/external_principal_enabled resolves false: sharing with somebody who has no membership here is the external-principal lane, and it is not open. Invite them to the organization, or share with their organization instead (VIS-23).';
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

  v_required := iam.field_sensitivity_level(v_sensitivity, p_action, p_organization_id);

  -- VIS-21 / VIS-26: the OVERRIDE is a row in the one grant table, on the field record.
  v_granted := iam.granted_level(p_user_id, 'record', p_field_id);
  if v_granted is not null and v_granted >= v_required then
    return true;
  end if;

  return p_level_on_record is not null and p_level_on_record >= v_required;
end $function$;
