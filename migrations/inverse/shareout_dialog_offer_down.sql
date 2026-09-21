-- chair-step: SHARE-OUT's dialog inverse — it removes may_open_lane, my_level and levels from custom.table_share_outside, so the Share dialog can no longer tell who may turn the outside lane on or which levels a person may actually give, and would have to guess
--
-- Restores the body as `migrations/campaign/shareout_the_outside_lane_speaks_english.sql`
-- left it. No decision differs either way; a screen built on this version has to draw a
-- control it cannot know will work.

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
