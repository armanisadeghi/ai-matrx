-- chair-step: the REVOKEs withdraw default EXECUTE from the two functions this same file creates (never granted to anyone before this transaction); nothing that existed before is narrowed.
-- based-on: billing._points_usage_state(text, uuid, uuid) abb1c6b6a4ab6e8d4c5e38f24c188d6f55f8e119d3483ae18c3b6fcfb482fbce
--
-- billing_usage_reset_2026_10_04c_math_and_rpc.sql
--
-- 1. billing._points_usage_state — THE one ok/near/over calculation — now counts each PERSON
--    window from greatest(billing.period_start(period), latest billing.usage_reset marker for that
--    person + period). Org scope is unchanged. Rolling windows' resets_at follows the same start.
--    Body is the live body read with pg_get_functiondef plus that change only.
-- 2. billing.usage_reset_apply(p_user, p_periods, p_note) — super-admin; one marker per period;
--    returns the fresh billing.user_usage_state(p_user). Declared as a client-callable door
--    before the GRANT (same shape as billing.user_plan_set's door).
-- 3. users.admin_account_points_month() — service-role sibling of users.admin_account_plans():
--    each account's true AI points spent this calendar month (no reset applied — a reset clears
--    the allowance count, never the spend history), one pass for the admin dashboard.

CREATE OR REPLACE FUNCTION billing._points_usage_state(p_plan text, p_user uuid, p_org uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  -- THE one calculation of ok / near / over (entitlements USAGE-GATE.md).
  -- Exactly one of p_user / p_org is set. Every number comes from rows an admin
  -- edits: billing.plan_limit (per plan, per window), the
  -- billing/usage_near_ratio feature knob (missing knob = no "near" state), and
  -- the enforced switch on billing.capability('platform.points') — returned so
  -- every caller (server cache, browser gate) obeys the same switch.
  -- A person's window starts at the later of its period start and the latest
  -- admin reset for that person + window (billing.usage_reset); org scope never resets.
  with knob as (
    select (select coalesce(k.value, k.default_value) #>> '{}' from platform.feature_knob k
             where k.feature = 'billing' and k.key = 'usage_near_ratio' and k.archived_at is null)::numeric as near_ratio
  ),
  lim as (
    select pl.period, pl.limit_value,
           greatest(billing.period_start(pl.period),
                    case when p_user is not null then
                      (select max(r.reset_at) from billing.usage_reset r
                        where r.subject_user_id = p_user and r.period = pl.period and r.deleted_at is null)
                    end) as window_start
      from billing.plan_limit pl
     where pl.plan_id = p_plan and pl.capability = 'platform.points' and pl.deleted_at is null
  ),
  win as (
    select l.period, l.limit_value,
           case when p_user is not null then
             (select coalesce(sum(ul.quantity), 0)::bigint from billing.usage_ledger ul
               where ul.created_by = p_user and ul.capability = 'platform.points'
                 and ul.created_at >= l.window_start and ul.deleted_at is null)
           else
             (select coalesce(sum(ul.quantity), 0)::bigint from billing.usage_ledger ul
               where ul.organization_id = p_org and ul.capability = 'platform.points'
                 and ul.created_at >= l.window_start and ul.deleted_at is null)
           end as used,
           case when l.period in ('rolling_1h', 'rolling_5h') then
             -- A rolling window frees points when its oldest spend leaves it.
             (select min(ul.created_at) from billing.usage_ledger ul
               where ul.capability = 'platform.points' and ul.deleted_at is null
                 and ul.created_at >= l.window_start
                 and ((p_user is not null and ul.created_by = p_user) or (p_user is null and ul.organization_id = p_org)))
             + (billing.period_reset(l.period) - now())
           else billing.period_reset(l.period) end as resets_at
      from lim l
  ),
  judged as (
    select w.*, k.near_ratio,
      case when w.limit_value is null then 'ok'
           when w.used >= w.limit_value then 'over'
           when k.near_ratio is not null and w.used >= w.limit_value * k.near_ratio then 'near'
           else 'ok' end as state,
      case when w.limit_value is null then 0
           when w.limit_value = 0 then 1e9
           else w.used::numeric / w.limit_value end as pressure
    from win w cross join knob k
  ),
  overall as (
    select case when bool_or(state = 'over') then 'over'
                when bool_or(state = 'near') then 'near' else 'ok' end as state
    from judged
  )
  select jsonb_build_object(
    'plan_key', p_plan,
    'plan_name', (select p.name from billing.plan p where p.plan_key = p_plan),
    'state', coalesce((select state from overall), 'ok'),
    'enforced', coalesce((select c.enforced from billing.capability c where c.capability = 'platform.points' and c.deleted_at is null limit 1), false),
    'near_ratio', (select near_ratio from knob),
    'binding_period', (select j.period from judged j order by j.pressure desc, j.limit_value nulls last limit 1),
    'resets_at', case when (select state from overall) = 'over'
                      then (select max(j.resets_at) from judged j where j.state = 'over')
                      else (select j.resets_at from judged j order by j.pressure desc limit 1) end,
    'windows', coalesce((select jsonb_agg(jsonb_build_object(
                  'period', j.period, 'limit', j.limit_value, 'used', j.used,
                  'remaining', case when j.limit_value is null then null else greatest(j.limit_value - j.used, 0) end,
                  'resets_at', j.resets_at, 'state', j.state) order by j.pressure desc) from judged j), '[]'::jsonb),
    'computed_at', now()
  );
$function$;

CREATE FUNCTION billing.usage_reset_apply(p_user uuid, p_periods billing.meter_period[], p_note text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- Admin reset of a person's AI-points windows (USAGE-GATE.md § Database contract). One
-- billing.usage_reset marker per period; billing._points_usage_state then counts that window
-- from now. Returns the person's fresh usage state so the caller updates in place.
declare v_period billing.meter_period;
begin
  if not public.is_super_admin() then
    raise exception 'billing.usage_reset_apply: super-admin only' using errcode = '42501';
  end if;
  if p_user is null or not exists (select 1 from iam.users u where u.id = p_user) then
    raise exception 'billing.usage_reset_apply: unknown person %', p_user using errcode = '22023';
  end if;
  if p_periods is null or cardinality(p_periods) = 0 then
    raise exception 'billing.usage_reset_apply: name at least one window to reset' using errcode = '22023';
  end if;
  foreach v_period in array (select array_agg(distinct x) from unnest(p_periods) x) loop
    insert into billing.usage_reset (organization_id, subject_user_id, period, reset_at, reset_by, note)
    values ('39c38960-d30c-4840-b0c1-c9960de95582', p_user, v_period, now(), auth.uid(), nullif(btrim(p_note), ''));
  end loop;
  return billing.user_usage_state(p_user);
end;
$function$;

revoke all on function billing.usage_reset_apply(uuid, billing.meter_period[], text) from public, anon;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, gate_predicate, anonymous_callers, signed_in_callers)
select 'billing', 'usage_reset_apply',
       pg_get_function_identity_arguments(p.oid), array['uuid'::regtype, 'billing.meter_period[]'::regtype, 'text'::regtype]::oid[],
       'usage-limits dashboard 2026-10-04',
       'SIGNED-IN door (super-admin gate): resets a person''s AI-points windows (5-hour / week / month …) by writing billing.usage_reset markers; p_user is any account; returns that person''s fresh billing.user_usage_state.',
       'public.is_super_admin()', false, true
  from pg_proc p
 where p.oid = 'billing.usage_reset_apply(uuid, billing.meter_period[], text)'::regprocedure;

grant execute on function billing.usage_reset_apply(uuid, billing.meter_period[], text) to authenticated, service_role;

CREATE FUNCTION users.admin_account_points_month()
 RETURNS TABLE(user_id uuid, points_month bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  -- Each account's AI points spent this calendar month, one pass (admin AI usage limits
  -- dashboard KPI). True spend: an admin reset does not erase it. Service-role only.
  select ul.created_by, coalesce(sum(ul.quantity), 0)::bigint
    from billing.usage_ledger ul
   where ul.capability = 'platform.points' and ul.deleted_at is null
     and ul.created_at >= billing.period_start('month') and ul.created_by is not null
   group by ul.created_by;
$function$;

revoke all on function users.admin_account_points_month() from public, anon, authenticated;
grant execute on function users.admin_account_points_month() to service_role;

notify pgrst, 'reload schema';
