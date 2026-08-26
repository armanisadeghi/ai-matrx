-- Retention policy settling period — ENFORCED, not merely defaulted — 2026-08-26
--
-- THE HOLE (adversarial review F7 / THE_PLAN AR-9, verified open 2026-08-26)
-- `platform.retention_policy.effective_from` is the settling period: the resolver
-- (`platform.resolve_retention_policy`) only considers rows where
-- `effective_from <= now()`, so a newly-armed policy cannot destroy anything until it
-- has sat visible for a while. That interval was encoded ONLY as a column DEFAULT
-- (`now() + '24:00:00'`).
--
-- A DEFAULT protects exactly one case: an INSERT that omits the column. It does nothing
-- about an INSERT that supplies a past timestamp, and — the dangerous one — nothing at
-- all about an UPDATE. So today a single statement:
--
--     UPDATE platform.retention_policy SET mode = 'purge', retention_days = 1
--      WHERE scope = 'global';
--
-- flips the platform-wide floor row from "retain forever" to "destroy" and it is live
-- IMMEDIATELY, with zero settling, for every entity that has no more specific policy.
-- Any holder of service_role can do it; RLS does not apply to service_role and there is
-- no trigger on this table. The engine is inert today, which is the only reason this has
-- not mattered — this closes it before it can.
--
-- THE RULE
-- Any change that leaves a row able to destroy data must set `effective_from` at least
-- one settling interval into the future. Changes that make the platform SAFER are exempt
-- and take effect instantly — turning a policy off, setting `mode='never'`, or placing a
-- legal hold. Waiting 24h to start protecting data would be backwards; the resolver
-- already says exactly this about legal holds.
--
-- Refusal, not silent correction. This system's proven pattern is to refuse and explain
-- (the seven refusals, the registry-drift refusal). Quietly rewriting a caller's
-- `effective_from` would hide the fact that they tried to arm destruction now.
--
-- ONE AUTHORITY FOR THE INTERVAL
-- The 24h lived as a literal inside a column default. It is now a knob
-- (`platform.feature_knob` — the house pattern for every limit) read through ONE
-- function, which both the column default and the trigger call. No second constant.

-- ---------------------------------------------------------------------------
-- 1. The knob, and the single reader
-- ---------------------------------------------------------------------------
INSERT INTO platform.feature_knob (
  feature, key, value, default_value, value_type, unit,
  min_value, max_value, label, description, set_by, basis, review_due
) VALUES (
  'data_lifecycle', 'policy_settling_hours',
  to_jsonb(24), to_jsonb(24), 'number', 'hours',
  1, 720,
  'Retention policy settling period',
  'How long a retention policy that can destroy data must sit visible before the resolver will honour it. Safety-increasing changes (disable, mode=never, legal hold) are exempt and apply instantly.',
  'agent',
  'Held at 24 hours — the value already encoded in the retention_policy.effective_from column default since the policy store shipped (2026-08-21). This migration changes WHERE the number lives and whether it is enforced, deliberately not the number itself, so nothing about the intended behaviour moves on the day enforcement lands.',
  '2026-10-24'
)
ON CONFLICT (feature, key) DO NOTHING;

CREATE OR REPLACE FUNCTION platform.retention_settling_interval()
RETURNS interval
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_hours numeric;
BEGIN
  SELECT (k.value #>> '{}')::numeric INTO v_hours
  FROM platform.feature_knob k
  WHERE k.feature = 'data_lifecycle' AND k.key = 'policy_settling_hours';

  -- No fallback constant. A missing knob must not silently become "no settling".
  IF v_hours IS NULL THEN
    RAISE EXCEPTION
      'platform.retention_settling_interval: feature knob data_lifecycle.policy_settling_hours is missing — refusing to imply a settling period'
      USING ERRCODE = '22023';
  END IF;

  RETURN make_interval(secs => (v_hours * 3600)::double precision);
END $function$;

COMMENT ON FUNCTION platform.retention_settling_interval() IS
  'The ONE authority for the retention settling period. Read by the retention_policy.effective_from column default and by the settling trigger.';

REVOKE ALL ON FUNCTION platform.retention_settling_interval() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.retention_settling_interval() TO authenticated, service_role;

-- The column default now reads the same authority instead of carrying its own literal.
ALTER TABLE platform.retention_policy
  ALTER COLUMN effective_from SET DEFAULT (now() + platform.retention_settling_interval());

-- ---------------------------------------------------------------------------
-- 2. The enforcement
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION platform.enforce_retention_policy_settling()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_interval interval;
  v_min      timestamptz;
  v_changed  boolean;
BEGIN
  -- A row that cannot destroy anything needs no settling. This is the exemption that
  -- makes the guard safe to live with: you can always make the platform safer instantly.
  IF NOT NEW.enabled OR NEW.mode = 'never' OR NEW.legal_hold THEN
    RETURN NEW;
  END IF;

  -- Which fields decide WHAT gets destroyed. Everything absent from this list
  -- (label, description, basis, review_due, updated_by, updated_at, warn_days) is
  -- editorial and must never re-arm the clock — otherwise fixing a typo in a
  -- description would silently postpone a legitimate policy by a day.
  IF TG_OP = 'UPDATE' THEN
    v_changed := (
         OLD.scope            IS DISTINCT FROM NEW.scope
      OR OLD.entity_token     IS DISTINCT FROM NEW.entity_token
      OR OLD.taxonomy_node_id IS DISTINCT FROM NEW.taxonomy_node_id
      OR OLD.organization_id  IS DISTINCT FROM NEW.organization_id
      OR OLD.user_id          IS DISTINCT FROM NEW.user_id
      OR OLD.user_predicate   IS DISTINCT FROM NEW.user_predicate
      OR OLD.trigger_kind     IS DISTINCT FROM NEW.trigger_kind
      OR OLD.mode             IS DISTINCT FROM NEW.mode
      OR OLD.retention_days   IS DISTINCT FROM NEW.retention_days
      OR OLD.archive_tier     IS DISTINCT FROM NEW.archive_tier
      OR OLD.legal_hold       IS DISTINCT FROM NEW.legal_hold
      OR OLD.priority         IS DISTINCT FROM NEW.priority
      OR OLD.enabled          IS DISTINCT FROM NEW.enabled
    );
  ELSE
    v_changed := true;   -- every INSERT of a destructive policy settles
  END IF;

  IF NOT v_changed THEN
    RETURN NEW;
  END IF;

  v_interval := platform.retention_settling_interval();
  v_min      := now() + v_interval;

  IF NEW.effective_from < v_min THEN
    RAISE EXCEPTION
      'retention policy settling: this change arms destruction (scope=%, mode=%, retention_days=%), so effective_from must be at least % from now — you gave %, which is % too early. Set effective_from = now() + interval ''%'' (or make the row safe instead: enabled=false, mode=''never'', or legal_hold=true, all of which apply instantly).',
      NEW.scope, NEW.mode, NEW.retention_days, v_interval, NEW.effective_from,
      (v_min - NEW.effective_from), v_interval
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END $function$;

COMMENT ON FUNCTION platform.enforce_retention_policy_settling() IS
  'Standing guard (2026-08-26): a retention_policy change that can destroy data must sit one settling interval in the future. Safety-increasing changes are exempt and instant. Closes the one-UPDATE global-purge hole (review F7 / THE_PLAN AR-9).';

DROP TRIGGER IF EXISTS _enforce_settling ON platform.retention_policy;
CREATE TRIGGER _enforce_settling
  BEFORE INSERT OR UPDATE ON platform.retention_policy
  FOR EACH ROW EXECUTE FUNCTION platform.enforce_retention_policy_settling();
