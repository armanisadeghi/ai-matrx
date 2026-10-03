-- chair-step: restores platform.shown_to_context and iam.teammate_user_ids to the bodies live before access_ladder_t37_shown_to_context_set_based.sql — only if that change must be undone.
-- based-on: platform.shown_to_context(text) a518c07e4b188b0d06e83492a843018ddc641584e02e86ddb55140fc7607b0a6
-- based-on: iam.teammate_user_ids(uuid, uuid) 872eaeac68a6c1159f2ae788b3296a6111ee150dc56758222952bbe677e78627
-- Inverse of migrations/access_ladder_t37_shown_to_context_set_based.sql. Bodies are the live
-- pg_get_functiondef text from before that file. No data was written, so none is lost.
set local lock_timeout = '2s';

CREATE OR REPLACE FUNCTION iam.teammate_user_ids(p_user_id uuid, p_organization_id uuid)
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_user_id is null or p_organization_id is null then
    raise exception 'iam.teammate_user_ids: a person and an organization are both required' using errcode = '22004';
  end if;
  if iam.is_client_lane() and not iam.has_org_access(p_organization_id) then
    raise exception 'You are not a member of that organization, so you cannot see its teams.'
      using errcode = '42501';
  end if;
  return array(
    with r as (
      select * from iam.team_members_resolved(array(
        select t.id from iam.team t
         where t.organization_id = p_organization_id and t.deleted_at is null))
    )
    select p_user_id
    union
    select r.user_id from r where r.team_id in (select r2.team_id from r r2 where r2.user_id = p_user_id));
end $function$;

CREATE OR REPLACE FUNCTION platform.shown_to_context(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_out jsonb := '{}'::jsonb;
  v_key text := 'platform.shown_to_ctx_' || md5(coalesce(p_token, ''));
  -- The teammates of each organization do not depend on the token, so they are worked out once per
  -- transaction for ALL tokens (a library list asks for four tokens; iam.teammate_user_ids costs
  -- about 1 ms per organization, and an admin belongs to dozens).
  v_team_key constant text := 'platform.shown_to_team';
  v_cached jsonb;
  v_team jsonb;
  v_team_out jsonb := '{}'::jsonb;
  v_d platform.shown_to;
  v_t jsonb;
  r record;
begin
  if v_uid is null then
    return v_out;
  end if;
  -- Once per transaction per (viewer, token): a counts RPC calls its list RPC dozens of times.
  v_cached := nullif(current_setting(v_key, true), '')::jsonb;
  if v_cached is not null and v_cached ->> 'u' = v_uid::text then
    return v_cached -> 'c';
  end if;
  v_team := nullif(current_setting(v_team_key, true), '')::jsonb;
  if v_team is not null and v_team ->> 'u' = v_uid::text then
    v_team := v_team -> 't';
  else
    v_team := null;
  end if;
  -- An archived organization is closed (ACCESS LADDER T-33): membership of one grants no
  -- access, so iam.has_org_access(org) — and iam.teammate_user_ids underneath it — refuses
  -- it. This loop used to read raw iam.organization_member with no archived filter, so
  -- ANY viewer who had ever belonged to an org that later got archived hit that refusal as
  -- an unhandled exception on their very first list read here, killing every "Shown to"
  -- gated list (fc_set/assessment/edu_library/agx/ivw/mkt_initiative/rsx/seo_rank_target/
  -- shx/trx/wfx) for that person. Filter to the same live-membership set iam.my_orgs()
  -- already uses so a stale archived row never reaches iam.teammate_user_ids.
  -- (page-pass 2026-09-28, RC via education.fc_set_list_counts on test@test.com.)
  for r in
    select om.organization_id
    from iam.organization_member om
    join iam.organizations o on o.id = om.organization_id and o.archived_at is null
    where om.user_id = v_uid
  loop
    v_d := platform.shown_to_default(p_token, r.organization_id, v_uid);
    v_t := v_team -> r.organization_id::text;
    if v_t is null then
      v_t := to_jsonb(coalesce(iam.teammate_user_ids(v_uid, r.organization_id), array[v_uid]));
    end if;
    v_team_out := v_team_out || jsonb_build_object(r.organization_id::text, v_t);
    v_out := v_out || jsonb_build_object(r.organization_id::text, jsonb_build_object('d', v_d, 't', v_t));
  end loop;
  perform set_config(v_team_key, jsonb_build_object('u', v_uid, 't', v_team_out)::text, true);
  perform set_config(v_key, jsonb_build_object('u', v_uid, 'c', v_out)::text, true);
  return v_out;
end;
$function$;

