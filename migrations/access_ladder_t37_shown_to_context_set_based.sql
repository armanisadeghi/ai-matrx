-- access_ladder_t37_shown_to_context_set_based — the Shown to context stops paying per organization.
--
-- platform.shown_to_context(token) is read by lib/list-scope defaultListFilter before every
-- client-built list (canvas Saved items, notes, projects, tasks, …) and by every *_list_scoped RPC.
-- For admin@admin.com (53 live organizations) it took 0.8–1.5 s on the clone, 2026-10-03. Measured
-- per part, in fresh transactions:
--   * platform.shown_to_default per organization: ~0.9–1.7 s of it. Each call reaches
--     platform.knob_resolve_uncached, whose platform.knob_override read runs that table's full row
--     security (std_select's six-way UNION) — 20–45 ms per organization — although for this feature
--     there are almost no override rows at all (0–5 platform-wide).
--   * iam.teammate_user_ids per organization: ~0.3–0.5 s. It plans and runs the whole
--     iam.team_members_resolved CTE (HR department tree included) even for an organization with no
--     live team — 50 of admin's 53 have none.
--
-- The fix, with the answer unchanged (WHO sees what is not touched — access ladder):
--   1. shown_to_context reads, ONCE, which of the viewer's organizations hold any override row for
--      this token (same caller, same row security as the per-organization read). Only those go
--      through platform.shown_to_default; every other organization gets the knob's platform value,
--      which is exactly what knob_resolve_uncached returns when no override row matches
--      (`if v is null then return k.base`). An unseeded token stays NULL everywhere.
--   2. iam.teammate_user_ids returns {person} at once when the organization has no live team —
--      the same value the full CTE produces over an empty team list. Its two refusals (missing
--      argument; a client caller who is not a member) still run first, unchanged. Every caller of
--      this primitive inherits it, not only the list filter.
-- The per-transaction caches (platform.shown_to_ctx_<md5>, platform.shown_to_team) keep their exact
-- keys and shapes; custom._record_shown_to_ctx and the custom record doors read them.
-- Signatures, volatility, security mode, grants: unchanged.
set local lock_timeout = '2s';
-- based-on: platform.shown_to_context(text) 12395721c9b9bff55f0c8fda0099d50f2b4f2978a283b8fef469da7f9d8549d0
-- based-on: iam.teammate_user_ids(uuid, uuid) 359a474741e742006c80837668f04b1fffeed6199ac68a018ed66e7d0a6eaad5
SELECT set_config('app.actor_tier', 'code', true);
SELECT set_config('app.actor_system', 'migration:access_ladder_t37_shown_to_context_set_based', true);

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
  -- access_ladder_t37: an organization with no live team has no teammates — the CTE below would
  -- answer {person} over an empty team list; answer it without planning the HR department walk.
  if not exists (select 1 from iam.team t
                  where t.organization_id = p_organization_id and t.deleted_at is null) then
    return array[p_user_id];
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
  -- transaction for ALL tokens (a library list asks for four tokens).
  v_team_key constant text := 'platform.shown_to_team';
  v_cached jsonb;
  v_team jsonb;
  v_team_out jsonb := '{}'::jsonb;
  v_seeded boolean;
  v_base platform.shown_to;
  v_override_orgs uuid[];
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
  -- access_ladder_t37: the knob's platform value is read once. An organization with no override
  -- row for this token resolves to exactly that value (platform.knob_resolve_uncached returns
  -- k.base when no override matches); only organizations that hold an override row are resolved
  -- one by one through platform.shown_to_default. The override read runs as the caller, under the
  -- same row security as the per-organization read inside knob_resolve_uncached, so it can only
  -- name MORE organizations than that read would match, never fewer.
  v_seeded := exists (select 1 from platform.feature_knob k
                       where k.feature = 'access.shown_to_default' and k.key = p_token);
  if v_seeded then
    v_base := platform.shown_to_default_system(p_token);
    v_override_orgs := array(
      select distinct o.organization_id from platform.knob_override o
       where o.feature = 'access.shown_to_default' and o.key = p_token);
  end if;
  -- An archived organization is closed (ACCESS LADDER T-33): membership of one grants no
  -- access, so iam.has_org_access(org) — and iam.teammate_user_ids underneath it — refuses
  -- it. Read the same live-membership set iam.my_orgs() uses so a stale archived row never
  -- reaches iam.teammate_user_ids. (page-pass 2026-09-28, RC via education.fc_set_list_counts.)
  for r in
    select om.organization_id
    from iam.organization_member om
    join iam.organizations o on o.id = om.organization_id and o.archived_at is null
    where om.user_id = v_uid
  loop
    if not v_seeded then
      v_d := null;
    elsif r.organization_id = any (v_override_orgs) then
      v_d := platform.shown_to_default(p_token, r.organization_id, v_uid);
    else
      v_d := v_base;
    end if;
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
