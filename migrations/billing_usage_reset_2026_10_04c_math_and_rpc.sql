-- chair-step: the REVOKE withdraws default EXECUTE from users.admin_account_points_month, which this same file creates (never granted to anyone before this transaction); nothing that existed before is narrowed.
--
-- billing_usage_reset_2026_10_04c_math_and_rpc.sql
--
-- Originally three parts. Parts 1-2 (person-window resets inside billing._points_usage_state and
-- the super-admin billing.usage_reset_apply door) already landed live by another route, together
-- with the enterprise custom-limits extension of billing._points_usage_state; they are removed
-- here so this file never reverts that newer body.
--
-- What remains: users.admin_account_points_month() — service-role sibling of
-- users.admin_account_plans(): each account's true AI points spent this calendar month (no reset
-- applied — a reset clears the allowance count, never the spend history), one pass for the admin
-- dashboard.

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

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
values ('users', 'admin_account_points_month', '', array[]::oid[],
        'Takes no entity id; returns each account''s AI points spent this calendar month for the admin usage-limits dashboard.',
        'usage-limits dashboard 2026-10-04',
        'server_only: read by the super-admin usage-limits dashboard through the service-role client; no browser calls it.',
        false, false);

revoke all on function users.admin_account_points_month() from public, anon, authenticated;
grant execute on function users.admin_account_points_month() to service_role;

notify pgrst, 'reload schema';
