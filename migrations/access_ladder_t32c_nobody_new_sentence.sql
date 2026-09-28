-- access_ladder_t32c_nobody_new_sentence.sql
-- based-on: iam._share_with_audience(text, uuid, permission_level, uuid, text[], text) b8c12bae1cfed25cbc5d9415dc1769737b11fdc46dd6dad39f5aea1e1d806091
--
-- ACCESS LADDER T-32: the "nothing to do" sentence claimed everyone "already has it" when some
-- people only held an open email link; it now says both (a screen never lies).

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
      format('Nobody new to add — everyone in the %s who can be reached already has it or has an open email link.', v_plan ->> 'source_noun')
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
