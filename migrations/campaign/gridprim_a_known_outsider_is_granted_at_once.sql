-- target: branch,production
-- additive: yes
--   It ADDS `custom.table_share_outside_grant` and its `platform.client_callable_door` row (the
--   `share.table_granted` notification kind and the signed-in grant come in the chair-step file
--   `gridprim_a_signed_in_person_may_share_with_a_known_outsider.sql`, applied after). Nothing existing is replaced, dropped or
--   revoked; `custom.table_share_outside_invite` and `custom.table_share_outside_accept` are left
--   exactly as they are and are what this door hands the unknown case to. No table, column,
--   trigger, policy or grant is touched. The inverse is
--   `migrations/inverse/gridprim_a_known_outsider_is_granted_at_once_down.sql`.
-- guard: custom/system_enabled
-- lock: custom,platform
--
-- LANE GRID-PRIMITIVES, G14 — A KNOWN OUTSIDER IS GRANTED AT ONCE.
--
-- Today the only way to share a store Table with somebody outside the organization is
-- `custom.table_share_outside_invite`: an emailed link that grants when it is followed. The
-- older grid granted at once. The champion (Google Docs): an address that already has an
-- account gets access immediately and a notification; an address with none gets an invitation.
--
-- `custom.table_share_outside_grant(org, table, person, level)` — `person` is an account id or
-- an email address:
--   · a MEMBER of the organization → `custom.share_grant`, exactly as the invite door does;
--   · an ACCOUNT outside it → the SAME permission row the accept path writes
--     (`custom._share_write_person`), at once, and a `share.table_granted` notification (in-app
--     and email) that opens the table. They are NOT made a member: the organization wall admits
--     them through the grant alone (`custom.portal_admits`), and they see that table only;
--   · no account (an email nobody signed up with) → `custom.table_share_outside_invite`, whose
--     answer is returned whole.
-- Every rule the invite door applies stands in front of all three: admin on the table, the
-- organization's outside-sharing switch (`custom/external_principal_enabled`), who may invite
-- outside (`custom.may_invite_outside`, knob `custom/outside_invite_who`), and a share never
-- conferring more than the sharer holds.
--
-- LOCKS. create function / insert / comment on only. Not window-class.

set local lock_timeout = '5s';
set local statement_timeout = '60s';


create function custom.table_share_outside_grant(p_organization_id uuid, p_table_id uuid,
                                                 p_person text,
                                                 p_level public.permission_level default 'viewer')
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_said  text := btrim(coalesce(p_person, ''));
  v_user  uuid;
  v_mail  text;
  v_row   custom.record;
  v_name  text;
  v_org   text;
  v_mylvl public.permission_level;
  v_perm  uuid;
  v_means text;
  v_who   text;
  v_sent  jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_share_outside_grant');
  perform custom.assert_store_door(p_organization_id, 'custom.table_share_outside_grant');
  perform custom.assert_client_may_change(p_organization_id, p_table_id,
            'custom.table_share_outside_grant', 'admin'::public.permission_level, 'table');

  select r.* into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_table_id
     and r.table_id = custom.table_kernel_id() and r.deleted_at is null;
  if not found then
    raise exception 'There is no such table in this organization, so it cannot be shared.'
      using errcode = '02000';
  end if;
  v_name := coalesce(nullif(v_row.data ->> 'name', ''), 'this table');
  select o.name into v_org from iam.organizations o where o.id = p_organization_id;

  if v_said = '' then
    raise exception 'Say who to share % with: their email address, or their account.', v_name
      using errcode = '22004';
  end if;
  if p_level is null then
    raise exception 'A share has to say what the other person may do with it.'
      using errcode = '22004',
            hint = 'Pass one of viewer, commenter, editor, admin — call custom.share_levels() for what each one means.';
  end if;

  -- Who they are: an account id, or an email address (an account, or nobody yet).
  if v_said ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select u.id, lower(u.email) into v_user, v_mail from auth.users u where u.id = v_said::uuid;
    if v_user is null then
      raise exception 'There is no account %, so % was not shared.', v_said, v_name
        using errcode = '22023', hint = 'Share with their email address instead; if they have no account yet, they get an invitation.';
    end if;
  else
    v_mail := lower(v_said);
    if position('@' in v_mail) < 2 then
      raise exception 'Share with an email address or an account, and % is neither.', v_said
        using errcode = '22023';
    end if;
    select u.id into v_user from auth.users u where lower(u.email) = v_mail order by u.created_at limit 1;
  end if;

  -- A member of the organization, or an address nobody signed up with: the invite door's own
  -- answer, which makes every one of its checks and says what it did.
  if v_user is null
     or exists (select 1 from iam.organization_member m
                 where m.organization_id = p_organization_id and m.user_id = v_user) then
    return custom.table_share_outside_invite(p_organization_id, p_table_id, v_mail, p_level)
           || jsonb_build_object('person', case when v_user is null then 'no_account' else 'member' end);
  end if;

  -- An account outside the organization: the invite door's rules, then the accept path's row.
  if not coalesce((platform.knob_resolve('custom', 'external_principal_enabled', p_organization_id) #>> '{}')::boolean, false) then
    raise exception 'Sharing with people outside % is turned off here, so % cannot be given %.',
      coalesce(v_org, 'this organization'), v_mail, v_name
      using errcode = '42501',
            hint = 'An owner or an administrator of this organization turns it on once, for everybody, in the organization''s settings (custom/external_principal_enabled). Until then, share this table with a colleague inside the organization instead.';
  end if;
  if not custom.may_invite_outside(p_organization_id, p_table_id) then
    raise exception 'You cannot share % with people from outside %.', v_name, coalesce(v_org, 'this organization')
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

  v_perm := custom._share_write_person(p_organization_id, p_table_id, v_user, p_level, custom.query_principal());

  select l.means into v_means from custom.share_levels() l where l.level = p_level;
  select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
                  nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
                  nullif(btrim(u.email), ''), 'Somebody at ' || coalesce(v_org, 'an organization'))
    into v_who from auth.users u where u.id = custom.query_principal();
  v_sent := communication.notify_from_sql(
    p_organization_id, 'share.table_granted', v_user, v_mail, v_mail,
    jsonb_build_object('grant', jsonb_build_object(
      'table_id', p_table_id, 'organization_id', p_organization_id,
      'table', v_name, 'organization', coalesce(v_org, 'their organization'),
      'level', p_level::text, 'level_label', iam.level_label('table', p_level),
      'means', coalesce(v_means, 'read it'), 'sharer', v_who)),
    '/data-v2/' || p_table_id::text || '?org=' || p_organization_id::text,
    'custom_table', p_table_id,
    'tablegrant:' || p_table_id::text || ':' || v_user::text || ':' || p_level::text);

  return jsonb_build_object(
    'invited', false,
    'granted', true,
    'joined', false,
    'person', 'outside_account',
    'user_id', v_user,
    'email', v_mail,
    'table', v_name,
    'level', p_level::text,
    'level_label', iam.level_label('table', p_level),
    'permission_id', v_perm,
    'notified', v_sent -> 'queued',
    'say', format('%s already has an account, so they were given %s as a %s straight away and told so. They can open it now. They are not in %s — that table is all they see there.',
                  v_mail, v_name, p_level::text, coalesce(v_org, 'this organization')));
end
$fn$;

comment on function custom.table_share_outside_grant(uuid, uuid, text, public.permission_level) is
  'GRID-PRIMITIVES G14: share a table with a person by account id or email. An account outside the organization is granted at once (the permission row the accept path writes) and notified (share.table_granted); a member gets custom.share_grant; an address with no account gets custom.table_share_outside_invite''s invitation. Every rule of the invite door applies first: admin on the table, custom/external_principal_enabled, custom.may_invite_outside, and never more than the sharer holds. The outsider is never made a member.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values
  ('custom', 'table_share_outside_grant', 'p_organization_id uuid, p_table_id uuid, p_person text, p_level permission_level',
   array['uuid'::regtype, 'uuid'::regtype, 'text'::regtype, 'public.permission_level'::regtype]::oid[],
   'p_organization_id is checked by custom.assert_client_may_reach and custom.assert_store_door, and p_table_id by custom.assert_client_may_change at admin on the Table, before anything is read. p_person is resolved to an account (by id or email) only to decide which of three paths applies; the member and no-account paths are custom.share_grant and custom.table_share_outside_invite with every check of their own; the outside-account path applies the invite door''s rules (external_principal_enabled, may_invite_outside, the sharer''s own level) before it writes the one permission row the accept path writes.',
   'gridprim_a_known_outsider_is_granted_at_once.sql', null, true, false,
   jsonb_build_object('version', 1, 'declared_by', 'gridprim_a_known_outsider_is_granted_at_once.sql',
     'declared_at', '2026-09-24 lane GRID-PRIMITIVES',
     'arguments', jsonb_build_object(
       'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
         'check', 'this body decides it with custom.assert_client_may_reach(arg1), custom.assert_store_door(arg1) — the organization wall — a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.',
         'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
         'verified', '2026-09-24 lane GRID-PRIMITIVES — written with this body'),
       'p_table_id', jsonb_build_object('type', 'uuid', 'position', 2, 'entity', 'custom_record',
         'check', 'custom.assert_client_may_change(arg1, arg2, admin) before anything is read, then read only as a live Table of arg1; any other raises as an invented id does.',
         'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
         'verified', '2026-09-24 lane GRID-PRIMITIVES — written with this body'),
       'p_person', jsonb_build_object('type', 'text', 'position', 3, 'recipient', true,
         'check', 'an account id or an email: the RECIPIENT of the share, not a subject the caller reads. It is used only to choose the path; an unknown id raises 22023, an unknown email becomes an invitation.',
         'verified', '2026-09-24 lane GRID-PRIMITIVES — written with this body'),
       'p_level', jsonb_build_object('type', 'permission_level', 'position', 4, 'not_an_id', true,
         'check', 'never more than the sharer''s own effective level on the Table (42501).'))))
on conflict do nothing;
