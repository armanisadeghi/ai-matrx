-- SECURITY FIX (2026-08-25): users.guest_executions was readable by ANY anonymous
-- caller over the public REST API.
--
-- The policy `guests_can_check_own_limits` was `FOR SELECT TO anon, authenticated
-- USING (true)` — its name promises "own limits", its predicate granted the whole
-- table. Verified exploitable with nothing but the publishable anon key that ships
-- in the frontend bundle:
--     GET /rest/v1/guest_executions?select=ip_address,fingerprint,auth_user_id
--     -> HTTP 200, 21,840 rows of real IP addresses and browser fingerprints,
--        including converted_to_user_id / auth_user_id linking a fingerprint to a
--        real account.
--
-- WHY THE POLICY EXISTED: `public.check_guest_execution_limit` is INVOKER-rights,
-- so it needed the caller to be able to read the table. That is the wrong lever --
-- the function returns only allowed/remaining/total_used/is_blocked/guest_id for a
-- single fingerprint and never returns PII, so it is the natural trust boundary.
--
-- THE FIX: make that one function SECURITY DEFINER (search_path locked), then drop
-- the blanket read. Every other consumer was checked first and is unaffected:
--   * the only live browser caller is checkGuestLimit() -> this RPC;
--   * getGuestStatus()/getGuestHistory() read the table directly but have ZERO
--     callers (dead debug helpers);
--   * every server path (guest-promotion, guest-oauth-transfer, diagnostics,
--     admin acquisition) uses createAdminClient -> service_role, covered by
--     `service_can_manage_guests`;
--   * admins keep `platform_admin_all` and `admin_all_guest_executions`.
--
-- Side effect, and it is a fix not a regression: the daily-reset UPDATE inside the
-- function could never have applied for an anon caller (there is no anon UPDATE
-- policy -- it silently affected 0 rows). Under definer rights the reset now works
-- as written.
--
-- VERIFIED LIVE over HTTPS with the anon key after applying:
--   read  -> HTTP 200 []            (was 21,840 rows)
--   rpc   -> HTTP 200 {"allowed":true,"remaining":4,...}   (feature intact)

CREATE OR REPLACE FUNCTION public.check_guest_execution_limit(
  p_fingerprint text,
  p_max_executions integer DEFAULT 5
)
RETURNS TABLE(allowed boolean, remaining integer, total_used integer, is_blocked boolean, guest_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_guest users.guest_executions%ROWTYPE;
BEGIN
  SELECT * INTO v_guest
  FROM users.guest_executions
  WHERE fingerprint = p_fingerprint;

  IF v_guest IS NULL THEN
    RETURN QUERY SELECT true, p_max_executions - 1, 0, false, NULL::UUID;
    RETURN;
  END IF;

  IF v_guest.is_blocked AND (v_guest.blocked_until IS NULL OR v_guest.blocked_until > NOW()) THEN
    RETURN QUERY SELECT false, 0, v_guest.total_executions, true, v_guest.id;
    RETURN;
  END IF;

  IF v_guest.daily_reset_at < DATE_TRUNC('day', NOW()) THEN
    UPDATE users.guest_executions
    SET daily_executions = 0,
        daily_reset_at = DATE_TRUNC('day', NOW())
    WHERE id = v_guest.id;
    v_guest.daily_executions := 0;
  END IF;

  IF v_guest.daily_executions >= p_max_executions THEN
    RETURN QUERY SELECT false, 0, v_guest.total_executions, false, v_guest.id;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    true,
    p_max_executions - v_guest.daily_executions - 1,
    v_guest.total_executions,
    false,
    v_guest.id;
END;
$function$;

-- Close the hole.
DROP POLICY IF EXISTS guests_can_check_own_limits ON users.guest_executions;
