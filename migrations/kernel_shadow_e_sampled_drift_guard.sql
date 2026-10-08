-- chair-step: the REVOKEs narrow two brand-new functions (iam.access_shadow_status, iam.kernel_shadow_sweep) so no client role can call them; nothing existing loses a privilege
-- lane: KERNEL-SHADOW
-- based-on: iam.kernel_shadow_on(uuid) d9976f1d4a7e55f97e6074b9cc168d3d9d24f01e2123b96d6fb4ec69b0a1a37a
-- based-on: iam.has_access_for_shadow(uuid, uuid[], text, text, text) d6e7108a3b1331211d51dfd0e0f3556ec72569b2e01f4c4e177d1e5e478ce464
-- =============================================================================
-- KERNEL-SHADOW stage 3 — THE SHADOW BECOMES A PERMANENT, CHEAP DRIFT GUARD.
--
--   * Sampled: the shadow runs on 1 in N calls of custom.reaches_directly_many for everyone (knob
--     access/kernel_shadow_sample, N = 20; 0 turns sampling off), plus always for the people listed in
--     access/kernel_shadow (now empty). The +0.3-0.9 s cost lands on 1 call in 20.
--   * Loud: a disagreement or a set-form failure is logged every time AND written to ops.system_error
--     (kind access_kernel_disagreement); where nothing can be written (PostgREST runs STABLE functions
--     read-only) it is a WARNING line.
--   * Read-only traffic cannot write, so a sweep can: iam.kernel_shadow_sweep() compares both forms for
--     the two test accounts and 3 random members on 300 random Tables, writing a summary row each
--     time. It is NOT scheduled here: every schedule needs Arman's approval by exact name and interval
--     (proposed: pg_cron `kernel-shadow-sweep`, '7,37 * * * *').
--   * iam.access_shadow_status(): disagreements and comparisons in the last 24 h, `red` when any
--     disagreement - read by aidream's server_status tool.
--
-- One-statement revert of the swap itself is unchanged:
--   update platform.feature_knob set value = '{"on": false, "off_for": []}'::jsonb
--    where feature = 'access' and key = 'kernel_set_form';
-- Inverse: migrations/inverse/kernel_shadow_e_sampled_drift_guard_down.sql
-- =============================================================================

insert into platform.feature_knob (
  feature, key, value, default_value, value_type, min_value, max_value, label, description, set_by, basis,
  review_due, overridable_by, delegable, not_delegable_reason
)
values (
  'access', 'kernel_shadow_sample', '20'::jsonb, '20'::jsonb, 'integer', 0, 100000,
  'Access kernel shadow sample',
  'The access-kernel shadow runs on 1 in this many store set-door calls (0 = never, except the people in access/kernel_shadow).',
  'agent',
  'KERNEL-SHADOW stage 3, 2026-10-07: 1 in 20 shows drift within minutes of real traffic while the shadow''s +0.3-0.9 s lands on 5% of calls.',
  current_date + 30, '{}'::text[], false,
  'A platform diagnostic over the access kernel itself; no organization or person decides how often it is checked.'
)
on conflict (feature, key) do nothing;

update platform.feature_knob set value = '[]'::jsonb, updated_at = now()
 where feature = 'access' and key = 'kernel_shadow';

create or replace function iam.kernel_shadow_on(p_person uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path to ''
as $function$
-- KERNEL-SHADOW: does this call run the access-kernel shadow? Always for the people listed in knob
-- access/kernel_shadow; otherwise 1 in N calls (knob access/kernel_shadow_sample; 0 = never). Any
-- failure to read a knob answers false: the shadow must never stand between a person and an answer.
declare
  v_n numeric;
begin
  if p_person is null then return false; end if;
  if coalesce(platform.knob_resolve('access', 'kernel_shadow', null) ? p_person::text, false) then
    return true;
  end if;
  v_n := (platform.knob_resolve('access', 'kernel_shadow_sample', null) #>> '{}')::numeric;
  return v_n is not null and v_n > 0 and random() * v_n < 1;
exception when others then
  return false;
end;
$function$;

CREATE OR REPLACE FUNCTION iam.has_access_for_shadow(p_person uuid, p_targets uuid[], p_level text, p_type text DEFAULT 'record'::text, p_caller text DEFAULT NULL::text)
 RETURNS TABLE(target uuid, allowed boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- KERNEL-SHADOW: ask the one-at-a-time access kernel (iam.has_access_for) and its set form
-- (iam.has_access_for_many) the same question, log every disagreement to iam.access_shadow_log, and
-- return the OLD answer. It never raises. Agreement is written only when free (see below); a
-- disagreement or a failure of the set form is always written, or warned where nothing can be written.
declare
  v_req     public.permission_level := coalesce(p_level, 'viewer')::public.permission_level;
  v_old     jsonb;
  v_new     jsonb;
  v_n       integer := 0;
  v_bad     integer := 0;
  v_err     text;
  v_caller  text := coalesce(p_caller, 'direct');
begin
  if p_targets is null or cardinality(p_targets) = 0 then
    return;
  end if;

  select coalesce(jsonb_object_agg(u.x::text, coalesce(iam.has_access_for(p_person, p_type, u.x, v_req), false)), '{}'::jsonb)
    into v_old
    from (select distinct x from unnest(p_targets) x where x is not null) u(x);
  v_n := (select count(*) from jsonb_object_keys(v_old));

  begin
    select coalesce(jsonb_object_agg(m.target::text, m.allowed), '{}'::jsonb)
      into v_new
      from iam.has_access_for_many(p_person, p_targets, p_level, p_type) m;
  exception when others then
    v_err := sqlstate || ' ' || sqlerrm;
    v_new := null;
  end;

  if v_new is not null then
    v_bad := (select count(*) from jsonb_each(v_old) o
               where (v_new -> o.key) is distinct from o.value);
  end if;

  -- A WRITE HERE COSTS THE CALLER: the store's statement memo (platform.memo_k_*) only works while the
  -- transaction has written nothing, so the first insert would slow everything after it in the
  -- caller's transaction (measured: data_home 2.6 s -> 11 s for admin@admin.com in a read-write
  -- transaction). So an AGREEMENT is written only when the transaction has already written (no new
  -- cost); otherwise it is one server-log line. A DISAGREEMENT or an error is always written - that is
  -- what the shadow exists for - and where it cannot be (a read-only transaction: PostgREST runs STABLE
  -- functions read-only) it is a WARNING line instead.
  if v_new is not null and v_bad = 0 and pg_catalog.pg_current_xact_id_if_assigned() is null then
    raise log 'KERNEL-SHADOW person=% level=% caller=% compared=% disagreed=0', p_person, v_req, v_caller, v_n;
  else
    begin
      if v_new is not null and v_bad > 0 then
        insert into iam.access_shadow_log (person, target, level, old_answer, new_answer, caller)
        select p_person, o.key::uuid, v_req::text, (o.value)::text::boolean,
               (v_new ->> o.key)::boolean, v_caller
          from jsonb_each(v_old) o
         where (v_new -> o.key) is distinct from o.value;
      end if;
      insert into iam.access_shadow_log (person, target, level, caller, compared, disagreed, error)
      values (p_person, null, v_req::text, v_caller, v_n, case when v_new is null then null else v_bad end, v_err);
      -- KERNEL-SHADOW stage 3: a disagreement or a failure of the set form is also a system error, so
      -- the errors surface (and whoever triages it) sees it without reading this log.
      if v_bad > 0 or v_new is null then
        perform ops.record_system_error(jsonb_build_object(
          'kind', 'access_kernel_disagreement', 'source_app', 'database', 'source_feature', 'access',
          'route', v_caller, 'error_type', case when v_new is null then 'set_form_failed' else 'disagreement' end,
          'error_text', format('The set form of the access kernel disagreed with the one-at-a-time kernel on %s of %s targets (level %s). Revert: update platform.feature_knob set value = ''{"on": false, "off_for": []}'' where feature = ''access'' and key = ''kernel_set_form''.', coalesce(v_bad, 0), v_n, v_req),
          'user_id', p_person,
          'context', jsonb_build_object('error', v_err, 'log', 'iam.access_shadow_log')));
      end if;
    exception when others then
      raise warning 'KERNEL-SHADOW access_kernel_disagreement-or-unlogged person=% level=% caller=% compared=% disagreed=% error=% (not logged: % %)',
        p_person, v_req, v_caller, v_n, case when v_new is null then null else v_bad end, v_err, sqlstate, sqlerrm;
    end;
  end if;

  return query select o.key::uuid, (o.value)::text::boolean from jsonb_each(v_old) o;
end;
$function$;

create or replace function iam.access_shadow_status()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  -- KERNEL-SHADOW: the drift guard's state for server_status. red = any disagreement in 24 h.
  select jsonb_build_object(
    'disagreements_24h', count(*) filter (where l.target is not null),
    'failures_24h',      count(*) filter (where l.target is null and l.error is not null),
    'compared_24h',      coalesce(sum(l.compared), 0),
    'checks_24h',        count(*) filter (where l.target is null),
    'last_check_at',     max(l.at) filter (where l.target is null),
    'set_form_on',       coalesce((select (k.value ->> 'on')::boolean from platform.feature_knob k
                                    where k.feature = 'access' and k.key = 'kernel_set_form'), false),
    'red',               count(*) filter (where l.target is not null or l.error is not null) > 0)
    from iam.access_shadow_log l
   where l.at > now() - interval '24 hours'
$function$;

revoke all on function iam.access_shadow_status() from public, anon, authenticated;
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
values ('iam', 'access_shadow_status', '', array[]::oid[],
        'No arguments; reads only iam.access_shadow_log and one knob.',
        'migrations/kernel_shadow_e_sampled_drift_guard.sql (lane KERNEL-SHADOW)',
        'server_only: read by aidream''s server_status MCP tool (full-access) as the access-kernel drift line; no client ever calls it.', false, false);

create or replace function iam.kernel_shadow_sweep(p_people integer default 3, p_tables integer default 300)
returns jsonb
language plpgsql
volatile
security definer
set search_path to ''
as $function$
-- KERNEL-SHADOW: the read-write half of the drift guard (unscheduled until Arman approves one). Browser traffic is read-only and cannot write
-- the shadow log, so this compares both forms of the access kernel, in its own transaction, for
-- admin@admin.com, test@test.com and p_people random members, each on p_tables random Tables at
-- viewer and editor, through iam.has_access_for_shadow (which logs and raises system errors).
declare
  v_people uuid[];
  v_p uuid;
  v_lvl text;
  v_targets uuid[];
  v_n integer := 0;
begin
  v_people := array['87a6e699-3622-4869-8843-d0867456c0dd'::uuid, '4060701e-706a-4c76-b3ca-0bbc69fa5a14'::uuid]
           || array(select distinct on (u) u from (select om.user_id as u from iam.organization_member om
                                                   order by random() limit greatest(p_people, 0) * 4) z
                     limit greatest(p_people, 0));
  foreach v_p in array v_people loop
    v_targets := array(select r.id from custom.record r tablesample system (5)
                        where r.table_id = custom.table_kernel_id() limit greatest(p_tables, 1));
    foreach v_lvl in array array['viewer', 'editor'] loop
      perform 1 from iam.has_access_for_shadow(v_p, v_targets, v_lvl, 'record', 'iam.kernel_shadow_sweep');
      v_n := v_n + coalesce(cardinality(v_targets), 0);
    end loop;
  end loop;
  return jsonb_build_object('people', cardinality(v_people), 'compared', v_n);
end;
$function$;

revoke all on function iam.kernel_shadow_sweep(integer, integer) from public, anon, authenticated;
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
values ('iam', 'kernel_shadow_sweep', pg_get_function_identity_arguments('iam.kernel_shadow_sweep(integer,integer)'::regprocedure),
        array['integer'::regtype, 'integer'::regtype]::oid[],
        'p_people and p_tables are counts (negative treated as 0 / 1); no entity-id arguments.',
        'migrations/kernel_shadow_e_sampled_drift_guard.sql (lane KERNEL-SHADOW)',
        'server_only: run by the owning lane or an approved schedule (proposed: kernel-shadow-sweep, every 30 minutes); it writes iam.access_shadow_log, so no client ever calls it.', false, false);
