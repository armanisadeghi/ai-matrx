-- chair-step: SHARE-OUT item 1's wording inverse — it puts back the four door bodies whose refusal printed the organization's name with a stray letter glued to it ("outside Rincon Plumbing Cos") and whose sentences read "at table viewer"
--
-- Nothing about who may do what differs between the two versions: the ladder calls, the
-- knob reads, the level cap and every identity check are byte-identical either way. Only
-- the sentences change, and only one set of them is English.

create or replace function custom.table_share_outside(p_organization_id uuid, p_table_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_lane  boolean;
  v_mine  boolean;
  v_rows  jsonb;
  v_who   text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_share_outside');
  -- Seeing who else has been given this table is part of seeing the table.
  perform custom.assert_client_may_open(p_organization_id, p_table_id,
            'custom.table_share_outside', 'viewer'::public.permission_level, 'table');

  v_lane := coalesce((platform.knob_resolve('custom', 'external_principal_enabled', p_organization_id) #>> '{}')::boolean, false);
  v_mine := custom.may_invite_outside(p_organization_id, p_table_id);
  v_who  := coalesce(platform.knob_resolve('custom', 'outside_invite_who', p_organization_id) #>> '{}',
                     'org_admins_and_table_owners');

  select coalesce(jsonb_agg(jsonb_build_object(
           'invitation_id', i.id,
           'email',         i.email,
           'level',         coalesce(i.metadata ->> 'level', 'viewer'),
           'level_label',   iam.level_label('table', coalesce(i.metadata ->> 'level', 'viewer')::public.permission_level),
           'status',        i.status,
           'joined',        i.status = 'accepted',
           -- The one sentence the dialog shows beside the row.
           'say',           case
                              when i.status = 'accepted'
                                then format('%s can open this table.', i.email)
                              when i.expires_at is not null and i.expires_at <= now()
                                then format('%s was invited, and the invitation has run out. Resend it to give them a fresh link.', i.email)
                              else format('%s is invited and has not joined yet. They get access the moment they follow the link and the platform gives them an identity — until then this row holds nothing.', i.email)
                            end,
           'expires_at',    i.expires_at,
           'invited_at',    i.created_at,
           'expired',       i.expires_at is not null and i.expires_at <= now())
           order by i.created_at desc), '[]'::jsonb)
    into v_rows
    from iam.invitations i
   where i.target_type = 'custom_table'
     and i.target_id = p_table_id
     and i.organization_id = p_organization_id
     and i.deleted_at is null
     and i.status <> 'revoked';

  return jsonb_build_object(
    'lane_open',  v_lane,
    'may_invite', v_mine,
    'who',        v_who,
    'invitations', v_rows,
    -- WHEN IT IS SHUT, SAY SO AND SAY WHO OPENS IT. Never a dead control and never a
    -- knob key at a person.
    'say', case
             when not v_lane then
               'Sharing with people outside this organization is turned off here. An owner or an administrator of this organization turns it on once, for everybody, and then anyone who may share a table can invite an outside person to it.'
             when not v_mine and v_who = 'org_admins' then
               'An owner or an administrator of this organization invites people from outside. Ask one of them, or share this table with a colleague here instead.'
             when not v_mine and v_who = 'table_admins' then
               'Whoever holds Admin on this table invites people from outside it. Ask them, or share this table with a colleague here instead.'
             when not v_mine then
               'An owner or an administrator of this organization, or whoever holds Admin on this table, invites people from outside. Ask one of them, or share this table with a colleague here instead.'
             else
               'Invite somebody outside this organization by email. They will see this table and nothing else here, at the level you choose.'
           end);
end;
$fn$;

create or replace function custom.table_share_outside_invite(
  p_organization_id uuid, p_table_id uuid, p_email text,
  p_level permission_level default 'viewer'::permission_level)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_mail  text := lower(btrim(coalesce(p_email, '')));
  v_row   custom.record;
  v_user  uuid;
  v_id    uuid;
  v_name  text;
  v_mylvl public.permission_level;
  v_org   text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_share_outside_invite');
  perform custom.assert_store_door(p_organization_id, 'custom.table_share_outside_invite');
  -- THE ONE LADDER at the rung whose whole definition is "can change it and decide who
  -- else may" — the same rung `custom.share_grant` asks for before it shares anything.
  perform custom.assert_client_may_change(p_organization_id, p_table_id,
            'custom.table_share_outside_invite', 'admin'::public.permission_level, 'table');

  select r.* into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_table_id
     and r.table_id = custom.table_kernel_id() and r.deleted_at is null;
  if not found then
    raise exception 'There is no such table in this organization, so it cannot be shared.'
      using errcode = '02000';
  end if;
  v_name := coalesce(nullif(v_row.data ->> 'name', ''), 'this table');
  select o.name into v_org from iam.organizations o where o.id = p_organization_id;

  if position('@' in v_mail) < 2 then
    raise exception 'An invitation needs an email address to send the link to.'
      using errcode = '22004';
  end if;
  if p_level is null then
    raise exception 'A share has to say what the other person may do with it.'
      using errcode = '22004',
            hint = 'Pass one of viewer, commenter, editor, admin — call custom.share_levels() for what each one means.';
  end if;

  -- THE OUTSIDE LANE HAS TO BE OPEN, and the refusal names who opens it.
  if not coalesce((platform.knob_resolve('custom', 'external_principal_enabled', p_organization_id) #>> '{}')::boolean, false) then
    raise exception 'Sharing with people outside %s is turned off here, so % cannot be invited to %.',
      coalesce(v_org, 'this organization'), v_mail, v_name
      using errcode = '42501',
            hint = 'An owner or an administrator of this organization turns it on once, for everybody, in the organization''s settings (custom/external_principal_enabled). Until then, share this table with a colleague inside the organization instead.';
  end if;

  -- AND THIS PERSON HAS TO BE ONE OF THE PEOPLE WHO MAY USE IT.
  if not custom.may_invite_outside(p_organization_id, p_table_id) then
    raise exception 'You cannot invite people from outside % to %.',
      coalesce(v_org, 'this organization'), v_name
      using errcode = '42501',
            hint = 'Who may do that is this organization''s own setting (custom/outside_invite_who). By default it is an owner or an administrator of the organization, or whoever holds Admin on the table itself.';
  end if;

  -- 🚨 NOBODY GRANTS A LEVEL THEY DO NOT HOLD. An editor cannot hand out Admin.
  v_mylvl := custom.effective_level(custom.query_principal(), p_organization_id, p_table_id, 'record');
  if v_mylvl is null or p_level > v_mylvl then
    raise exception 'You hold % on %, so you cannot give somebody %.',
      coalesce(iam.level_label('table', v_mylvl), 'nothing'), v_name, iam.level_label('table', p_level)
      using errcode = '42501',
            hint = 'Levels go viewer < commenter < editor < admin, and a share never confers more than the person sharing holds.';
  end if;

  -- ALREADY A MEMBER? Then this is not the outside lane at all, and saying so is more
  -- use than an invitation that would sit there unaccepted beside a grant they can have
  -- right now.
  select u.id into v_user from auth.users u where lower(u.email) = v_mail order by u.created_at limit 1;
  if v_user is not null and exists (select 1 from iam.organization_member m
                                     where m.organization_id = p_organization_id and m.user_id = v_user) then
    raise exception '% is already in %, so share the table with them directly instead of inviting them from outside.',
      v_mail, coalesce(v_org, 'this organization')
      using errcode = '23505',
            hint = 'Use the Share dialog''s ordinary person lane — custom.share_grant — which gives them access immediately.';
  end if;

  -- THE INVITATION. One live invitation per (table, email): re-inviting refreshes the
  -- link and the level rather than stacking a second row nobody can tell apart.
  update iam.invitations
     set role        = p_level::text,
         metadata    = coalesce(metadata, '{}'::jsonb)
                       || jsonb_build_object('level', p_level::text,
                                             'subject', 'custom_table',
                                             'table_name', v_name),
         expires_at  = now() + interval '14 days',
         token       = gen_random_uuid()::text,
         status      = 'pending',
         accepted_at = null,
         invited_user_id = v_user,
         updated_by  = custom.query_principal(),
         updated_at  = now()
   where target_type = 'custom_table'
     and target_id = p_table_id
     and organization_id = p_organization_id
     and lower(email) = v_mail
     and deleted_at is null
     and status <> 'accepted'
  returning id into v_id;

  if v_id is null then
    insert into iam.invitations
      (organization_id, target_type, target_id, email, invited_user_id, role, status,
       expires_at, metadata, created_by, updated_by)
    values
      (p_organization_id, 'custom_table', p_table_id, v_mail, v_user, p_level::text, 'pending',
       now() + interval '14 days',
       jsonb_build_object('level', p_level::text, 'subject', 'custom_table', 'table_name', v_name),
       custom.query_principal(), custom.query_principal())
    returning id into v_id;
  end if;

  return jsonb_build_object(
    'invited', true,
    'invitation_id', v_id,
    'email', v_mail,
    'table', v_name,
    'level', p_level::text,
    'level_label', iam.level_label('table', p_level),
    'token', (select i.token from iam.invitations i where i.id = v_id),
    'expires_at', (select i.expires_at from iam.invitations i where i.id = v_id),
    'joined', false,
    'say', format('%s is invited to %s at %s. They get access the moment they follow the link and the platform gives them an identity — until then this row holds nothing, and they can see nothing of %s.',
                  v_mail, v_name, lower(iam.level_label('table', p_level)),
                  coalesce(v_org, 'this organization')));
end;
$fn$;

create or replace function custom.table_share_outside_accept(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
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
    'say', format('%s shared %s with you at %s. That table is all you can see here — nothing else of %s is open to you.',
                  coalesce(v_org, 'An organization'), v_name, lower(iam.level_label('table', v_level)),
                  coalesce(v_org, 'theirs')));
end;
$fn$;

create or replace function custom.table_share_outside_for_me()
returns table(invitation_id uuid, organization_id uuid, organization text,
              table_id uuid, table_name text, level text, level_label text,
              token text, expires_at timestamptz, say text)
language plpgsql
stable security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_me   uuid := custom.query_principal();
  v_mail text;
begin
  if v_me is null then return; end if;
  select lower(u.email) into v_mail from auth.users u where u.id = v_me;

  return query
    select i.id, i.organization_id, o.name,
           i.target_id,
           -- The Table's NAME travels in the invitation's own metadata, stamped when it
           -- was made. Reading `custom.record` here would be a read of an organization
           -- this person is not in yet, through a door that is not the ladder.
           coalesce(nullif(i.metadata ->> 'table_name', ''), 'a table'),
           coalesce(nullif(i.metadata ->> 'level', ''), 'viewer'),
           iam.level_label('table', coalesce(nullif(i.metadata ->> 'level', ''), 'viewer')::public.permission_level),
           i.token, i.expires_at,
           format('%s shared %s with you at %s. Open it and it is yours to see; nothing else of theirs is.',
                  coalesce(o.name, 'An organization'),
                  coalesce(nullif(i.metadata ->> 'table_name', ''), 'a table'),
                  lower(iam.level_label('table', coalesce(nullif(i.metadata ->> 'level', ''), 'viewer')::public.permission_level)))
      from iam.invitations i
      left join iam.organizations o on o.id = i.organization_id
     where i.target_type = 'custom_table'
       and i.deleted_at is null
       and i.status = 'pending'
       and (i.expires_at is null or i.expires_at > now())
       and (i.invited_user_id = v_me or lower(i.email) = v_mail)
     order by i.created_at desc;
end;
$fn$;
