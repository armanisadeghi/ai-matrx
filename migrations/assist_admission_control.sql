-- Assist admission control
--
-- One reversible decision point for every writer. The producer registry is
-- resolved before a row enters the ledger; global quiet and per-producer
-- pending budgets are enforced for browser, Python, and database producers.
-- Paid/model producers must also call the decision function before doing work.

CREATE OR REPLACE FUNCTION platform.assist_admission_decision(
  p_source_key text,
  p_user_id uuid
)
RETURNS TABLE (
  allowed boolean,
  reason text,
  pending_count integer,
  pending_limit integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_policy platform.assist_producer_policy;
  v_quiet_until text;
  v_pending integer := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN QUERY SELECT false, 'missing_recipient'::text, 0, 0;
    RETURN;
  END IF;

  SELECT * INTO v_policy
    FROM platform.resolve_assist_producer_policy(p_source_key);

  IF v_policy.id IS NULL THEN
    RETURN QUERY SELECT false, 'unregistered_source'::text, 0, 0;
    RETURN;
  END IF;

  IF NOT v_policy.production_enabled THEN
    RETURN QUERY
      SELECT false, 'production_disabled'::text, 0,
             v_policy.max_pending_per_user;
    RETURN;
  END IF;

  SELECT up.preferences #>> '{assists,quietUntil}'
    INTO v_quiet_until
    FROM users.user_preferences up
   WHERE up.user_id = p_user_id
     AND up.deleted_at IS NULL
   LIMIT 1;

  IF v_quiet_until = 'infinity'
     OR (
       v_quiet_until ~ '^\d{4}-\d{2}-\d{2}T'
       AND v_quiet_until::timestamptz > now()
     ) THEN
    RETURN QUERY
      SELECT false, 'user_quiet'::text, 0,
             v_policy.max_pending_per_user;
    RETURN;
  END IF;

  SELECT count(*)::integer
    INTO v_pending
    FROM platform.assists a
   WHERE a.user_id = p_user_id
     AND a.status = 'pending'
     AND a.deleted_at IS NULL
     AND (a.expires_at IS NULL OR a.expires_at > now())
     AND (
       (v_policy.match_kind = 'exact' AND a.source_key = v_policy.source_pattern)
       OR
       (v_policy.match_kind = 'prefix' AND a.source_key LIKE v_policy.source_pattern || '%')
     );

  IF v_pending >= v_policy.max_pending_per_user THEN
    RETURN QUERY
      SELECT false, 'pending_budget_reached'::text, v_pending,
             v_policy.max_pending_per_user;
    RETURN;
  END IF;

  RETURN QUERY
    SELECT true, 'allowed'::text, v_pending,
           v_policy.max_pending_per_user;
END;
$$;

REVOKE ALL ON FUNCTION platform.assist_admission_decision(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.assist_admission_decision(text, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION platform.my_assist_admission_decision(p_source_key text)
RETURNS TABLE (
  allowed boolean,
  reason text,
  pending_count integer,
  pending_limit integer
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT *
    FROM platform.assist_admission_decision(p_source_key, auth.uid())
$$;

REVOKE ALL ON FUNCTION platform.my_assist_admission_decision(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.my_assist_admission_decision(text)
  TO authenticated;

CREATE OR REPLACE FUNCTION private.enforce_assist_admission()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_decision record;
BEGIN
  SELECT * INTO v_decision
    FROM platform.assist_admission_decision(NEW.source_key, NEW.user_id);

  IF NOT COALESCE(v_decision.allowed, false) THEN
    -- Returning NULL is deliberately non-destructive: the producer receives
    -- no ledger row, while its domain work and existing Assist history remain
    -- untouched. Paid producers preflight this same decision before spending.
    RAISE LOG 'Assist admission refused source=% user=% reason=% pending=% limit=%',
      NEW.source_key, NEW.user_id, v_decision.reason,
      v_decision.pending_count, v_decision.pending_limit;
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_assist_admission ON platform.assists;
CREATE TRIGGER trg_enforce_assist_admission
  BEFORE INSERT ON platform.assists
  FOR EACH ROW EXECUTE FUNCTION private.enforce_assist_admission();

COMMENT ON FUNCTION platform.assist_admission_decision(text, uuid) IS
  'Canonical preflight for server producers. Checks registry, recipient quiet, and the producer family pending budget before optional work starts.';
COMMENT ON FUNCTION platform.my_assist_admission_decision(text) IS
  'Authenticated self-service Assist preflight for browser producers.';

NOTIFY pgrst, 'reload schema';
