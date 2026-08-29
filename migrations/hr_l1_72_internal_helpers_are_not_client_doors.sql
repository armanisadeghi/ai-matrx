-- HR trigger helpers are internal implementation details, not client RPCs.
-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default, and
-- CREATE OR REPLACE preserves any explicit role grants already present.  Name
-- every client role here so a historical explicit anon/authenticated grant
-- cannot survive the broader PUBLIC revocation.

revoke all on function hr._employment_membership_sync_tg()
  from public, anon, authenticated;
revoke all on function hr._employment_position_sync_tg()
  from public, anon, authenticated;
revoke all on function hr._employment_service_dates_tg()
  from public, anon, authenticated;

-- Restoring an employee is a signed-in HR action.  The original migration
-- revoked PUBLIC but an explicit anon grant survived on the live function.
revoke all on function public.hr_employee_restore(jsonb)
  from public, anon, authenticated;
grant execute on function public.hr_employee_restore(jsonb) to authenticated;
