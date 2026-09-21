-- INVERSE of invitedelivery_the_invitation_reaches_the_person.sql
-- Restores the three door bodies lane SHARE-OUT shipped and removes everything
-- INVITE-DELIVERY added. Nothing here drops anything that existed before this lane.
begin;

drop function if exists custom.table_share_outside_peek(text);
drop function if exists public.table_share_peek(text);
drop function if exists custom._table_share_invite_deliver(uuid);
drop function if exists custom._table_share_invite_payload(uuid);
drop function if exists communication.notify_from_sql(uuid, text, uuid, text, text, jsonb, text, text, uuid, text);
drop function if exists communication.channel_readiness_say(text);
drop function if exists communication.record_channel_readiness(text, boolean, text);
drop table if exists communication.channel_readiness;

delete from platform.client_callable_door
 where declared_by = 'INVITE-DELIVERY';
delete from platform.route_manifest
 where source_sha = 'invite-delivery-2026-09-21';
delete from communication.notification_event_type
 where event_key = 'share.table_invited';

-- ── the three doors, byte for byte as SHARE-OUT left them ──────────────────
CREATE OR REPLACE FUNCTION custom.table_share_outside(p_organization_id uuid, p_table_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_lane   boolean;
  v_mine   boolean;
  v_rows   jsonb;
  v_who    text;
  v_role   text;
  v_mylvl  public.permission_level;
  v_levels jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_share_outside');
  -- Seeing who else has been given this table is part of seeing the table.
  perform custom.assert_client_may_open(p_organization_id, p_table_id,
            'custom.table_share_outside', 'viewer'::public.permission_level, 'table');

  v_lane := coalesce((platform.knob_resolve('custom', 'external_principal_enabled', p_organization_id) #>> '{}')::boolean, false);
  v_mine := custom.may_invite_outside(p_organization_id, p_table_id);
  v_who  := coalesce(platform.knob_resolve('custom', 'outside_invite_who', p_organization_id) #>> '{}',
                     'org_admins_and_table_owners');

  select m.role into v_role
    from iam.organization_member m
   where m.organization_id = p_organization_id and m.user_id = custom.query_principal();

  v_mylvl := custom.effective_level(custom.query_principal(), p_organization_id, p_table_id, 'record');

  -- THE RUNGS THIS PERSON MAY GIVE, capped at the one they hold, in the store's own
  -- words. `custom.share_levels()` is where those words live; nothing here invents any.
  select coalesce(jsonb_agg(jsonb_build_object('level', l.level, 'label', l.label, 'means', l.means)
                            order by l.ordinal), '[]'::jsonb)
    into v_levels
    from custom.share_levels() l
   where v_mylvl is not null and l.level <= v_mylvl;

  select coalesce(jsonb_agg(jsonb_build_object(
           'invitation_id', i.id,
           'email',         i.email,
           'level',         coalesce(i.metadata ->> 'level', 'viewer'),
           'level_label',   iam.level_label('table', coalesce(i.metadata ->> 'level', 'viewer')::public.permission_level),
           'status',        i.status,
           'joined',        i.status = 'accepted',
           'say',           case
                              when i.status = 'accepted'
                                then format('%s can open this table as a %s.', i.email,
                                            coalesce(i.metadata ->> 'level', 'viewer'))
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
    -- WHO MAY TURN THE LANE ON. `platform.knob_override_set` admits an owner or an
    -- administrator of the organization; answering it here means the screen draws that
    -- button for the people who can use it and nobody else.
    'may_open_lane', coalesce(v_role in ('owner', 'admin'), false),
    'my_level',   v_mylvl::text,
    'levels',     v_levels,
    'who',        v_who,
    'invitations', v_rows,
    'say', case
             when not v_lane and coalesce(v_role in ('owner', 'admin'), false) then
               'Sharing with people outside this organization is turned off. You can turn it on — it applies to the whole organization, and after that anyone who may share a table can invite an outside person to it.'
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
$function$

;
CREATE OR REPLACE FUNCTION custom.table_share_outside_invite(p_organization_id uuid, p_table_id uuid, p_email text, p_level permission_level DEFAULT 'viewer'::permission_level)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
    raise exception 'Sharing with people outside % is turned off here, so % cannot be invited to %.',
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
      coalesce(v_mylvl::text, 'nothing'), v_name, p_level::text
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
    'say', format('%s is invited to %s as a %s. They get access the moment they follow the link and the platform gives them an identity — until then this row holds nothing, and they can see nothing of %s.',
                  v_mail, v_name, p_level::text,
                  coalesce(v_org, 'this organization')));
end;
$function$

;
CREATE OR REPLACE FUNCTION custom.table_share_outside_resend(p_organization_id uuid, p_invitation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_inv iam.invitations;
  v_tok text;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_share_outside_resend');
  perform custom.assert_store_door(p_organization_id, 'custom.table_share_outside_resend');

  select * into v_inv from iam.invitations
   where id = p_invitation_id and organization_id = p_organization_id
     and target_type = 'custom_table' and deleted_at is null;
  if not found then
    raise exception 'There is no such invitation to a table in this organization.'
      using errcode = '02000';
  end if;
  perform custom.assert_client_may_change(p_organization_id, v_inv.target_id,
            'custom.table_share_outside_resend', 'admin'::public.permission_level, 'table');
  if not custom.may_invite_outside(p_organization_id, v_inv.target_id) then
    raise exception 'You cannot invite people from outside this organization to that table.'
      using errcode = '42501',
            hint = 'Who may is this organization''s own setting (custom/outside_invite_who).';
  end if;
  if v_inv.status = 'accepted' then
    raise exception '% has already joined, so there is nothing to resend.', v_inv.email
      using errcode = '23505',
            hint = 'To take their access away, revoke it — that removes the grant at once.';
  end if;

  update iam.invitations
     set token = gen_random_uuid()::text,
         expires_at = now() + interval '14 days',
         status = 'pending',
         updated_by = custom.query_principal(),
         updated_at = now()
   where id = v_inv.id
  returning token into v_tok;

  return jsonb_build_object(
    'resent', true, 'invitation_id', v_inv.id, 'email', v_inv.email, 'token', v_tok,
    'expires_at', (select i.expires_at from iam.invitations i where i.id = v_inv.id),
    'say', format('A fresh link is on its way to %s. The old one stops working immediately.', v_inv.email));
end;
$function$

;

commit;
