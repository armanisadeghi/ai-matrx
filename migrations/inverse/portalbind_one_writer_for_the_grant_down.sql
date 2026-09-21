-- INVERSE of migrations/campaign/portalbind_one_writer_for_the_grant.sql.
--
-- It restores the three bodies exactly as they stood before that file — share_grant and
-- table_share_outside_accept each hand-writing their own iam.permissions row, and
-- portal_principal_bind calling custom.share_grant (which is what made the legitimate
-- outsider self-bind impossible to complete) — and removes the one writer and its registry
-- row. With this applied, the portal accept clause of scripts/campaign-tests/portalbind_green.sql
-- fails again at share_grant, which is what makes the red-then-green a measurement.
--
-- chair-step: it replaces three live client-door bodies.

set lock_timeout = '4s';

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
$function$

;

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
  -- is not a second one. It is written here rather than through `share_grant` for one
  -- reason: `share_grant` judges the CALLER at Admin on the subject, and the caller here
  -- is the person being let in. The act was already judged when the invitation was made.
  select p.id into v_perm from iam.permissions p
   where p.resource_type = 'record' and p.resource_id = v_inv.target_id
     and p.granted_to_user_id = v_me;
  if v_perm is null then
    insert into iam.permissions (resource_type, resource_id, granted_to_user_id,
                                 permission_level, created_by, status)
    values ('record', v_inv.target_id, v_me, v_level, v_inv.created_by, 'active')
    returning id into v_perm;
  else
    update iam.permissions
       set permission_level = v_level, status = 'active', expires_at = null
     where id = v_perm;
  end if;

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
$function$

;

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

  -- THE ONE GRANT, THROUGH THE ONE SHARE DOOR. This is the only access a portal ever
  -- writes: the outsider holds their own client record, and the association the portal
  -- declared carries every record that names it. Nothing here touches a Job or an
  -- Invoice, and nothing has to be re-run when one is written.
  select max(pt.conveys_max) into v_lv from custom.portal_table pt where pt.portal_id = v_p.id;
  perform custom.share_grant(p_organization_id, v_pp.client_record_id, 'person', p_user_id,
                             coalesce(v_lv, 'viewer'::public.permission_level));

  return jsonb_build_object(
    'bound', true,
    'principal_id', v_pp.id,
    'user_id', p_user_id,
    'client_record_id', v_pp.client_record_id,
    'level', coalesce(v_lv, 'viewer'::public.permission_level)::text,
    'say', format('%s now holds their own client record at %s, and every record that names it reaches them through it.',
                  v_pp.email, coalesce(v_lv, 'viewer'::public.permission_level)::text));
end $function$

;

delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = '_share_write_person';
drop function if exists custom._share_write_person(uuid, uuid, uuid, public.permission_level, uuid);
