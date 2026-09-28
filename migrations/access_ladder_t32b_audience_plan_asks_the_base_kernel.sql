-- access_ladder_t32b_audience_plan_asks_the_base_kernel.sql
-- based-on: iam._audience_plan(text, uuid, permission_level, uuid, text[]) d71fe0fedfffd719bfacd3ccc9d0a17f0377ba4378646f9adafd7461946cf645
-- based-on: communication.meet_audience_assets(uuid) 2bb22ad58824eb705a2b1fd6e1783fccbde895a4bf74055c94edd7a7e7ef54b9
--
-- ACCESS LADDER T-32 fix (found on the first localhost click, 2026-09-28): the audience plan asked
-- iam.has_access_for(other person, 'file', …). Its file lane (files.has_access_for) answers FALSE
-- for any person other than the signed-in caller, so through the browser door a recording the
-- attendee already held was always "missing" and the button kept offering it. The plan now asks
-- the base kernel (iam.has_access_for_base) — the same kernel has_access_for delegates to for
-- every other type. Also: the meeting asset reads "Notes, summary, transcript" so a list of assets
-- reads cleanly ("notes, summary, transcript and recording").

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
        -- The base kernel, never iam.has_access_for: the file lane of that wrapper refuses to
        -- answer about ANOTHER person when the caller is signed in (files.has_access_for), so
        -- through the browser door every recording read as "missing" and was re-offered.
        if not iam.has_access_for_base(m.user_id, asset ->> 'resource_type',
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

create or replace function communication.meet_audience_assets(p_id uuid)
returns table (resource_type text, resource_id uuid, label text)
language sql
stable
set search_path to ''
as $$
  -- The meeting record carries its children (transcript, notes, summary, saved chat); each
  -- landed recording is a file of its own.
  select 'meet_meeting'::text, m.id, 'Notes, summary, transcript'::text
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
