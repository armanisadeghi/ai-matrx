-- access_ladder_t32d_one_share_writer.sql
-- based-on: public.may_manage_sharing(text, uuid) f074cc13c752fcbdf9a25fd5d74244f5797bcbb5d9406bca1120112712b7a5c4
-- based-on: public.share_resource_with_user(text, uuid, uuid, text) b789df374b940d27cd914a3237b595d8a8203e876c5676a62049749ed7dc2861
-- based-on: iam._share_with_audience(text, uuid, permission_level, uuid, text[], text) ddd80f20f2fe1bfe0fd8fab25ccba65822d84a82254018ab082b9efa5af7bc58
-- based-on: public.record_share_accept(text) 3e2b78fd0b45ecdee03a0386a81a3a39d2b4856f09f385507755a4321f2b786e
-- chair-step: drops iam._audience_grant (the duplicate person-share writer T-32 added) after its two callers move to iam.share_with_person in this same file; removes its declared-door row.
--
-- ACCESS LADDER T-32 — ONE PERSON-SHARE WRITER.
--
-- T-32 (group sharing) wrote its person shares through a second writer, iam._audience_grant,
-- that duplicated the row public.share_resource_with_user writes, because that function refused
-- to raise a level ("already has access") and only accepted a signed-in caller (auth.uid()).
-- Two writers of one row drift. This file makes ONE:
--
--   iam.share_with_person(type, id, person, level, actor, restore_removed)
--     the only body that writes a person share. It asks the actor's authority itself (the owner,
--     or Admin on the thing — iam.may_manage_sharing_as), so a server or automation caller carries
--     the operating person's authority instead of borrowing a session. It only ever RAISES a
--     level; a lower or equal ask changes nothing. A person whose access was removed (archived)
--     is given it back only on an explicit person share (restore_removed = true); group sharing
--     and emailed links pass false, so a removal is never undone behind the remover's back.
--     Pending (awaiting review) and rejected rows are never overridden by either.
--
--   public.share_resource_with_user  → the signed-in door: auth.uid() is the actor, restore = true.
--   iam._share_with_audience         → the group door: the sharing person is the actor, restore = false.
--   public.record_share_accept       → the emailed link: the invitation's author is the actor
--                                      (their authority is re-asked at accept time), restore = false.
--
--   public.may_manage_sharing(type, id) keeps its exact answer; it now asks
--   iam.may_manage_sharing_as(auth.uid(), type, id) so the rule lives once.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. THE AUTHORITY RULE, ONCE
-- ════════════════════════════════════════════════════════════════════════════
create or replace function iam.may_manage_sharing_as(
  p_actor uuid,
  p_resource_type text,
  p_resource_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_owner uuid;
begin
  if p_actor is null or p_resource_id is null then return false; end if;

  -- Rung one: the Owner (created_by on the row, the read public.is_resource_owner makes).
  v_owner := iam.owner_of(p_resource_type, p_resource_id);
  if v_owner is not null and v_owner = p_actor then return true; end if;

  -- Rung two: Admin ON THE THING. A record asks the store's own ladder; everything else asks the
  -- platform kernel. When the actor is not the signed-in caller (automation, an emailed link
  -- accepted by someone else), the base kernel answers: per-type wrappers such as
  -- files.has_access_for refuse to answer about anyone but the caller.
  if p_resource_type = 'record' then
    return custom.has_visibility(p_actor, 'record', p_resource_id, 'admin'::public.permission_level);
  end if;
  if p_actor is not distinct from (select auth.uid()) then
    return iam.has_access_for(p_actor, p_resource_type, p_resource_id, 'admin'::public.permission_level);
  end if;
  return iam.has_access_for_base(p_actor, p_resource_type, p_resource_id, 'admin'::public.permission_level);
exception when others then
  -- A question this cannot answer is answered NO.
  return false;
end;
$$;

create or replace function public.may_manage_sharing(p_resource_type text, p_resource_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog'
as $$
  select iam.may_manage_sharing_as((select auth.uid()), p_resource_type, p_resource_id)
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. THE ONE WRITER OF A PERSON SHARE
-- ════════════════════════════════════════════════════════════════════════════
create or replace function iam.share_with_person(
  p_resource_type text,
  p_resource_id uuid,
  p_target_user_id uuid,
  p_level public.permission_level,
  p_actor uuid,
  p_restore_removed boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_resolved record;
  v_type     text;
  v_row      iam.permissions;
  v_id       uuid;
begin
  if p_actor is null then
    return jsonb_build_object('success', false, 'error', 'Not authenticated');
  end if;
  if p_level is null then
    return jsonb_build_object('success', false, 'error', 'Invalid permission level');
  end if;
  if p_target_user_id is null then
    return jsonb_build_object('success', false, 'error', 'Say which person to share with.');
  end if;
  begin
    select * into strict v_resolved from public.resolve_shareable_resource(p_resource_type);
  exception when others then
    return jsonb_build_object('success', false, 'error', sqlerrm);
  end;
  v_type := v_resolved.resource_type;

  if not public.shareable_resource_exists(v_type, p_resource_id) then
    return jsonb_build_object('success', false, 'error', 'Resource not found');
  end if;
  if not iam.may_manage_sharing_as(p_actor, v_type, p_resource_id) then
    return jsonb_build_object('success', false, 'error',
      'You need Admin on this to decide who else may see it. Ask whoever holds it, or an owner of the organization.');
  end if;

  -- SCHEMA `custom` KEEPS ITS OWN DOOR (the store switch, VIS-31's external principal, VIS-34's
  -- both-sides wall). That door judges the signed-in caller, so it is only reached by one.
  if v_resolved.schema_name = 'custom' then
    if p_actor is distinct from (select auth.uid()) then
      return jsonb_build_object('success', false, 'error',
        'A record in a table is shared by a signed-in person from the table itself; it cannot be shared on someone''s behalf.');
    end if;
    return public.store_door_share(v_type, p_resource_id, 'person', p_target_user_id, p_level::text);
  end if;

  insert into iam.permissions
    (resource_type, resource_id, granted_to_user_id, permission_level, created_by, granted_via, status)
  values (v_type, p_resource_id, p_target_user_id, p_level, p_actor, 'share', 'active')
  on conflict (resource_type, resource_id, granted_to_user_id) do nothing
  returning id into v_id;
  if v_id is not null then
    return jsonb_build_object('success', true, 'outcome', 'shared', 'message', 'Successfully shared with user',
      'permission_id', v_id, 'permission_level', p_level::text, 'resource_type', v_type);
  end if;

  select * into v_row from iam.permissions p
   where p.resource_type = v_type and p.resource_id = p_resource_id and p.granted_to_user_id = p_target_user_id
   for update;

  if v_row.status = 'active' then
    if v_row.permission_level >= p_level then
      return jsonb_build_object('success', true, 'outcome', 'unchanged',
        'message', format('They already have %s access.', v_row.permission_level::text),
        'permission_id', v_row.id, 'permission_level', v_row.permission_level::text, 'resource_type', v_type);
    end if;
    update iam.permissions set permission_level = p_level where id = v_row.id;
    return jsonb_build_object('success', true, 'outcome', 'raised',
      'message', format('Raised from %s to %s.', v_row.permission_level::text, p_level::text),
      'permission_id', v_row.id, 'permission_level', p_level::text, 'resource_type', v_type);
  end if;

  if v_row.status = 'archived' and p_restore_removed then
    update iam.permissions
       set status = 'active', permission_level = p_level, created_by = p_actor, granted_via = 'share'
     where id = v_row.id;
    return jsonb_build_object('success', true, 'outcome', 'restored', 'message', 'Access given back',
      'permission_id', v_row.id, 'permission_level', p_level::text, 'resource_type', v_type);
  end if;

  return jsonb_build_object('success', false, 'outcome', 'removed', 'permission_id', v_row.id,
    'resource_type', v_type,
    'error', case v_row.status
      when 'pending'  then 'This person''s access is waiting for review, so it is not changed here.'
      when 'rejected' then 'This person''s access was declined in review, so it is not given here.'
      else 'This person''s access was removed earlier, so it is not given back automatically. Share with them yourself to give it back.'
    end);
end;
$$;

comment on function iam.share_with_person(text, uuid, uuid, public.permission_level, uuid, boolean) is
  'Access ladder T-32: THE one writer of a person share (iam.permissions). Asks the actor''s authority itself (owner or Admin on the thing), only raises a level, never overrides pending/rejected, and gives back removed (archived) access only when p_restore_removed. Callers: public.share_resource_with_user (signed-in), iam._share_with_audience (group), public.record_share_accept (emailed link).';

-- ════════════════════════════════════════════════════════════════════════════
-- 3. THE SIGNED-IN DOOR
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.share_resource_with_user(
  p_resource_type text,
  p_resource_id uuid,
  p_target_user_id uuid,
  p_permission_level text default 'viewer'::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('success', false, 'error', 'Not authenticated'); end if;
  if p_permission_level is null or p_permission_level not in ('viewer', 'commenter', 'editor', 'admin') then
    return jsonb_build_object('success', false, 'error', 'Invalid permission level');
  end if;
  return iam.share_with_person(p_resource_type, p_resource_id, p_target_user_id,
                               p_permission_level::public.permission_level, v_uid, true);
exception when others then
  return jsonb_build_object('success', false, 'error', sqlerrm);
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. THE GROUP DOOR — through the one writer
-- ════════════════════════════════════════════════════════════════════════════
create or replace function iam._share_with_audience(
  p_kind text,
  p_source_id uuid,
  p_level public.permission_level,
  p_actor uuid,
  p_exclude text[] default '{}',
  p_via text default 'person'
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_plan    jsonb := iam._audience_plan(p_kind, p_source_id, p_level, p_actor, p_exclude);
  p         jsonb;
  a         jsonb;
  v_org     uuid := (v_plan ->> 'organization_id')::uuid;
  v_sharer  text := coalesce(iam._person_name(p_actor), 'Someone');
  v_shared  text[] := '{}';
  v_invited text[] := '{}';
  v_refused text[] := '{}';
  v_told    int := 0;
  v_inv     jsonb;
  v_ans     jsonb;
  v_res     jsonb;
  v_got     jsonb;
  v_what    text;
  v_say     text;
begin
  for p in select * from jsonb_array_elements(v_plan -> 'people') loop
    if p ->> 'state' = 'will_share' then
      v_got := '[]'::jsonb;
      for a in select * from jsonb_array_elements(p -> 'missing') loop
        v_res := iam.share_with_person(a ->> 'resource_type', (a ->> 'resource_id')::uuid,
                                       (p ->> 'user_id')::uuid, p_level, p_actor, false);
        if coalesce((v_res ->> 'success')::boolean, false) then
          v_got := v_got || a;
        else
          v_refused := v_refused || format('%s for %s: %s', a ->> 'label',
                                           coalesce(p ->> 'name', p ->> 'email'), v_res ->> 'error');
        end if;
      end loop;
      if jsonb_array_length(v_got) = 0 then
        continue;
      end if;
      v_shared := v_shared || coalesce(p ->> 'name', p ->> 'email');
      select string_agg(x ->> 'label', ', ') into v_what from jsonb_array_elements(v_got) x;
      -- Tell them. A notice that cannot be queued never undoes the share; it is said out loud.
      begin
        v_ans := communication.notify_from_sql(
          v_org,
          'share.audience_shared',
          (p ->> 'user_id')::uuid,
          p ->> 'email',
          p ->> 'name',
          jsonb_build_object('grant', jsonb_build_object(
            'sharer', v_sharer,
            'title', v_plan ->> 'title',
            'what', v_what,
            'audience', v_plan ->> 'label',
            'means', iam.permission_means(p_level))),
          v_plan ->> 'href',
          v_plan ->> 'source_token',
          p_source_id,
          format('audience:%s:%s:%s:%s', p_kind, p_source_id, p ->> 'user_id', p_level));
        if jsonb_array_length(coalesce(v_ans -> 'queued', '[]'::jsonb)) > 0 then
          v_told := v_told + 1;
        end if;
      exception when others then
        insert into ops.system_error (kind, error_text, organization_id, user_id, source_app, source_feature, context)
        values ('audience_share_notice_failed',
                format('The share landed but its notice could not be queued: %s', sqlerrm),
                v_org, p_actor, 'database', 'sharing',
                jsonb_build_object('kind', p_kind, 'source_id', p_source_id, 'recipient', p ->> 'user_id',
                                   'remedy', 'The person already has access; tell them yourself or re-run once notifications are healthy.'));
      end;
    elsif p ->> 'state' = 'invite_by_email' then
      v_inv := iam._record_share_invite(v_plan, p ->> 'email', p_level, p_actor);
      v_invited := v_invited || (p ->> 'email');
    end if;
  end loop;

  v_say := case
    when cardinality(v_shared) = 0 and cardinality(v_invited) = 0 and cardinality(v_refused) = 0 then
      format('Nobody new to add — everyone in the %s who can be reached already has it or has an open email link.', v_plan ->> 'source_noun')
    else concat_ws(' ',
      case when cardinality(v_shared) > 0 then
        format('Shared with %s %s as %s.', cardinality(v_shared),
               case when cardinality(v_shared) = 1 then 'person' else 'people' end, p_level::text) end,
      case when cardinality(v_invited) > 0 then
        format('Invited %s by email — they get it when they open the link.', cardinality(v_invited)) end,
      case when cardinality(v_refused) > 0 then
        format('Not shared: %s.', array_to_string(v_refused, '; ')) end)
  end;
  if (v_plan -> 'counts' ->> 'unreachable')::int > 0 then
    v_say := v_say || format(' %s joined as a guest with no account or email address, so there is no way to reach them.',
                             v_plan -> 'counts' ->> 'unreachable');
  end if;

  return v_plan || jsonb_build_object(
    'via', p_via,
    'shared_with', to_jsonb(v_shared),
    'invited', to_jsonb(v_invited),
    'not_shared', to_jsonb(v_refused),
    'told', v_told,
    'say', v_say);
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. THE EMAILED LINK — through the one writer, with the inviter's authority re-asked
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.record_share_accept(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_me    uuid := auth.uid();
  v_mail  text;
  v_inv   iam.invitations;
  v_level public.permission_level;
  a       jsonb;
  v_res   jsonb;
begin
  if v_me is null then
    raise exception 'Sign in first, and then this link opens what was shared with you.' using errcode = '42501';
  end if;
  select lower(u.email) into v_mail from auth.users u where u.id = v_me;
  select * into v_inv from iam.invitations i
   where i.token = p_token and i.target_type = 'record_share'
     and i.deleted_at is null and i.status = 'pending'
     and (i.expires_at is null or i.expires_at > now())
     and (i.invited_user_id = v_me or lower(i.email) = v_mail)
   for update;
  if not found then
    raise exception 'This link cannot be used: it was withdrawn, already used, has run out, or was sent to a different email address than the one you are signed in with.'
      using errcode = '02000', hint = 'Ask whoever sent it to share it again, to the address you sign in with.';
  end if;
  v_level := coalesce(nullif(v_inv.metadata ->> 'level', ''), 'viewer')::public.permission_level;
  -- The invitation's author is the grant's author, and their authority is asked again now: a
  -- sharer who has since lost Admin cannot hand access out through an old link.
  for a in select * from jsonb_array_elements(coalesce(v_inv.metadata -> 'assets', '[]'::jsonb)) loop
    v_res := iam.share_with_person(a ->> 'resource_type', (a ->> 'resource_id')::uuid, v_me, v_level,
                                   v_inv.created_by, false);
    if not coalesce((v_res ->> 'success')::boolean, false) then
      raise exception 'This link could not open "%": %', coalesce(a ->> 'label', 'what was shared'), v_res ->> 'error'
        using errcode = '42501', hint = 'Ask whoever sent it to share it with you again.';
    end if;
  end loop;
  update iam.invitations
     set status = 'accepted', accepted_at = now(), invited_user_id = v_me, updated_by = v_me, updated_at = now()
   where id = v_inv.id;
  return jsonb_build_object(
    'accepted', true,
    'title', v_inv.metadata ->> 'title',
    'href', v_inv.metadata ->> 'href',
    'level', v_level::text,
    'say', format('%s is open to you — you %s.', coalesce(v_inv.metadata ->> 'title', 'It'), iam.permission_means(v_level)));
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. THE DUPLICATE GOES; THE NEW INTERNALS ARE DECLARED SERVER-ONLY
-- ════════════════════════════════════════════════════════════════════════════
delete from platform.client_callable_door
 where schema_name = 'iam' and function_name = '_audience_grant';
drop function iam._audience_grant(text, uuid, uuid, public.permission_level, uuid);

revoke all on function iam.share_with_person(text, uuid, uuid, public.permission_level, uuid, boolean) from public, anon, authenticated;
revoke all on function iam.may_manage_sharing_as(uuid, text, uuid) from public, anon, authenticated;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason,
   non_client_lane, signed_in_callers, anonymous_callers)
select 'iam', d.fn, pg_get_function_identity_arguments(p.oid), string_to_array(p.proargtypes::text, ' ')::oid[],
       'access_ladder_t32d_one_share_writer.sql', d.reason,
       'server_only: called only from definer doors (share_resource_with_user, share_with_audience, record_share_accept, may_manage_sharing) and the meet end/recording triggers; no client ever calls it.',
       false, false
  from (values
    ('share_with_person', 'The one person-share writer. Refuses unless p_actor owns the thing or holds Admin on it (iam.may_manage_sharing_as), decided inside before any write.'),
    ('may_manage_sharing_as', 'A read-only yes/no about p_actor''s authority; answers no on any error.')
  ) d(fn, reason)
  join pg_proc p on p.proname = d.fn and p.pronamespace = 'iam'::regnamespace
 where not exists (select 1 from platform.client_callable_door c
                    where c.schema_name = 'iam' and c.function_name = d.fn);
