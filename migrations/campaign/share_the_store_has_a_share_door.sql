-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- SHARE — THE STORE HAS A SHARE DOOR.
--
-- Until today the record store had thirty-odd client doors and not one of them was "let
-- somebody else in". Reading, writing, importing, exporting, commenting, restoring, publishing
-- a form, even "who could see this on a date" — all reachable. Sharing: nothing. The only way a
-- grant on a record ever reached `iam.permissions` was the platform's generic
-- `public.share_resource_with_user`, which gates on
--     v_owner_id = auth.uid()
-- i.e. `created_by` and nothing else. Measured live 2026-09-19 in a rolled-back transaction:
-- a person holding `admin` ON THE RECORD, which VIS-17's one ladder defines as "can change it
-- and decide who else may", is told *"You do not own this resource"*; `get_resource_permissions`
-- returns them zero rows, so they cannot even SEE who has access; and `revoke_resource_access`
-- refuses them too. One rung of the ladder existed in the sharing surface — Owner — and the
-- rung whose entire definition is "decides who else may" did not.
--
-- THIS FILE IS THE DOOR, and it is the same door for a Record and for a Table, because in this
-- store a Table IS a record (`custom.record` rows whose table_id is the Table kernel). One
-- function, one ladder, one grant table:
--
--   custom.share_access(org, subject)        who has access and WHY — direct, through the
--                                            thing that carries it, through the organization's
--                                            own member default, through the world lane, and
--                                            the Owner rung itself
--   custom.share_grant(org, subject, …)      let a person or another organization in, at a level
--   custom.share_revoke(org, subject, …)     take it back
--   custom.share_lane_set(org, subject, …)   move the thing between the lanes
--   custom.share_people(org, query, limit)   the organization's own members, for the picker
--   custom.share_levels()                    the four rungs, each with the sentence it means
--   custom.share_lanes()                     the four lanes, each with the sentence it means
--
-- WHO MAY. `custom.assert_client_may_change(…, 'admin')` — the SAME assertion every write door
-- in this store uses, at the rung VIS-17 defines as the one that decides who else may. So the
-- Owner shares (the Owner rung sits above admin and `custom.effective_level` answers `admin`
-- for them), an organization admin shares, somebody granted `admin` on the record shares, and
-- an editor does not. Nothing here re-implements an access question.
--
-- HISTORY. Nothing in this file writes a history row: `zzz_history_grant_capture` on
-- `iam.permissions` already does, in the same transaction as the grant, and lane STORE-ASOF
-- fixed it this morning to file the row under the RECORD's organization. Every door below
-- writes through that one table, so every share, every level change and every revoke is in
-- `history.row_versions` the instant it commits, and `custom.visibility_as_of` replays it with
-- the interval the access was held. A second history would be a second truth.
--
-- THE FOUR LANES, and why four names over three lanes. VIS-N-4 is the law: three lanes — mine,
-- my organization, world — plus a separate `discoverable` flag, with "community" being the
-- world lane rather than a fourth class. What a person picks from is still four choices,
-- because "anyone with the link" and "listed for everyone" are different decisions to make and
-- VIS-N-6 keeps them separate settings. So `custom.share_lanes()` offers mine · organization ·
-- community · world, and says in its own `lane` column that the last two are the SAME lane with
-- `discoverable` false and true. The screen gets four choices; the data keeps three lanes.
-- The world half runs `iam.publish_to_world`, which refuses today because
-- `custom/world_publish_enabled` resolves false — out loud, with the switch named, never a
-- dead control.

-- ─────────────────────────────────────────────────────────────────── the vocabulary, first

create or replace function custom.share_levels()
returns table (level public.permission_level, ordinal integer, label text, means text)
language sql
stable
security definer
set search_path to 'pg_catalog'
as $$
  -- VIS-17's ONE ladder, read from the enum rather than listed, and VIS-N-2's scope-qualified
  -- label: "Admin" never stands alone on an access surface.
  select l.level, l.ordinal, iam.level_label('record', l.level), l.noun
    from iam.content_levels() l
   order by l.ordinal;
$$;

create or replace function custom.share_lanes()
returns table (choice text, lane text, discoverable boolean, label text, means text)
language sql
stable
security definer
set search_path to 'pg_catalog'
as $$
  -- VIS-N-4 + VIS-N-6. Four choices over three lanes: `community` and `world` are one lane and
  -- differ only in `discoverable`, and this table says so rather than inventing a fourth class.
  select * from (values
    ('mine',         'mine',         false, 'Only people I share it with',
     'Nobody reaches this but its Owner and whoever holds a grant on it or on something that carries it.'),
    ('organization', 'organization', false, 'Everyone in this organization',
     'Every member of the organization reaches it at the level the organization''s member default sets.'),
    ('community',    'world',        false, 'Anyone with the link',
     'Out in the world, but not listed anywhere: findable by the link and by nothing else (VIS-N-6''s unlisted).'),
    ('world',        'world',        true,  'Anyone, and listed',
     'Out in the world and discoverable: it may be listed and searched (VIS-N-4''s discoverable flag).')
  ) as t(choice, lane, discoverable, label, means);
$$;

-- ─────────────────────────────────────────────────────────── the people picker (org members)

create or replace function custom.share_people(
  p_organization_id uuid,
  p_query           text    default null,
  p_limit           integer default 25
)
returns table (
  user_id        uuid,
  email          text,
  display_name   text,
  membership     text,
  already_at     public.permission_level
)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
begin
  -- The organization wall first, exactly as every other door in this store. A picker that
  -- listed another organization's people would BE the leak.
  perform custom.assert_client_may_reach(p_organization_id, 'share_people');

  return query
  select m.user_id,
         u.email::text,
         coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''),
                  nullif(u.raw_user_meta_data ->> 'full_name', ''),
                  split_part(u.email::text, '@', 1))::text,
         m.role::text,
         null::public.permission_level
    from iam.organization_member m
    join auth.users u on u.id = m.user_id
   where m.organization_id = p_organization_id
     and (p_query is null or btrim(p_query) = ''
          or u.email::text ilike '%' || btrim(p_query) || '%'
          or coalesce(u.raw_user_meta_data ->> 'display_name', '') ilike '%' || btrim(p_query) || '%'
          or coalesce(u.raw_user_meta_data ->> 'full_name', '')   ilike '%' || btrim(p_query) || '%')
   order by 3
   limit greatest(1, least(coalesce(p_limit, 25), 200));
end;
$$;

-- ───────────────────────────────────────────────────── who has access, and WHY (the whole point)

create or replace function custom.share_access(p_organization_id uuid, p_subject_id uuid)
returns table (
  principal_kind  text,
  principal_id    uuid,
  principal_label text,
  level           public.permission_level,
  reason          text,
  reason_detail   text,
  via_type        text,
  via_id          uuid,
  revocable       boolean
)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_me       uuid := custom.query_principal();
  v_row      custom.record;
  v_manage   boolean;
  v_default  public.permission_level;
  v_lane     text;
  v_org_name text;
begin
  -- Seeing the list needs only the level that opens the thing; CHANGING it needs admin, and
  -- that is what `revocable` says per row rather than emptying the list (which is what the
  -- platform's generic RPC does today, and why an admin saw nothing at all).
  perform custom.assert_client_may_open(p_organization_id, p_subject_id, 'share_access', 'viewer', 'record');

  select r.* into v_row
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_subject_id;
  if not found then
    raise exception 'That record is not in this organization, so there is nobody to list.'
      using errcode = '02000';
  end if;

  v_manage := v_me is not null
              and custom.has_visibility(v_me, 'record', p_subject_id, 'admin'::public.permission_level);
  select o.name into v_org_name from iam.organizations o where o.id = p_organization_id;

  -- ── 1. THE OWNER. VIS-25: the top rung, held as `created_by` and not as a grant row, so it
  -- is never revocable here — ownership transfers, it is not taken away in a share dialog.
  if v_row.created_by is not null then
    return query
    select 'person'::text,
           v_row.created_by,
           coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''),
                    nullif(u.raw_user_meta_data ->> 'full_name', ''),
                    u.email::text, v_row.created_by::text),
           iam.top_content_level(),
           'owner'::text,
           'Created it. The Owner rung sits above Admin and is held on the record itself, so it '
             || 'is transferred rather than revoked.',
           null::text, null::uuid, false
      from auth.users u where u.id = v_row.created_by;
  end if;

  -- ── 2. DIRECT GRANTS on this very thing — the rows this dialog writes and takes back.
  return query
  select case when p.is_public then 'everyone'
              when p.granted_to_organization_id is not null then 'organization'
              else 'person' end::text,
         coalesce(p.granted_to_organization_id, p.granted_to_user_id),
         case when p.is_public then 'Anyone with access to the link'
              when p.granted_to_organization_id is not null
                then coalesce(o.name, p.granted_to_organization_id::text)
              else coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''),
                            nullif(u.raw_user_meta_data ->> 'full_name', ''),
                            u.email::text, p.granted_to_user_id::text) end::text,
         p.permission_level,
         'direct'::text,
         case when p.granted_to_organization_id is not null and p.granted_to_organization_id <> p_organization_id
                then 'Shared with another organization (VIS-23: a cross-organization share is a grant whose principal is that organization).'
              when p.granted_to_organization_id is not null
                then 'Shared with everyone in ' || coalesce(o.name, 'this organization') || '.'
              when p.is_public then 'Open to anyone who reaches it.'
              else 'Shared with this person directly.' end
           || case when p.expires_at is not null then ' Expires ' || to_char(p.expires_at, 'YYYY-MM-DD') || '.' else '' end,
         null::text, null::uuid,
         v_manage
    from iam.permissions p
    left join auth.users        u on u.id = p.granted_to_user_id
    left join iam.organizations o on o.id = p.granted_to_organization_id
   where p.resource_type = 'record'
     and p.resource_id   = p_subject_id
     and p.status <> 'rejected'
     and (p.expires_at is null or p.expires_at > now())
   order by p.created_at;

  -- ── 3. THE ORGANIZATION'S OWN MEMBER DEFAULT (VIS-19 / VIS-33). Not a grant row and not
  -- revocable from here: it is the organization's setting, and the remedy is the setting.
  if iam.member_lane_open(p_organization_id) then
    v_default := iam.member_default_level(p_organization_id, v_row.table_id);
    if v_default is not null then
      return query
      select 'organization'::text, p_organization_id,
             coalesce(v_org_name, 'this organization'),
             v_default,
             'organization default'::text,
             'Every member of ' || coalesce(v_org_name, 'this organization') || ' reaches this without '
               || 'anybody sharing it, because the organization''s member default says so. Change it in '
               || 'the organization''s settings (custom/member_default_visibility, custom/member_default_level) '
               || '— there is no grant here to revoke.',
             null::text, null::uuid, false;
    end if;
  end if;

  -- ── 4. CONTAINMENT (VIS-1 / VIS-5 / VIS-3): whatever carries this thing carries access to it,
  -- at no more than the carrying link conveys. The remedy is on the container, so each row names
  -- the container and is not revocable here.
  return query
  select 'via'::text,
         a.container_id,
         coalesce(platform.entity_title(a.container_type, a.container_id), a.container_id::text),
         a.max_level,
         'containment'::text,
         'Anyone who reaches ' || coalesce(platform.entity_title(a.container_type, a.container_id), 'the thing that carries this')
           || ' reaches this too, at up to ' || lower(iam.level_label('record', a.max_level))
           || '. Take it out of there, or change what that link conveys — there is no grant here to revoke.',
         a.container_type, a.container_id, false
    from custom.visibility_ancestors('record', p_subject_id) a
   order by a.depth, 3;

  -- ── 5. THE LANE (VIS-N-4). Only said out loud when it is not the closed default.
  v_lane := iam.lane_of('record', p_subject_id);
  if v_lane is distinct from 'mine' then
    return query
    select 'everyone'::text, null::uuid,
           case when c.discoverable then 'Anyone, and listed' else 'Anyone with the link' end,
           'viewer'::public.permission_level,
           'world lane'::text,
           case when c.discoverable
                then 'Published to the world and discoverable: it may be listed and searched.'
                else 'Published to the world but unlisted: reachable by its link and by nothing else.' end,
           null::text, null::uuid, v_manage
      from iam.content_lane c
     where c.resource_type = 'record' and c.resource_id = p_subject_id;
  end if;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────── letting somebody in

create or replace function custom.share_grant(
  p_organization_id uuid,
  p_subject_id      uuid,
  p_principal_kind  text,
  p_principal_id    uuid,
  p_level           public.permission_level default 'viewer'::public.permission_level
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
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
    -- VIS-31: a person outside the organization is an EXTERNAL principal, and that lane is off.
    -- Refuse by name rather than writing a grant that confers nothing.
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
$$;

-- ──────────────────────────────────────────────────────────────────────── taking it back again

create or replace function custom.share_revoke(
  p_organization_id uuid,
  p_subject_id      uuid,
  p_principal_kind  text,
  p_principal_id    uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
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

  delete from iam.permissions p
   where p.resource_type = 'record' and p.resource_id = p_subject_id
     and ((v_kind in ('person', 'user')  and p.granted_to_user_id         = p_principal_id)
       or (v_kind = 'organization'       and p.granted_to_organization_id = p_principal_id)
       or (v_kind = 'everyone'           and p.is_public));
  get diagnostics v_gone = row_count;

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
$$;

-- ──────────────────────────────────────────────────────────────────────────────── the lanes

create or replace function custom.share_lane_set(
  p_organization_id uuid,
  p_subject_id      uuid,
  p_choice          text,
  p_level           public.permission_level default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_choice record;
  v_row    custom.record;
  v_word   text;
  v_level  public.permission_level;
begin
  perform custom.assert_store_door(p_organization_id, 'share_lane_set');
  perform custom.assert_client_may_change(p_organization_id, p_subject_id, 'share_lane_set',
                                          'admin'::public.permission_level, 'record');

  select r.* into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_subject_id;
  if not found then
    raise exception 'There is no such record in this organization.' using errcode = '02000';
  end if;
  v_word := case when v_row.table_id = custom.table_kernel_id() then 'table' else 'record' end;

  select * into v_choice from custom.share_lanes() l where l.choice = lower(btrim(coalesce(p_choice, '')));
  if not found then
    raise exception 'There is no lane called "%".', coalesce(p_choice, '<nothing>')
      using errcode = '22023',
            hint = 'The lanes are mine, organization, community and world — call custom.share_lanes() for what each one means.';
  end if;

  if v_choice.lane = 'world' then
    -- Delegated whole: the world lane has its own act, its own admission and its own switch,
    -- and this door does not get a second copy of any of them (VIS-N-5, VIS-N-7).
    perform iam.publish_to_world('record', p_subject_id, p_organization_id, v_choice.discoverable);
    return jsonb_build_object('lane', v_choice.choice, 'message', v_choice.label || '.');
  end if;

  if v_choice.choice = 'organization' then
    v_level := coalesce(p_level, iam.member_default_level(p_organization_id, v_row.table_id),
                        'viewer'::public.permission_level);
    perform custom.share_grant(p_organization_id, p_subject_id, 'organization', p_organization_id, v_level);
  else
    delete from iam.permissions p
     where p.resource_type = 'record' and p.resource_id = p_subject_id
       and (p.granted_to_organization_id = p_organization_id or p.is_public);
    v_level := null;
  end if;

  insert into iam.content_lane as c
        (resource_type, resource_id, organization_id, lane, discoverable, unlisted)
  values ('record', p_subject_id, p_organization_id, 'mine', false, true)
  on conflict (resource_type, resource_id) do update
     set lane = 'mine', discoverable = false, unlisted = true;

  return jsonb_build_object(
    'lane', v_choice.choice,
    'level', v_level::text,
    'message', case when v_choice.choice = 'organization'
                    then format('Everyone in this organization now reaches this %s at %s.',
                                v_word, lower(iam.level_label(v_word, v_level)))
                    else format('Only the people it is shared with reach this %s now.', v_word) end);
end;
$$;

-- ───────────────────────────────────────────────────────────────── the doors, declared in data

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, signed_in_callers, anonymous_callers)
select d.schema_name, d.function_name,
       iam.door_identity_args(d.fn), d.argtypes, d.reason,
       'migrations/campaign/share_the_store_has_a_share_door.sql (lane SHARE)', true, false
  from (values
    ('custom', 'share_levels',  'custom.share_levels()'::regprocedure, array[]::oid[],
     'Takes no id at all: it reads the permission_level enum and returns the four rungs with the sentence each one means. Nothing to check a caller against.'),
    ('custom', 'share_lanes',   'custom.share_lanes()'::regprocedure, array[]::oid[],
     'Takes no id at all: it returns the four lane choices and the sentence each one means. Nothing to check a caller against.'),
    ('custom', 'share_people',  'custom.share_people(uuid, text, integer)'::regprocedure,
     array['uuid'::regtype::oid, 'text'::regtype::oid, 'int4'::regtype::oid],
     'p_organization_id is checked by custom.assert_client_may_reach before a single row is read, so only a member of that organization ever sees its people; NULL raises 22004 there rather than listing everybody. p_query and p_limit are a filter and a cap, never an identity, and the cap is clamped to 200.'),
    ('custom', 'share_access',  'custom.share_access(uuid, uuid)'::regprocedure,
     array['uuid'::regtype::oid, 'uuid'::regtype::oid],
     'p_organization_id and p_subject_id go through custom.assert_client_may_open at viewer — the same one ladder every read door in this store asks — so a caller who cannot open the record cannot list who reaches it; a NULL organization raises 22004 and a record in another organization raises the same 02000 as one that does not exist. Grantee identities are shown to anyone who may open the thing (that is what a share list IS), and the revocable flag, not the row set, is what admin decides.'),
    ('custom', 'share_grant',   'custom.share_grant(uuid, uuid, text, uuid, permission_level)'::regprocedure,
     array['uuid'::regtype::oid, 'uuid'::regtype::oid, 'text'::regtype::oid, 'uuid'::regtype::oid, 'permission_level'::regtype::oid],
     'p_organization_id and p_subject_id go through custom.assert_store_door and custom.assert_client_may_change at admin — VIS-17''s rung that decides who else may — so only somebody who already holds admin on the thing can grant on it, and NULL on either raises rather than defaulting. p_principal_id is checked against membership of p_organization_id for a person (VIS-31''s external lane is closed) and against custom.cross_organization_links_open for an organization (VIS-34''s both-sides rule). p_level must be one of the four enum rungs.'),
    ('custom', 'share_revoke',  'custom.share_revoke(uuid, uuid, text, uuid)'::regprocedure,
     array['uuid'::regtype::oid, 'uuid'::regtype::oid, 'text'::regtype::oid, 'uuid'::regtype::oid],
     'p_organization_id and p_subject_id go through custom.assert_store_door and custom.assert_client_may_change at admin, so only somebody holding admin on the thing may take a share back; NULL raises there. p_principal_id names whose grant row to delete and reaches nothing outside iam.permissions rows for this one record, so it can neither name nor touch anything the caller could not already see.'),
    ('custom', 'share_lane_set','custom.share_lane_set(uuid, uuid, text, permission_level)'::regprocedure,
     array['uuid'::regtype::oid, 'uuid'::regtype::oid, 'text'::regtype::oid, 'permission_level'::regtype::oid],
     'p_organization_id and p_subject_id go through custom.assert_store_door and custom.assert_client_may_change at admin; NULL raises there. p_choice is matched against custom.share_lanes() and anything else raises 22023. The world half is delegated whole to iam.publish_to_world, which applies VIS-N-5''s top-level requirement, the custom/world_publish_enabled switch and VIS-N-7''s admission itself — this door adds no second copy of any of them.')
  ) as d(schema_name, function_name, fn, argtypes, reason)
on conflict (schema_name, function_name, identity_argtypes) do nothing;

-- Every closing REVOKE in this schema takes every declared door's grant with it (W4-DOOR's
-- finding, measured twice on 2026-09-18), and the event trigger that fires on each CREATE above
-- takes the default PUBLIC grant back the same way. `select custom.reopen_declared_doors();` is
-- what puts back exactly what this register declares and nothing else; it is a GRANT, which the
-- additive allow-list refuses by name and correctly so, and it is run immediately after this file
-- lands (it is idempotent, it reads the register, and it opens nothing the register does not).
