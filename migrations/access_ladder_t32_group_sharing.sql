-- access_ladder_t32_group_sharing.sql
-- based-on: iam.invitation_has_its_own_door(text) 328224bec99f28f36e97b883f8110851fe80da7656af1abc23e857beeeeb41a0
-- chair-step: the only non-additive statements are DROP TRIGGER IF EXISTS on two triggers this file creates (none exist before it) and REVOKEs that remove default EXECUTE from functions this file creates; nothing existing is dropped or narrowed.
--
-- ACCESS LADDER T-32 — GROUP SHARING: "Share with everyone in …".
--
-- Arman, 2026-09-28: a person's own audio transcripts are Private, "but … when someone has a
-- meeting, it's easy to share the recording and notes with a single click … a group of people
-- with something in common … one click to share a set of assets with all of them."
--
-- THE MODEL (Google Meet + Gemini notes, with Zoom/Teams/Otter/Fireflies agreeing): the people a
-- meeting belongs to are its invitees plus everyone who attended; its recording, transcript and
-- notes are shared with them as ORDINARY per-person shares at view by default; a setting cascade
-- (system -> organization -> person) decides whether that is offered or done automatically when
-- the meeting ends. Here the default is OFFERED, not auto-shared.
--
-- THE PRIMITIVE. An AUDIENCE is a set of people derived from a record they share (a meeting's
-- attendees today; a thread's participants, a project's members, an event's attendees later).
-- ONE list, `iam.audience_kinds()`, names each kind with three functions: describe (organization,
-- title, link), members (who) and assets (which records). Adding an audience = one row there + its
-- three functions. The doors, the preview, the share, the email invitation, the notices, the
-- agent operation and the UI dialog are all generic and need nothing new.
--
-- WHAT A SHARE WRITES. Every recipient with an account gets an ordinary person share: one
-- `iam.permissions` row per record, `granted_via = 'share'`, the same row `share_resource_with_user`
-- writes — so the rest of the platform needs nothing new. Rows only ever RISE (running it twice
-- adds nobody twice; a lower level never replaces a higher one). A grant the owner archived or a
-- moderator rejected is NOT re-activated by a bulk share (the person is shown as "removed earlier").
-- A person with an email and no account gets ONE `iam.invitations` row (target_type
-- 'record_share') delivered by email; accepting writes the same person shares.
--
-- AUTHORITY. Whoever holds Admin on the SOURCE record (its owner, or Admin on it — for a meeting,
-- the host or a co-host) may share the source's declared assets with its audience: the recording
-- belongs to the meeting the way its transcript and notes do. A share never names an organization.
--
-- Law: common-docs/policies/access-ladder.md ("Sharing sits outside the ladder").


-- ════════════════════════════════════════════════════════════════════════════
-- 1. THE ONE LIST OF AUDIENCES
-- ════════════════════════════════════════════════════════════════════════════
create or replace function iam.audience_kinds()
returns table (
  kind text,
  source_token text,
  source_noun text,
  label text,
  describe_fn text,
  members_fn text,
  assets_fn text,
  level_knob_feature text,
  level_knob_key text,
  offer_knob_feature text,
  offer_knob_key text
)
language sql
immutable
set search_path to ''
as $$
  -- Access ladder T-32: THE ONE LIST of audiences. A kind added here names an active
  -- platform.entity_types token and three functions with these exact shapes:
  --   describe(uuid) -> (organization_id uuid, title text, href text)
  --   members(uuid)  -> (user_id uuid, email text, display_name text, why text)
  --   assets(uuid)   -> (resource_type text, resource_id uuid, label text)
  values
    ('meeting', 'meet_meeting', 'meeting', 'everyone in the meeting',
     'communication.meet_audience_source',
     'communication.meet_audience_members',
     'communication.meet_audience_assets',
     'meet', 'share_with_attendees_permission',
     'meet', 'share_with_attendees_after_meeting')
$$;

comment on function iam.audience_kinds() is
  'Access ladder T-32: the one list of audiences (sets of people derived from a record they share) for "Share with everyone in …". One row + three functions per kind.';

-- ════════════════════════════════════════════════════════════════════════════
-- 2. THE MEETING AUDIENCE
-- ════════════════════════════════════════════════════════════════════════════
create or replace function communication.meet_audience_source(p_id uuid)
returns table (organization_id uuid, title text, href text)
language sql
stable
set search_path to ''
as $$
  select m.organization_id,
         coalesce(nullif(btrim(m.title), ''), 'Untitled meeting'),
         '/meetings/' || m.id::text || '?tab=record'
    from communication.meet_meetings m
   where m.id = p_id and m.deleted_at is null
$$;

create or replace function communication.meet_audience_members(p_id uuid)
returns table (user_id uuid, email text, display_name text, why text)
language sql
stable
set search_path to ''
as $$
  -- Everyone the meeting belongs to: the host, every invitee (account or email), and everyone
  -- who actually joined (signed in or as a guest). Agents (the note-taker) are never people.
  with raw as (
    select m.host_user_id as uid, null::text as mail, null::text as name, 'host'::text as why, 4 as rank
      from communication.meet_meetings m
     where m.id = p_id and m.host_user_id is not null
    union all
    select coalesce(i.invitee_user_id,
                    (select u.id from auth.users u
                      where lower(u.email) = lower(i.email)
                      order by u.created_at limit 1)),
           lower(nullif(btrim(i.email), '')),
           nullif(btrim(i.display_name), ''),
           case when i.role = 'cohost' then 'co-host' else 'invited' end,
           case when i.role = 'cohost' then 3 else 1 end
      from communication.meet_invitees i
     where i.meeting_id = p_id and i.deleted_at is null
    union all
    select p.participant_user_id, null, nullif(btrim(p.display_name), ''),
           case when p.participant_user_id is null then 'attended as a guest' else 'attended' end,
           2
      from communication.meet_participants p
     where p.meeting_id = p_id
       and not coalesce(p.is_agent, false)
       and p.joined_at is not null
  ),
  keyed as (
    select r.*, coalesce(r.uid::text, r.mail, 'guest:' || lower(coalesce(r.name, 'guest'))) as k
      from raw r
  ),
  folded as (
    select k,
           (array_agg(uid) filter (where uid is not null))[1] as uid,
           max(mail) as mail,
           (array_agg(name order by rank desc) filter (where name is not null))[1] as name,
           (array_agg(why order by rank desc))[1] as why
      from keyed
     group by k
  )
  select f.uid,
         coalesce(f.mail, lower(u.email)),
         coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
                  nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
                  f.name,
                  lower(u.email),
                  f.mail,
                  'Guest'),
         f.why
    from folded f
    left join auth.users u on u.id = f.uid
$$;

create or replace function communication.meet_audience_assets(p_id uuid)
returns table (resource_type text, resource_id uuid, label text)
language sql
stable
set search_path to ''
as $$
  -- The meeting record carries its children (transcript, notes, summary, saved chat); each
  -- landed recording is a file of its own.
  select 'meet_meeting'::text, m.id, 'Notes, summary and transcript'::text
    from communication.meet_meetings m
   where m.id = p_id and m.deleted_at is null
  union all
  select 'file'::text, r.file_id, coalesce(nullif(btrim(r.title), ''), 'Recording')
    from communication.meet_recordings r
   where r.meeting_id = p_id
     and r.file_id is not null
     and r.deleted_at is null
     and r.state = 'available'
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. THE CORE (internal; never client-callable)
-- ════════════════════════════════════════════════════════════════════════════

-- The words a person reads for each Permission — one place.
create or replace function iam.permission_means(p_level public.permission_level)
returns text
language sql
immutable
set search_path to ''
as $$
  select case p_level
           when 'viewer' then 'can open and read it'
           when 'commenter' then 'can read and comment on it'
           when 'editor' then 'can read and change it'
           when 'admin' then 'can read, change and share it'
         end
$$;

create or replace function iam._audience_plan(
  p_kind text,
  p_source_id uuid,
  p_level public.permission_level,
  p_actor uuid,
  p_exclude text[] default '{}'
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  k         record;
  v_org     uuid;
  v_title   text;
  v_href    text;
  v_assets  jsonb := '[]'::jsonb;
  v_people  jsonb := '[]'::jsonb;
  a         record;
  m         record;
  asset     jsonb;
  v_missing jsonb;
  v_removed boolean;
  v_state   text;
  v_key     text;
  v_ex      text[] := coalesce(array(select lower(x) from unnest(p_exclude) x), '{}');
  v_counts  jsonb;
begin
  select * into k from iam.audience_kinds() ak where ak.kind = p_kind;
  if not found then
    raise exception 'There is no audience called "%". The audiences are: %.',
      p_kind, (select string_agg(ak.kind, ', ') from iam.audience_kinds() ak)
      using errcode = '22023';
  end if;
  if p_source_id is null then
    raise exception 'Say which % to share from.', k.source_noun using errcode = '22023';
  end if;
  if p_level is null then
    raise exception 'A share has to say what the people may do: viewer, commenter, editor or admin.'
      using errcode = '22023';
  end if;
  if p_actor is null then
    raise exception 'Sign in first — a share is made by a person.' using errcode = '42501';
  end if;

  -- AUTHORITY FIRST, so a foreign id and an invented one get the same answer.
  if not (coalesce(iam.owner_of(k.source_token, p_source_id) = p_actor, false)
          or iam.has_access_for(p_actor, k.source_token, p_source_id, 'admin'::public.permission_level)) then
    raise exception 'Only the person who owns this %, or someone with Admin on it, can share it with %.',
      k.source_noun, k.label
      using errcode = '42501',
            hint = format('Ask the %s''s owner (for a meeting, its host or a co-host) to share it.', k.source_noun);
  end if;

  execute format('select organization_id, title, href from %s($1)', k.describe_fn)
    into v_org, v_title, v_href using p_source_id;
  if v_org is null then
    raise exception 'This % is no longer there, so there is nothing to share.', k.source_noun
      using errcode = 'P0002';
  end if;

  for a in execute format('select resource_type, resource_id, label from %s($1)', k.assets_fn)
             using p_source_id loop
    v_assets := v_assets || jsonb_build_object(
      'resource_type', a.resource_type, 'resource_id', a.resource_id, 'label', a.label);
  end loop;

  for m in execute format('select user_id, email, display_name, why from %s($1)', k.members_fn)
             using p_source_id loop
    if m.user_id is not null and m.user_id = p_actor then
      continue;  -- the person sharing
    end if;
    v_key := coalesce(m.user_id::text, m.email, 'guest:' || lower(coalesce(m.display_name, 'guest')));
    v_missing := '[]'::jsonb;
    v_removed := false;

    if m.user_id is not null then
      for asset in select * from jsonb_array_elements(v_assets) loop
        if not iam.has_access_for(m.user_id, asset ->> 'resource_type',
                                  (asset ->> 'resource_id')::uuid, p_level) then
          if exists (select 1 from iam.permissions p
                      where p.resource_type = asset ->> 'resource_type'
                        and p.resource_id = (asset ->> 'resource_id')::uuid
                        and p.granted_to_user_id = m.user_id
                        and p.status in ('archived', 'rejected')) then
            v_removed := true;
          else
            v_missing := v_missing || asset;
          end if;
        end if;
      end loop;
      v_state := case
        when lower(v_key) = any (v_ex) then 'left_out'
        when v_removed then 'removed'
        when jsonb_array_length(v_missing) = 0 then 'has_access'
        else 'will_share' end;
    elsif m.email is not null then
      v_state := case
        when lower(v_key) = any (v_ex) then 'left_out'
        when exists (select 1 from iam.invitations i
                      where i.target_type = 'record_share'
                        and i.target_id = p_source_id
                        and lower(i.email) = m.email
                        and i.deleted_at is null
                        and i.status = 'pending'
                        and (i.expires_at is null or i.expires_at > now())
                        and coalesce((i.metadata ->> 'level')::public.permission_level, 'viewer') >= p_level)
          then 'invited'
        else 'invite_by_email' end;
      v_missing := v_assets;
    else
      v_state := 'unreachable';
    end if;

    v_people := v_people || jsonb_build_object(
      'key', v_key,
      'user_id', m.user_id,
      'email', m.email,
      'name', m.display_name,
      'why', m.why,
      'state', v_state,
      'missing', v_missing);
  end loop;

  select jsonb_build_object(
           'will_share',      count(*) filter (where p ->> 'state' = 'will_share'),
           'invite_by_email', count(*) filter (where p ->> 'state' = 'invite_by_email'),
           'invited',         count(*) filter (where p ->> 'state' = 'invited'),
           'has_access',      count(*) filter (where p ->> 'state' = 'has_access'),
           'removed',         count(*) filter (where p ->> 'state' = 'removed'),
           'left_out',        count(*) filter (where p ->> 'state' = 'left_out'),
           'unreachable',     count(*) filter (where p ->> 'state' = 'unreachable'))
    into v_counts
    from jsonb_array_elements(v_people) p;

  return jsonb_build_object(
    'kind', k.kind,
    'label', k.label,
    'source_token', k.source_token,
    'source_noun', k.source_noun,
    'source_id', p_source_id,
    'organization_id', v_org,
    'title', v_title,
    'href', v_href,
    'level', p_level::text,
    'means', iam.permission_means(p_level),
    'assets', v_assets,
    'people', v_people,
    'counts', v_counts);
end;
$$;

-- The one writer of an audience grant: the row share_resource_with_user writes, raise-only,
-- never re-activating a grant somebody archived or rejected.
create or replace function iam._audience_grant(
  p_resource_type text,
  p_resource_id uuid,
  p_user_id uuid,
  p_level public.permission_level,
  p_actor uuid
)
returns void
language sql
security definer
set search_path to ''
as $$
  insert into iam.permissions
    (resource_type, resource_id, granted_to_user_id, permission_level, created_by, granted_via, status)
  values (p_resource_type, p_resource_id, p_user_id, p_level, p_actor, 'share', 'active')
  on conflict (resource_type, resource_id, granted_to_user_id) do update
     set permission_level = greatest(iam.permissions.permission_level, excluded.permission_level)
   where iam.permissions.status = 'active';
$$;

-- Who is sharing, in words a recipient trusts: a name, else the address, never "Someone".
create or replace function iam._person_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
                  nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
                  nullif(btrim(u.email), ''))
    from auth.users u where u.id = p_user_id
$$;

-- One email invitation per (source, address); a pending one is raised, never duplicated or resent.
create or replace function iam._record_share_invite(
  p_plan jsonb,
  p_email text,
  p_level public.permission_level,
  p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_mail   text := lower(btrim(coalesce(p_email, '')));
  v_source uuid := (p_plan ->> 'source_id')::uuid;
  v_org    uuid := (p_plan ->> 'organization_id')::uuid;
  v_inv    iam.invitations;
  v_meta   jsonb;
  v_what   text;
  v_orgn   text;
  v_sent   jsonb;
begin
  select string_agg(a ->> 'label', ', ') into v_what from jsonb_array_elements(p_plan -> 'assets') a;
  v_meta := jsonb_build_object(
    'subject', 'record_share',
    'kind', p_plan ->> 'kind',
    'source_token', p_plan ->> 'source_token',
    'source_noun', p_plan ->> 'source_noun',
    'title', p_plan ->> 'title',
    'href', p_plan ->> 'href',
    'what', v_what,
    'level', p_level::text,
    'assets', p_plan -> 'assets');

  select * into v_inv from iam.invitations i
   where i.target_type = 'record_share' and i.target_id = v_source
     and lower(i.email) = v_mail and i.deleted_at is null
     and i.status = 'pending' and (i.expires_at is null or i.expires_at > now())
   limit 1;
  if found then
    -- Already invited: raise the level and refresh the asset list, send nothing again.
    update iam.invitations
       set role = greatest(coalesce(nullif(role, ''), 'viewer')::public.permission_level, p_level)::text,
           metadata = coalesce(metadata, '{}'::jsonb) || v_meta
                      || jsonb_build_object('level',
                           greatest(coalesce(metadata ->> 'level', 'viewer')::public.permission_level, p_level)::text),
           updated_by = p_actor, updated_at = now()
     where id = v_inv.id;
    return jsonb_build_object('invitation_id', v_inv.id, 'created', false, 'sent', false);
  end if;

  insert into iam.invitations
    (organization_id, target_type, target_id, email, role, status, token, expires_at,
     metadata, created_by, updated_by)
  values
    (v_org, 'record_share', v_source, v_mail, p_level::text, 'pending', gen_random_uuid()::text,
     now() + interval '14 days', v_meta, p_actor, p_actor)
  returning * into v_inv;

  select coalesce(nullif(btrim(o.name), ''), 'their organization') into v_orgn
    from iam.organizations o where o.id = v_org;

  v_sent := communication.notify_from_sql(
    v_org,
    'share.records_invited',
    null,
    v_mail,
    v_mail,
    jsonb_build_object('invite', jsonb_build_object(
      'inviter', coalesce(iam._person_name(p_actor), 'Somebody at ' || v_orgn),
      'title', p_plan ->> 'title',
      'what', v_what,
      'organization', v_orgn,
      'means', iam.permission_means(p_level),
      'email', v_mail,
      'token', v_inv.token,
      'expires', to_char(v_inv.expires_at, 'FMDay DD FMMonth YYYY'))),
    '/invitations/share/accept/' || v_inv.token,
    'record_share_invitation',
    v_inv.id,
    'recshare:' || v_inv.token);

  return jsonb_build_object('invitation_id', v_inv.id, 'created', true,
                            'sent', coalesce(v_sent -> 'queued', '[]'::jsonb) ? 'email',
                            'accept_path', '/invitations/share/accept/' || v_inv.token);
end;
$$;

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
  v_told    int := 0;
  v_inv     jsonb;
  v_ans     jsonb;
  v_what    text;
  v_say     text;
begin
  for p in select * from jsonb_array_elements(v_plan -> 'people') loop
    if p ->> 'state' = 'will_share' then
      for a in select * from jsonb_array_elements(p -> 'missing') loop
        perform iam._audience_grant(a ->> 'resource_type', (a ->> 'resource_id')::uuid,
                                    (p ->> 'user_id')::uuid, p_level, p_actor);
      end loop;
      v_shared := v_shared || coalesce(p ->> 'name', p ->> 'email');
      select string_agg(x ->> 'label', ', ') into v_what from jsonb_array_elements(p -> 'missing') x;
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
    when cardinality(v_shared) = 0 and cardinality(v_invited) = 0 then
      format('Everyone in the %s who can be reached already has it — nobody was added.', v_plan ->> 'source_noun')
    else concat_ws(' ',
      case when cardinality(v_shared) > 0 then
        format('Shared with %s %s as %s.', cardinality(v_shared),
               case when cardinality(v_shared) = 1 then 'person' else 'people' end, p_level::text) end,
      case when cardinality(v_invited) > 0 then
        format('Invited %s by email — they get it when they open the link.', cardinality(v_invited)) end)
  end;
  if (v_plan -> 'counts' ->> 'unreachable')::int > 0 then
    v_say := v_say || format(' %s joined as a guest with no account or email address, so there is no way to reach them.',
                             v_plan -> 'counts' ->> 'unreachable');
  end if;

  return v_plan || jsonb_build_object(
    'via', p_via,
    'shared_with', to_jsonb(v_shared),
    'invited', to_jsonb(v_invited),
    'told', v_told,
    'say', v_say);
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. THE CLIENT DOORS (public — the sharing RPCs live there)
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.audience_share_preview(
  p_kind text,
  p_source_id uuid,
  p_level text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_me    uuid := auth.uid();
  k       record;
  v_org   uuid;
  v_title text;
  v_href  text;
  v_level text;
  v_offer text;
  v_plan  jsonb;
begin
  select * into k from iam.audience_kinds() ak where ak.kind = p_kind;
  if not found then
    raise exception 'There is no audience called "%".', p_kind using errcode = '22023';
  end if;
  if p_level is not null and p_level not in ('viewer', 'commenter', 'editor', 'admin') then
    raise exception 'A Permission is viewer, commenter, editor or admin (got "%").', p_level using errcode = '22023';
  end if;
  -- Authority before anything is read about the record.
  if v_me is null or not (coalesce(iam.owner_of(k.source_token, p_source_id) = v_me, false)
          or iam.has_access_for(v_me, k.source_token, p_source_id, 'admin'::public.permission_level)) then
    raise exception 'Only the person who owns this %, or someone with Admin on it, can share it with %.',
      k.source_noun, k.label using errcode = '42501';
  end if;
  execute format('select organization_id, title, href from %s($1)', k.describe_fn)
    into v_org, v_title, v_href using p_source_id;
  v_level := coalesce(p_level,
                      platform.knob_resolve(k.level_knob_feature, k.level_knob_key, v_org, v_me) #>> '{}',
                      'viewer');
  v_offer := coalesce(platform.knob_resolve(k.offer_knob_feature, k.offer_knob_key, v_org, v_me) #>> '{}', 'offer');
  v_plan := iam._audience_plan(p_kind, p_source_id, v_level::public.permission_level, v_me, '{}');
  return v_plan || jsonb_build_object('offer_mode', v_offer, 'default_level',
    coalesce(platform.knob_resolve(k.level_knob_feature, k.level_knob_key, v_org, v_me) #>> '{}', 'viewer'));
end;
$$;

create or replace function public.share_with_audience(
  p_kind text,
  p_source_id uuid,
  p_level text,
  p_exclude text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
begin
  if p_level is null or p_level not in ('viewer', 'commenter', 'editor', 'admin') then
    raise exception 'A Permission is viewer, commenter, editor or admin (got "%").', coalesce(p_level, 'nothing')
      using errcode = '22023';
  end if;
  return iam._share_with_audience(p_kind, p_source_id, p_level::public.permission_level,
                                  auth.uid(), coalesce(p_exclude, '{}'), 'person');
end;
$$;

-- What the holder of an emailed link is offered — before being asked to sign in. The token is
-- the identity; an unknown token learns nothing; the address is masked unless it is the caller's.
create or replace function public.record_share_peek(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_inv   iam.invitations;
  v_me    uuid := auth.uid();
  v_mail  text;
  v_level public.permission_level;
  v_org   text;
  v_state text;
  v_shown text;
  v_who   text;
begin
  select * into v_inv from iam.invitations i
   where i.token = p_token and i.target_type = 'record_share'
   limit 1;
  if not found or coalesce(btrim(p_token), '') = '' then
    return jsonb_build_object('state', 'unknown',
      'say', 'This link cannot be opened: it was withdrawn, already used, has run out, or was never a real link.',
      'ask', 'Ask whoever sent it to share it with you again.');
  end if;
  if v_me is not null then
    select lower(u.email) into v_mail from auth.users u where u.id = v_me;
  end if;
  v_level := coalesce(nullif(v_inv.metadata ->> 'level', ''), 'viewer')::public.permission_level;
  select coalesce(nullif(btrim(o.name), ''), 'their organization') into v_org
    from iam.organizations o where o.id = v_inv.organization_id;
  v_who := coalesce(iam._person_name(v_inv.created_by), 'Somebody at ' || v_org);
  v_state := case
    when v_inv.deleted_at is not null or v_inv.status = 'revoked' then 'revoked'
    when v_inv.status = 'accepted' then 'accepted'
    when v_inv.expires_at is not null and v_inv.expires_at <= now() then 'expired'
    when v_me is null then 'sign_in_needed'
    when v_inv.invited_user_id = v_me or lower(v_inv.email) = v_mail then 'ready'
    else 'wrong_account' end;
  v_shown := case
    when v_me is not null and lower(v_inv.email) = v_mail then v_inv.email
    else regexp_replace(v_inv.email, '^(.).*(@.*)$', '\1•••\2') end;
  return jsonb_build_object(
    'state', v_state,
    'title', v_inv.metadata ->> 'title',
    'what', v_inv.metadata ->> 'what',
    'source_noun', v_inv.metadata ->> 'source_noun',
    'organization', v_org,
    'inviter', v_who,
    'level', v_level::text,
    'means', iam.permission_means(v_level),
    'invited_email', v_shown,
    'href', case when v_state in ('accepted', 'ready') then v_inv.metadata ->> 'href' end,
    'say', case v_state
      when 'revoked' then v_who || ' took this invitation back.'
      when 'accepted' then 'This was already opened.'
      when 'expired' then 'This invitation has run out.'
      when 'sign_in_needed' then format('%s shared %s with you. Sign in (or create an account) with the address it was sent to, and it opens.', v_who, coalesce(v_inv.metadata ->> 'title', 'something'))
      when 'wrong_account' then format('This was sent to %s, and you are signed in as someone else.', v_shown)
      else format('%s shared %s with you.', v_who, coalesce(v_inv.metadata ->> 'title', 'something')) end,
    'ask', format('Ask %s to share it with you again.', v_who));
end;
$$;

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
  -- The act was judged when the invitation was made; its author is the grant's author.
  for a in select * from jsonb_array_elements(coalesce(v_inv.metadata -> 'assets', '[]'::jsonb)) loop
    perform iam._audience_grant(a ->> 'resource_type', (a ->> 'resource_id')::uuid, v_me, v_level, v_inv.created_by);
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

-- inv_accept must never turn a record share into a membership.
create or replace function iam.invitation_has_its_own_door(p_target_type text)
returns text
language sql
immutable
set search_path to ''
as $$
  -- An invitation whose target is NOT a container of people. `public.inv_accept` turns an
  -- invitation into an `iam.memberships` row whose `container_type` is the target type, so
  -- every one of these would put somebody in a "container" that is a Table, a portal
  -- principal or a set of shared records. Each has its own door, and this is the ONE place
  -- the list lives.
  select case p_target_type
           when 'custom_table'     then 'custom.table_share_outside_accept'
           when 'portal_principal' then 'custom.portal_invite_accept'
           when 'record_share'     then 'public.record_share_accept'
           else null
         end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. MEETING END AND RECORDING LANDING — the knob decides offer / share / nothing
-- ════════════════════════════════════════════════════════════════════════════
create or replace function communication._meet_audience_after_end()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_mode  text;
  v_level text;
  v_plan  jsonb;
  v_n     int;
begin
  if new.host_user_id is null then
    return new;
  end if;
  begin
    v_mode := coalesce(platform.knob_resolve('meet', 'share_with_attendees_after_meeting',
                                             new.organization_id, new.host_user_id) #>> '{}', 'offer');
    v_level := coalesce(platform.knob_resolve('meet', 'share_with_attendees_permission',
                                              new.organization_id, new.host_user_id) #>> '{}', 'viewer');
    if v_mode = 'share' then
      perform iam._share_with_audience('meeting', new.id, v_level::public.permission_level,
                                       new.host_user_id, '{}', 'automatic');
    elsif v_mode = 'offer' then
      v_plan := iam._audience_plan('meeting', new.id, v_level::public.permission_level, new.host_user_id, '{}');
      v_n := (v_plan -> 'counts' ->> 'will_share')::int + (v_plan -> 'counts' ->> 'invite_by_email')::int;
      if v_n > 0 then
        perform communication.notify_from_sql(
          new.organization_id,
          'meet.share_offer',
          new.host_user_id,
          null,
          null,
          jsonb_build_object(
            'meeting', jsonb_build_object('id', new.id),
            'notice', jsonb_build_object(
              'line', format('Share "%s" with the %s %s who were in it — one click.',
                             v_plan ->> 'title', v_n, case when v_n = 1 then 'person' else 'people' end))),
          '/meetings/' || new.id::text || '?tab=record&share=1',
          'meet_meeting',
          new.id,
          'meetshareoffer:' || new.id::text);
      end if;
    end if;
  exception when others then
    -- Ending a meeting never fails because of this; the failure is loud and names the remedy.
    insert into ops.system_error (kind, error_text, organization_id, user_id, source_app, source_feature, context)
    values ('audience_share_after_meeting_failed',
            format('After the meeting ended, "%s" could not run: %s', coalesce(v_mode, 'offer'), sqlerrm),
            new.organization_id, new.host_user_id, 'database', 'sharing',
            jsonb_build_object('meeting_id', new.id, 'mode', v_mode,
              'remedy', 'The meeting ended normally. Open its Record tab and click "Share with everyone in the meeting".'));
  end;
  return new;
end;
$$;

create or replace function communication._meet_audience_after_recording()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_m     communication.meet_meetings;
  v_mode  text;
  v_level text;
begin
  select * into v_m from communication.meet_meetings where id = new.meeting_id;
  if not found or v_m.ended_at is null or v_m.host_user_id is null or v_m.deleted_at is not null then
    return new;
  end if;
  begin
    v_mode := coalesce(platform.knob_resolve('meet', 'share_with_attendees_after_meeting',
                                             v_m.organization_id, v_m.host_user_id) #>> '{}', 'offer');
    if v_mode = 'share' then
      v_level := coalesce(platform.knob_resolve('meet', 'share_with_attendees_permission',
                                                v_m.organization_id, v_m.host_user_id) #>> '{}', 'viewer');
      perform iam._share_with_audience('meeting', v_m.id, v_level::public.permission_level,
                                       v_m.host_user_id, '{}', 'automatic');
    end if;
  exception when others then
    insert into ops.system_error (kind, error_text, organization_id, user_id, source_app, source_feature, context)
    values ('audience_share_after_recording_failed',
            format('A recording landed but could not be shared with the meeting: %s', sqlerrm),
            v_m.organization_id, v_m.host_user_id, 'database', 'sharing',
            jsonb_build_object('meeting_id', v_m.id, 'recording_id', new.id,
              'remedy', 'Open the meeting''s Record tab and click "Share with everyone in the meeting".'));
  end;
  return new;
end;
$$;

drop trigger if exists _audience_after_end on communication.meet_meetings;
create trigger _audience_after_end
  after update of ended_at on communication.meet_meetings
  for each row
  when (old.ended_at is null and new.ended_at is not null)
  execute function communication._meet_audience_after_end();

drop trigger if exists _audience_after_recording on communication.meet_recordings;
create trigger _audience_after_recording
  after insert or update of file_id, state on communication.meet_recordings
  for each row
  when (new.file_id is not null and new.state = 'available')
  execute function communication._meet_audience_after_recording();

-- ════════════════════════════════════════════════════════════════════════════
-- 6. KNOBS (system -> organization -> person)
-- ════════════════════════════════════════════════════════════════════════════
insert into platform.feature_knob
  (feature, key, value, default_value, value_type, allowed_values, label, description,
   set_by, basis, review_due, overridable_by, override_direction, propagation)
values
  ('meet', 'share_with_attendees_after_meeting', '"offer"', '"offer"', 'enum',
   array['offer', 'share', 'off'],
   'After a meeting: share the recording and notes with everyone in it',
   'What happens when a meeting ends. "offer" (the default): the host is told the recording, transcript and notes are ready to share with everyone who was invited or attended, and "Share with everyone in the meeting" does it in one click. "share": they are shared automatically, at the Permission below, when the meeting ends and again when its recording lands. "off": nothing is offered; the host can still share from the meeting''s Record tab. Each person gets an ordinary share (people with no account get an email link).',
   'agent',
   'Google Meet, Teams and Zoom share recordings/notes with invitees, and Otter/Fireflies make it a per-person and per-team setting. Offered rather than automatic by default because a recording of everyone''s voice is something a host should choose to hand out (T-32, 2026-09-28).',
   (now() + interval '90 days')::date, array['organization', 'user'], 'any', 'next_load'),
  ('meet', 'share_with_attendees_permission', '"viewer"', '"viewer"', 'enum',
   array['viewer', 'commenter', 'editor'],
   'Permission when sharing a meeting with everyone in it',
   'The Permission "Share with everyone in the meeting" starts on (the host can pick another each time), and the one an automatic share uses. Viewer: open and read. Commenter: also comment. Editor: also change.',
   'agent',
   'Google Meet and Teams grant attendees view access to recordings and notes; editing is the exception.',
   (now() + interval '90 days')::date, array['organization', 'user'], 'any', 'next_load')
on conflict (feature, key) do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 7. NOTICES
-- ════════════════════════════════════════════════════════════════════════════
insert into communication.notification_event_type
  (event_key, label, description, default_channels, config, enabled, organization_id)
values
  ('share.audience_shared', 'Shared with you with everyone in it',
   'Somebody shared a set of records (for a meeting: its recording, transcript and notes) with everyone who was in it, you included.',
   '{"email": true, "in_app": true}',
   jsonb_build_object(
     'mandatory', false, 'alert_tier', 'informational', 'digestible', false, 'sms_locked', true,
     'target_kind', 'meet_meeting', 'max_attempts', 5, 'routing_mode', 'declared_audience',
     'push_declared', false, 'non_user_capable', false, 'quiet_hours_exempt', false,
     'retry_base_seconds', 60, 'sensitivity_ceiling', 'internal',
     'templates', jsonb_build_object(
       'email', jsonb_build_object(
         'subject', '{{grant.sharer}} shared "{{grant.title}}" with you',
         'body', E'{{grant.sharer}} shared "{{grant.title}}" with {{grant.audience}}, including you.\n\nWhat you can open: {{grant.what}}. You {{grant.means}}.\n\nOpen it here:\n{{link.deep}}\n\n--\nAI Matrx sent this because you were part of "{{grant.title}}". Manage notifications: {{link.preferences}}'),
       'in_app', jsonb_build_object(
         'subject', 'Shared with you',
         'body', '{{grant.sharer}} shared "{{grant.title}}" with you ({{grant.what}}). You {{grant.means}}.'))),
   true, '39c38960-d30c-4840-b0c1-c9960de95582'),
  ('share.records_invited', 'Something was shared with you',
   'Somebody with no AI Matrx account yet was part of a meeting (or another group) whose records were shared with everyone in it. This message carries the link they open it with.',
   '{"email": true, "in_app": true}',
   jsonb_build_object(
     'mandatory', false, 'alert_tier', 'informational', 'digestible', false, 'sms_locked', true,
     'target_kind', 'record_share_invitation', 'max_attempts', 5, 'routing_mode', 'declared_audience',
     'push_declared', false, 'non_user_capable', true, 'quiet_hours_exempt', false,
     'retry_base_seconds', 60, 'sensitivity_ceiling', 'internal',
     'deep_link_template', '/invitations/share/accept/{{invite.token}}',
     'templates', jsonb_build_object(
       'email', jsonb_build_object(
         'subject', '{{invite.inviter}} shared "{{invite.title}}" with you',
         'body', E'{{invite.inviter}} at {{invite.organization}} shared "{{invite.title}}" with you: {{invite.what}}.\n\nYou {{invite.means}}.\n\nOpen it here:\n{{link.deep}}\n\nThis link was sent to {{invite.email}} and works when you are signed in with that address. You do not need an account yet — the link offers to make you one.\nIt stops working on {{invite.expires}}.\n\nOpening it does not put you in {{invite.organization}}. You will see what was shared and nothing else there.\n\n--\nAI Matrx sent this because you were part of "{{invite.title}}". Manage notifications: {{link.preferences}}'),
       'in_app', jsonb_build_object(
         'body', '{{invite.inviter}} shared "{{invite.title}}" with you. You {{invite.means}}.'))),
   true, '39c38960-d30c-4840-b0c1-c9960de95582'),
  ('meet.share_offer', 'Share a meeting with everyone in it',
   'A meeting you hosted ended; its recording, transcript and notes are ready to share with everyone who was in it, in one click.',
   '{"email": false, "in_app": true}',
   jsonb_build_object(
     'mandatory', false, 'alert_tier', 'informational', 'digestible', true, 'sms_locked', true,
     'target_kind', 'meet_meeting', 'max_attempts', 5, 'routing_mode', 'declared_audience',
     'push_declared', false, 'non_user_capable', false, 'quiet_hours_exempt', false,
     'retry_base_seconds', 60, 'sensitivity_ceiling', 'internal',
     'deep_link_template', '/meetings/{{meeting.id}}?tab=record&share=1',
     'templates', jsonb_build_object(
       'email', jsonb_build_object(
         'subject', 'Share your meeting with everyone in it',
         'body', E'{{notice.line}}\n\n{{link.deep}}\n\n--\nAI Matrx sent this because you hosted this meeting. Manage notifications: {{link.preferences}}'),
       'in_app', jsonb_build_object(
         'subject', 'Share with everyone in the meeting',
         'body', '{{notice.line}}'))),
   true, '39c38960-d30c-4840-b0c1-c9960de95582')
on conflict (event_key) do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 8. PRIVILEGES AND DECLARED DOORS
-- ════════════════════════════════════════════════════════════════════════════
revoke all on function iam.audience_kinds() from public, anon, authenticated;
revoke all on function communication.meet_audience_source(uuid) from public, anon, authenticated;
revoke all on function communication.meet_audience_members(uuid) from public, anon, authenticated;
revoke all on function communication.meet_audience_assets(uuid) from public, anon, authenticated;
revoke all on function iam._audience_plan(text, uuid, public.permission_level, uuid, text[]) from public, anon, authenticated;
revoke all on function iam._audience_grant(text, uuid, uuid, public.permission_level, uuid) from public, anon, authenticated;
revoke all on function iam._person_name(uuid) from public, anon, authenticated;
revoke all on function iam._record_share_invite(jsonb, text, public.permission_level, uuid) from public, anon, authenticated;
revoke all on function iam._share_with_audience(text, uuid, public.permission_level, uuid, text[], text) from public, anon, authenticated;
revoke all on function communication._meet_audience_after_end() from public, anon, authenticated;
revoke all on function communication._meet_audience_after_recording() from public, anon, authenticated;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason,
   gate_predicate, anonymous_callers, anonymous_purpose, signed_in_callers)
select 'public', d.fn, pg_get_function_identity_arguments(p.oid), p.proargtypes::oid[],
       'access_ladder_t32_group_sharing.sql', d.reason, d.gate, d.anon, d.anon_purpose, true
  from (values
    ('audience_share_preview',
     'T-32: who is in an audience (a meeting''s invitees and attendees) and what each would get from "Share with everyone in …", at a Permission. Writes nothing. Refused unless the caller owns the source record or holds Admin on it, decided before anything is read, so a foreign id answers like an invented one.',
     'iam.owner_of / iam.has_access_for(admin) on the source', false, null::text),
    ('share_with_audience',
     'T-32: one click shares the source''s declared records with everyone in its audience at the chosen Permission. Each account holder gets an ordinary person share (iam.permissions, raise-only, archived/rejected grants never re-activated); each email-only person gets one record_share invitation. Same authority as the preview.',
     'iam.owner_of / iam.has_access_for(admin) on the source', false, null),
    ('record_share_accept',
     'T-32: the invited person''s own door. Matches the token to a pending, unexpired record_share invitation addressed to THIS signed-in person; writes the person shares the invitation carries, at the level it carried. Every failure is one sentence.',
     null, false, null),
    ('record_share_peek',
     'T-32: what an emailed share link offers, before sign-in. Takes only the token; an unknown token learns nothing; the address is masked unless the caller is signed in as it. Writes nothing.',
     null, true,
     'The invited person, who usually has no account yet: the token is the identity, matched against one record_share invitation; nothing else selects a row and nothing is written.')
  ) d(fn, reason, gate, anon, anon_purpose)
  join pg_proc p on p.proname = d.fn and p.pronamespace = 'public'::regnamespace
 where not exists (select 1 from platform.client_callable_door c
                    where c.schema_name = 'public' and c.function_name = d.fn);

revoke all on function public.audience_share_preview(text, uuid, text) from public, anon;
revoke all on function public.share_with_audience(text, uuid, text, text[]) from public, anon;
revoke all on function public.record_share_accept(text) from public, anon;
revoke all on function public.record_share_peek(text) from public;
grant execute on function public.audience_share_preview(text, uuid, text) to authenticated;
grant execute on function public.share_with_audience(text, uuid, text, text[]) to authenticated;
grant execute on function public.record_share_accept(text) to authenticated;
grant execute on function public.record_share_peek(text) to anon, authenticated;

