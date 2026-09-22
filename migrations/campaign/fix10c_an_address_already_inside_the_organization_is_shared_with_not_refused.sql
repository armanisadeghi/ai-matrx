-- chair-step: this replaces the body of a live client door, so the judge cannot read what the statements will do from its allow-list
-- based-on: custom.table_share_outside_invite(uuid, uuid, text, permission_level) 4aa69f19cad8fc3a668571fb843ed79c4a1860e363977882d4e22f3936904c19
--
-- FIX-10C item 1 — VERIFIER-10 F7: "inviting an outsider who already has an
-- account is a silent no-op — it must add them or say why not."
--
-- WHAT WAS ACTUALLY THERE, walked against the live database before anything was
-- written. The door was not silent: given `test@test.com` on Rincon Plumbing
-- Co's Jobs table it raised, in good English —
--
--   "test@test.com is already in Rincon Plumbing Co, so share the table with
--    them directly instead of inviting them from outside."
--   HINT: Use the Share dialog's ordinary person lane — custom.share_grant —
--         which gives them access immediately.
--
-- — and `iam.memberships` confirms the premise: that account has been a member
-- of Rincon Plumbing Co (`6069a466-…`) since 2026-09-21 04:29 UTC. VERIFIER-10's
-- correction 1 — "she is not a Rincon member" — is itself wrong; VERIFIER-9 was
-- right, and the invite the verifier watched do nothing was a refusal their
-- script swallowed.
--
-- 🚨 WHICH LEAVES THE REAL DEFECT, AND IT IS THE ONE THIS PANEL EXISTS TO KILL.
-- `OutsideSharePanel`'s own header says it: the Share dialog used to print the
-- store's refusal, list three ways forward, and offer no way to take any of
-- them — "a dead end with good manners". This refusal is exactly that dead end,
-- rebuilt one floor down. The person typed an address, asked for that address
-- to be given this table, and the platform answered with the name of the
-- function it would like them to call instead. Nobody outside this building
-- knows what `custom.share_grant` is.
--
-- SO THE DOOR DOES THE THING. An address whose account is already a member of
-- this organization is not an outside share at all — it is an ordinary one, and
-- the ordinary one is `custom.share_grant`, the SAME door the people picker
-- above uses, through THE ONE LADDER. Nothing new decides anything here:
--
--   · every check above this point still runs first, in the same order — the
--     reach and store-door asserts, Admin ON THE TABLE, the organization's
--     outside-lane knob, `custom.may_invite_outside`, and the level cap that
--     forbids handing out more than you hold. A person who may not invite still
--     may not, and a person who holds viewer still cannot give admin;
--   · `custom.share_grant` then runs its OWN ladder again on the same subject,
--     so this is not a bypass with a friendlier sentence — it is the second
--     door agreeing with the first;
--   · nothing is invited, so no `iam.invitations` row is written, no link is
--     minted and no message is sent. They are IN the organization; there is
--     nothing for them to accept.
--
-- WHAT THE ANSWER SAYS. The shape keeps every key the panel already reads, and
-- adds `granted` so a caller can tell the two acts apart without parsing
-- English. `invited` is false, `accept_path` and `delivery` are null — an
-- invitation that did not happen never reports a link — and `say` names what
-- DID happen and where to find it:
--
--   "test@test.com is already in Rincon Plumbing Co, so they were given Jobs
--    directly, as a viewer. They can open it now — no invitation, no link to
--    follow. They are in the list above with everybody else who has access."
--
-- THE INVERSE: `migrations/inverse/fix10c_an_address_already_inside_the_organization_down.sql`
-- puts the refusal back, byte for byte.

create or replace function custom.table_share_outside_invite(
  p_organization_id uuid,
  p_table_id        uuid,
  p_email           text,
  p_level           public.permission_level default 'viewer'::public.permission_level)
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
  v_sent  jsonb;
  v_grant jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_share_outside_invite');
  perform custom.assert_store_door(p_organization_id, 'custom.table_share_outside_invite');
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

  if not coalesce((platform.knob_resolve('custom', 'external_principal_enabled', p_organization_id) #>> '{}')::boolean, false) then
    raise exception 'Sharing with people outside % is turned off here, so % cannot be invited to %.',
      coalesce(v_org, 'this organization'), v_mail, v_name
      using errcode = '42501',
            hint = 'An owner or an administrator of this organization turns it on once, for everybody, in the organization''s settings (custom/external_principal_enabled). Until then, share this table with a colleague inside the organization instead.';
  end if;

  if not custom.may_invite_outside(p_organization_id, p_table_id) then
    raise exception 'You cannot invite people from outside % to %.',
      coalesce(v_org, 'this organization'), v_name
      using errcode = '42501',
            hint = 'Who may do that is this organization''s own setting (custom/outside_invite_who). By default it is an owner or an administrator of the organization, or whoever holds Admin on the table itself.';
  end if;

  v_mylvl := custom.effective_level(custom.query_principal(), p_organization_id, p_table_id, 'record');
  if v_mylvl is null or p_level > v_mylvl then
    raise exception 'You hold % on %, so you cannot give somebody %.',
      coalesce(v_mylvl::text, 'nothing'), v_name, p_level::text
      using errcode = '42501',
            hint = 'Levels go viewer < commenter < editor < admin, and a share never confers more than the person sharing holds.';
  end if;

  select u.id into v_user from auth.users u where lower(u.email) = v_mail order by u.created_at limit 1;

  -- 🚨 ALREADY INSIDE: DO THE ORDINARY THING (FIX-10C, 2026-09-22).
  -- This used to raise and name `custom.share_grant` at the person. Now it
  -- CALLS it — the same door the people picker uses, which runs the ladder
  -- again on this same subject, so the friendlier answer is two doors agreeing
  -- rather than one being skipped.
  if v_user is not null and exists (select 1 from iam.organization_member m
                                     where m.organization_id = p_organization_id and m.user_id = v_user) then
    v_grant := custom.share_grant(p_organization_id, p_table_id, 'person', v_user, p_level);
    return jsonb_build_object(
      'invited', false,
      'granted', true,
      'invitation_id', null,
      'email', v_mail,
      'table', v_name,
      'level', p_level::text,
      'level_label', iam.level_label('table', p_level),
      'token', null,
      'accept_path', null,
      'delivery', null,
      'expires_at', null,
      'joined', true,
      'grant', v_grant,
      'say', format('%s is already in %s, so they were given %s directly, as a %s. They can open it now — no invitation, no link to follow. They are in the list of everybody who has access, above.',
                    v_mail, coalesce(v_org, 'this organization'), v_name, p_level::text),
      'delivery_say', null);
  end if;

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

  -- 🚨 THE HALF THAT WAS MISSING. Same transaction as the invitation: a rolled-back
  -- invite can never have told anybody about access they were not given.
  v_sent := custom._table_share_invite_deliver(v_id);

  return jsonb_build_object(
    'invited', true,
    'granted', false,
    'invitation_id', v_id,
    'email', v_mail,
    'table', v_name,
    'level', p_level::text,
    'level_label', iam.level_label('table', p_level),
    'token', (select i.token from iam.invitations i where i.id = v_id),
    'accept_path', v_sent ->> 'accept_path',
    'delivery', v_sent,
    'expires_at', (select i.expires_at from iam.invitations i where i.id = v_id),
    'joined', false,
    'say', format('%s is invited to %s as a %s. They get access the moment they follow the link and the platform gives them an identity — until then this row holds nothing, and they can see nothing of %s.',
                  v_mail, v_name, p_level::text,
                  coalesce(v_org, 'this organization')),
    'delivery_say', v_sent ->> 'say');
end;
$fn$;

revoke all on function custom.table_share_outside_invite(uuid, uuid, text, public.permission_level) from public;
grant execute on function custom.table_share_outside_invite(uuid, uuid, text, public.permission_level) to authenticated;
