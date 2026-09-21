-- chair-step: this replaces the bodies of three live functions — custom.portal_admits, public.inv_for_me and public.inv_accept — and opens five new client doors, so the judge cannot read what the statements will do from its allow-list
-- based-on: custom.portal_admits(uuid, uuid) fce59b6219cb380abf86743605ba779aa284594cd6a323ad9fb6ef634e12fbdb
-- based-on: public.inv_for_me() add8835c82499a361a881ad81e15411c83192ca4306917aeaeabc01f4d610974
-- based-on: public.inv_accept(text, boolean) 2cf19fc8524bfc59a14d85f1aa4018c0997289f405d7958a69c391329123d85d
--
-- SHARE-OUT item 1 — A PLUMBER GIVES ONE CUSTOMER READ-ONLY ACCESS TO ONE TABLE.
--
-- THE EVERYDAY CASE THAT WAS REFUSED. Rincon Plumbing Co wants Mara Ochoa, the customer
-- whose water heater they replaced, to see the Jobs table and nothing else. A lab wants a
-- collaborator at another university to see one experiments table. Today the store refuses,
-- in a good sentence: *"That person is not in this organization, so they cannot be given
-- access to this table yet."*
--
-- 🚨 ABOUT 90% OF THIS ALREADY EXISTED, and lane PEEK-SHARE measured exactly which 10% did
-- not (`PROGRESS-PEEK-SHARE.md` §3). NOTHING HERE IS A SECOND GUEST SYSTEM:
--
--   * `custom.share_grant` already carries the whole non-member branch, gated by
--     `custom/external_principal_enabled` AND `custom.portal_admits`.
--   * `iam.invitations` already carries `target_type` / `target_id` / `metadata`, so it can
--     bind a payload beyond "join at role X".
--   * THE LADDER ALREADY DECIDES. `custom.has_visibility` → `custom.reaches_directly` reads
--     the explicit `iam.permissions` row independently of `iam.organization_member.role`,
--     and `custom.table_carries_its_rows` already means a person who reaches a TABLE reaches
--     its records. A grant on the Table record IS "sees that table and nothing else".
--
-- WHAT WAS ACTUALLY MISSING, and what this file builds:
--
-- 1. THE ORGANIZATION WALL. `custom.assert_client_may_reach` admits a non-member only via
--    `custom.portal_admits`, whose one arm is a `custom.portal_principal` row — and that row
--    is bound to ONE CLIENT RECORD in one client Table ("your customer sees their own
--    invoice"). There was no lane for "this whole table, read-only, for a colleague outside".
--
--    THE FIX IS ONE ARM IN ONE BODY, and it deliberately stores nothing new: a person who
--    holds a live grant on a TABLE of this organization is somebody this organization has
--    already, explicitly, let in. THE GRANT IS THE ADMISSION. That is why revoking removes
--    access AT ONCE and completely — there is no second row to forget, no principal left
--    behind, no state to reconcile. It lives inside `custom.portal_admits` because that
--    body's own header says ONE SENTENCE, ONE PLACE, and because the knob that holds the
--    whole external lane shut is read there.
--
-- 2. A ROUTE FROM THE REFUSAL TO THE REMEDY, and a PENDING state. Sharing to an email with
--    no account yet is an `iam.invitations` row — `target_type = 'custom_table'`,
--    `target_id` = the Table's record id, the chosen level in `metadata` — so the dialog can
--    say "invited, not yet joined", resend and revoke.
--
-- 3. A KNOB FOR WHO MAY INVITE OUTSIDE PEOPLE. `custom/outside_invite_who`, default
--    `org_admins_and_table_owners`.
--
-- WHAT THIS FILE DOES NOT DO. It does not change `custom/external_principal_enabled`'s
-- platform default, which stays `false` — an organization opens its own outside door, and
-- the Share dialog says plainly when it is shut and who can open it.
--
-- WHY `inv_for_me` AND `inv_accept` ARE NARROWED. `inv_for_me()` returns every pending
-- invitation addressed to the caller, and the organizations UI accepts them with
-- `inv_accept`, which inserts an `iam.memberships` row whose `container_type` is the
-- invitation's `target_type`. A `custom_table` invitation walked through that path would
-- have made a membership of a container that is not one — turning "see this one table" into
-- a row in the organization's own membership table. So `inv_for_me` no longer returns them
-- and `inv_accept` refuses them BY NAME with the door that does accept them. Nothing fails
-- silently and nothing is widened.
--
-- THE INVERSE: `migrations/inverse/shareout_outside_share_down.sql`.

-- ---------------------------------------------------------------------------
-- 0. THE KNOB: who, in this organization, may invite somebody outside it.
-- ---------------------------------------------------------------------------
insert into platform.feature_knob
  (feature, key, value, default_value, value_type, allowed_values, label, description,
   set_by, basis, overridable_by, override_direction, propagation, public_read, delegable)
values
  ('custom', 'outside_invite_who',
   '"org_admins_and_table_owners"'::jsonb, '"org_admins_and_table_owners"'::jsonb,
   'string',
   '["org_admins_and_table_owners", "org_admins", "table_admins"]'::jsonb,
   'Who may invite people outside this organization to a table',
   'Sharing a table with somebody who has no membership here is a bigger act than sharing it with a colleague, so it has its own answer. `org_admins_and_table_owners` (the default): an owner or an admin of the organization, OR whoever holds Admin on that particular table — the person who made it can share it. `org_admins`: only an owner or an admin of the organization, whoever made the table. `table_admins`: anyone holding Admin on the table, and organization role alone is not enough. This is never a permission to see the table — the one ladder still decides that, and nobody can grant a level they do not hold themselves.',
   'agent',
   'SHARE-OUT, 2026-09-21. PROGRESS-PEEK-SHARE §3 measured that the external lane existed but had no answer to "who may open it for one table". The default matches what the best in the world do: Airtable and Google Sheets let the file''s own owner invite outsiders while an admin can narrow it org-wide; Notion makes it a workspace setting. Starting value chosen by an agent, reviewable.',
   '{organization}', 'any', 'next_load', false, true)
on conflict (feature, key) do update
   set allowed_values = excluded.allowed_values,
       label          = excluded.label,
       description    = excluded.description,
       basis          = excluded.basis;

-- ---------------------------------------------------------------------------
-- 1. THE ORGANIZATION WALL LEARNS ONE MORE WAY IN — and it stores nothing.
-- ---------------------------------------------------------------------------
create or replace function custom.portal_admits(p_organization_id uuid, p_user_id uuid default null::uuid)
returns boolean
language plpgsql
stable security definer
set search_path to ''
as $fn$
#variable_conflict use_column
begin
  return (
  -- ONE SENTENCE, ONE PLACE. VIS-31 says an external principal is a signed-in person with
  -- no membership of a non-personal organization and that Visibility alone decides what
  -- they see. This asks the narrower question the doors need: is this person an outsider
  -- THIS organization has deliberately let in, right now.
  --
  -- The knob is read here and not at each call site, so no surface can invent a second
  -- answer. While `custom/external_principal_enabled` resolves false for an organization
  -- this returns false for everybody in it and every door refuses by name, which is
  -- exactly the answer the platform gave before this file.
  select coalesce(
           (platform.knob_resolve('custom', 'external_principal_enabled', p_organization_id) #>> '{}')::boolean,
           false)
     and (
       -- ARM 1 — A PORTAL PRINCIPAL. The organization named this person, through a live
       -- portal, as somebody whose own records live here (PORTAL, 2026-09-20).
       exists (
         select 1
           from custom.portal_principal pp
           join custom.portal p on p.id = pp.portal_id and p.is_active
          where pp.organization_id = p_organization_id
            and pp.user_id = coalesce(p_user_id, (select auth.uid()))
            and pp.user_id is not null
            and pp.is_active)

       -- ARM 2 — A TABLE OF THIS ORGANIZATION IS SHARED WITH THIS PERSON (SHARE-OUT,
       -- 2026-09-21). The everyday case: a plumber gives one customer read-only access to
       -- the Jobs table; a lab shares one experiments table with a collaborator at another
       -- university. A grant addressed to this person, on a row that IS a Table of this
       -- organization, is that organization saying — explicitly, on the record — that this
       -- outsider may reach its doors.
       --
       -- 🚨 THE GRANT IS THE ADMISSION, AND THAT IS THE WHOLE POINT. There is no second
       -- row: revoking the grant revokes the admission in the same statement, so a revoke
       -- can never leave somebody standing in the doorway. It is deliberately NOT a new
       -- guest table — schema `custom` already has one guest system and a second would be
       -- two answers to one question.
       --
       -- IT ADMITS AND NOTHING MORE. The next line of every door is the ladder, and the
       -- ladder reads this person's grants: this arm cannot show them a single row the
       -- grant does not already carry. In particular it confers no membership, so
       -- `iam.people_lists_a_non_member_can_read` is untouched and the organization's
       -- member list stays shut to them.
       or exists (
         select 1
           from iam.permissions g
           join custom.record t
             on t.id = g.resource_id
            and t.organization_id = p_organization_id
            and t.table_id = custom.table_kernel_id()
            and t.deleted_at is null
          where g.resource_type = 'record'
            and g.granted_to_user_id = coalesce(p_user_id, (select auth.uid()))
            and g.granted_to_user_id is not null
            and g.status = 'active'
            and (g.expires_at is null or g.expires_at > now()))
     )
  );
end
$fn$;

-- ---------------------------------------------------------------------------
-- 2. WHO MAY OPEN THE OUTSIDE DOOR FOR ONE TABLE.
-- ---------------------------------------------------------------------------
create or replace function custom.may_invite_outside(p_organization_id uuid, p_table_id uuid)
returns boolean
language plpgsql
stable security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_me   uuid := custom.query_principal();
  v_who  text;
  v_role text;
begin
  if v_me is null then return false; end if;

  v_who := coalesce(
    platform.knob_resolve('custom', 'outside_invite_who', p_organization_id) #>> '{}',
    'org_admins_and_table_owners');

  select m.role into v_role
    from iam.organization_member m
   where m.organization_id = p_organization_id and m.user_id = v_me;

  -- A person outside the organization can never invite another person into it, whatever
  -- the knob says: they hold no role here and the Table is not theirs to hand out.
  if v_role is null then return false; end if;

  if v_who = 'org_admins' then
    return v_role in ('owner', 'admin');
  end if;
  if v_who = 'table_admins' then
    return custom.has_visibility(v_me, 'record', p_table_id, 'admin'::public.permission_level);
  end if;
  -- `org_admins_and_table_owners`, the default.
  return v_role in ('owner', 'admin')
      or custom.has_visibility(v_me, 'record', p_table_id, 'admin'::public.permission_level);
end;
$fn$;

-- IT IS NOT A CLIENT DOOR. It answers a question ABOUT the caller and takes an
-- organization and a table, but nothing a client could learn from it is anything the
-- doors below do not already tell them in a sentence — and giving it its own grant would
-- be a second, argument-shaped way to ask what `custom.table_share_outside` answers
-- honestly. It is declared as an internal lane so the platform's own shape guard can see
-- that somebody decided, in data, that no client calls it.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('custom', 'may_invite_outside', 'p_organization_id uuid, p_table_id uuid',
   array['uuid'::regtype::oid, 'uuid'::regtype::oid], 'SHARE-OUT',
   'SHARE-OUT / item 1: the knob gate for "who may invite outside people to a table". It reads custom/outside_invite_who for p_organization_id, the caller''s own iam.organization_member row in THAT organization, and custom.has_visibility for the caller on p_table_id. A null organization or a caller with no membership answers false. It reads nothing else and writes nothing; a null p_table_id simply makes the table arm false.',
   'server_only: the three custom.table_share_outside* write doors call this as their own gate, immediately after they have already checked custom.assert_client_may_reach and custom.assert_client_may_change on the same arguments. No client calls it: what it answers is returned to the browser as the may_invite field of custom.table_share_outside, which is itself ladder-checked, so a separate client grant would be a second way to ask one question.',
   false, false)
on conflict (schema_name, function_name, identity_argtypes) do update
   set identity_args   = excluded.identity_args,
       declared_by     = excluded.declared_by,
       reason          = excluded.reason,
       non_client_lane = excluded.non_client_lane;

-- ---------------------------------------------------------------------------
-- 3. THE DIALOG'S OWN ANSWER: is the lane open, may I use it, and who is invited.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 4. THE INVITE.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 5. RESEND — a fresh link and a fresh clock, nothing else.
-- ---------------------------------------------------------------------------
create or replace function custom.table_share_outside_resend(p_organization_id uuid, p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
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
$fn$;

-- ---------------------------------------------------------------------------
-- 6. REVOKE — the invitation AND the access, in one statement.
-- ---------------------------------------------------------------------------
create or replace function custom.table_share_outside_revoke(p_organization_id uuid, p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_inv     iam.invitations;
  v_removed integer := 0;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_share_outside_revoke');
  perform custom.assert_store_door(p_organization_id, 'custom.table_share_outside_revoke');

  select * into v_inv from iam.invitations
   where id = p_invitation_id and organization_id = p_organization_id
     and target_type = 'custom_table' and deleted_at is null;
  if not found then
    raise exception 'There is no such invitation to a table in this organization.'
      using errcode = '02000';
  end if;
  perform custom.assert_client_may_change(p_organization_id, v_inv.target_id,
            'custom.table_share_outside_revoke', 'admin'::public.permission_level, 'table');

  -- 🚨 THE GRANT GOES FIRST AND IT GOES COMPLETELY. Because the grant IS the admission
  -- (see `custom.portal_admits`), this single statement ends their access to the table,
  -- to every record in it, and to the organization's doors — there is no second row to
  -- forget. Anything they still had open refuses on its next call.
  if v_inv.invited_user_id is not null then
    update iam.permissions
       set status = 'revoked'
     where resource_type = 'record'
       and resource_id = v_inv.target_id
       and granted_to_user_id = v_inv.invited_user_id
       and status = 'active';
    get diagnostics v_removed = row_count;
  end if;

  update iam.invitations
     set status = 'revoked', deleted_at = now(),
         updated_by = custom.query_principal(), updated_at = now()
   where id = v_inv.id;

  return jsonb_build_object(
    'revoked', true, 'invitation_id', v_inv.id, 'email', v_inv.email,
    'grants_removed', v_removed,
    'say', case when v_removed > 0
                then format('%s can no longer open this table. Their access ended immediately — anything they had open refuses the next time it asks.', v_inv.email)
                else format('%s''s invitation is withdrawn. They had not joined, so they never had access to take away.', v_inv.email) end);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 7. ACCEPT — the outside person's own door.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 8. WHAT IS WAITING FOR ME — the invitee's own list, before she accepts.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 9. THE ORGANIZATION INVITATION PATH STOPS SEEING THESE, AND SAYS SO IF ASKED.
-- ---------------------------------------------------------------------------
create or replace function public.inv_for_me()
returns table(id uuid, organization_id uuid, target_type text, target_id uuid, email text,
              role text, status text, token text, expires_at timestamptz,
              created_at timestamptz, created_by uuid)
language sql
stable security definer
set search_path to 'public'
as $fn$
  select i.id, i.organization_id, i.target_type, i.target_id, i.email, i.role, i.status,
         i.token, i.expires_at, i.created_at, i.created_by
    from iam.invitations i
   where i.deleted_at is null and i.status = 'pending'
     and (i.expires_at is null or i.expires_at > now())
     -- 🚨 A TABLE SHARE IS NOT A MEMBERSHIP (SHARE-OUT, 2026-09-21). `inv_accept` turns
     -- whatever this returns into an `iam.memberships` row whose `container_type` is the
     -- invitation's `target_type`, so a `custom_table` invitation offered here would have
     -- turned "see this one table" into a membership of a container that is not one. Its
     -- own door is `custom.table_share_outside_accept`, and `custom.table_share_outside_for_me`
     -- is where it is listed.
     and i.target_type <> 'custom_table'
     and (i.invited_user_id = (select auth.uid())
          or lower(i.email) = lower((select u.email from auth.users u where u.id = (select auth.uid()))))
   order by i.created_at desc;
$fn$;

create or replace function public.inv_accept(p_token text, p_hr_half_handled boolean default false)
returns table(target_type text, target_id uuid, organization_id uuid, role text)
language plpgsql
security definer
set search_path to 'public', 'iam', 'auth'
as $fn$
declare v_inv iam.invitations; v_uid uuid := (select auth.uid()); v_email text;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select u.email into v_email from auth.users u where u.id = v_uid;
  select * into v_inv from iam.invitations i
   where i.token = p_token and i.deleted_at is null and i.status = 'pending'
     and (i.expires_at is null or i.expires_at > now())
     and (i.invited_user_id = v_uid or lower(i.email) = lower(v_email));
  if v_inv.id is null then raise exception 'invalid or expired invitation'; end if;

  -- 🚨 A TABLE SHARE HAS ITS OWN DOOR (SHARE-OUT, 2026-09-21). Accepting one here would
  -- insert a membership whose container is a Table, which is not a container — turning
  -- "see this one table" into a row in the organization's own membership table. It is
  -- refused by name, with the door that does accept it, rather than silently widened.
  if v_inv.target_type = 'custom_table' then
    raise exception 'this invitation shares one table, not a place in the organization; accept it through custom.table_share_outside_accept, which writes the table grant and nothing else'
      using errcode = '22023';
  end if;

  -- 🚨 SEE THE HEADER. An HR-tied invitation accepted here would strand the person.
  if (v_inv.metadata ? 'hr_employee_id') and not coalesce(p_hr_half_handled, false) then
    raise exception 'this invitation links an employee record; accept it through hr_invite_accept, which also binds the login'
      using errcode = '22023';
  end if;

  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by, updated_by)
  values (v_inv.organization_id, v_inv.target_type, v_inv.target_id, v_uid, coalesce(v_inv.role, 'member'), 'active', v_uid, v_uid)
  on conflict (container_type, container_id, user_id)
  do update set status = 'active', deleted_at = null, updated_by = v_uid;

  update iam.invitations
     set status = 'accepted', accepted_at = now(), invited_user_id = v_uid, updated_by = v_uid
   where id = v_inv.id;

  return query select v_inv.target_type, v_inv.target_id, v_inv.organization_id, v_inv.role;
end $fn$;

-- ---------------------------------------------------------------------------
-- 10. THE DECLARATIONS, BEFORE THE GRANTS (db-rules §6d-4).
-- ---------------------------------------------------------------------------
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason,
   signed_in_callers, anonymous_callers)
values
  ('custom', 'table_share_outside', 'p_organization_id uuid, p_table_id uuid',
   array['uuid'::regtype::oid, 'uuid'::regtype::oid], 'SHARE-OUT',
   'SHARE-OUT / item 1: what the Share dialog shows about the outside lane for ONE table. p_organization_id is checked by custom.assert_client_may_reach on entry; p_table_id by custom.assert_client_may_open at the VIEWER rung against THIS organization, so a table from another tenant reads as absent. It lists only iam.invitations rows whose target_type is custom_table and whose target_id is that one admitted table, and it reads two knobs of that organization. It writes nothing.',
   true, false),
  ('custom', 'table_share_outside_invite', 'p_organization_id uuid, p_table_id uuid, p_email text, p_level permission_level',
   array['uuid'::regtype::oid, 'uuid'::regtype::oid, 'text'::regtype::oid, 'public.permission_level'::regtype::oid], 'SHARE-OUT',
   'SHARE-OUT / item 1: invites somebody outside the organization to ONE table. p_organization_id is checked by custom.assert_client_may_reach and custom.assert_store_door; p_table_id by custom.assert_client_may_change at the ADMIN rung, the same rung custom.share_grant asks for. p_email is lowercased and must contain an @; it is only ever written as a value. p_level is an enum so it cannot reach SQL as text, and it is additionally capped at the caller''s own effective level, so nobody grants what they do not hold. The organization knob custom/external_principal_enabled must be true and custom/outside_invite_who must admit this caller; both refuse by name and name who can change them. It writes ONE iam.invitations row and nothing else — no grant is written until the invitee accepts.',
   true, false),
  ('custom', 'table_share_outside_resend', 'p_organization_id uuid, p_invitation_id uuid',
   array['uuid'::regtype::oid, 'uuid'::regtype::oid], 'SHARE-OUT',
   'SHARE-OUT / item 1: mints a fresh token for a pending table invitation. p_organization_id is checked by custom.assert_client_may_reach and custom.assert_store_door. p_invitation_id is resolved against THIS organization and target_type custom_table only, so an invitation of another tenant reads as absent; the table it names is then checked by custom.assert_client_may_change at the ADMIN rung. It rewrites only that row''s token and expiry.',
   true, false),
  ('custom', 'table_share_outside_revoke', 'p_organization_id uuid, p_invitation_id uuid',
   array['uuid'::regtype::oid, 'uuid'::regtype::oid], 'SHARE-OUT',
   'SHARE-OUT / item 1: ends an outside person''s access to one table. Identity checks are the resend door''s, exactly: the invitation is resolved against THIS organization and target_type custom_table, and the table it names is checked by custom.assert_client_may_change at the ADMIN rung. It revokes the iam.permissions row addressed to that one invited user on that one table, and marks the invitation revoked. Because the grant IS the admission (custom.portal_admits arm 2), that single statement also ends their reach into the organization''s doors.',
   true, false),
  ('custom', 'table_share_outside_accept', 'p_token text',
   array['text'::regtype::oid], 'SHARE-OUT',
   'SHARE-OUT / item 1: the invited outsider''s own door. It takes no organization and no id — the caller could not be trusted with either, because they are not in the organization yet. p_token is matched against a pending, unexpired iam.invitations row of target_type custom_table that is addressed to THIS signed-in person by user id or by the email they signed in with; every other case (unknown token, used, expired, somebody else''s) answers ONE sentence, so a link cannot be used to learn that anything is there. It writes exactly one iam.permissions row, on the table the invitation names, at the level the invitation carried when it was made — never a level the caller supplied.',
   true, false),
  ('custom', 'table_share_outside_for_me', '(none)',
   array[]::oid[], 'SHARE-OUT',
   'SHARE-OUT / item 1: the pending table invitations addressed to the signed-in caller. It takes no argument at all: the identity is auth.uid() and the email on that account, and nothing else selects a row. It reads no record of any organization — the table''s name comes from the invitation''s own metadata, stamped when it was made — so it can never reveal anything about an organization the caller is not in beyond the one invitation they were sent.',
   true, false)
on conflict (schema_name, function_name, identity_argtypes) do update
   set identity_args = excluded.identity_args,
       declared_by   = excluded.declared_by,
       reason        = excluded.reason;

grant execute on function custom.table_share_outside(uuid, uuid) to authenticated;
grant execute on function custom.table_share_outside_invite(uuid, uuid, text, permission_level) to authenticated;
grant execute on function custom.table_share_outside_resend(uuid, uuid) to authenticated;
grant execute on function custom.table_share_outside_revoke(uuid, uuid) to authenticated;
grant execute on function custom.table_share_outside_accept(text) to authenticated;
grant execute on function custom.table_share_outside_for_me() to authenticated;
