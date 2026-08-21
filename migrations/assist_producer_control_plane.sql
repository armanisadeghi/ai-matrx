-- Assist producer control plane
--
-- Additive and reversible: producer implementations and existing assist rows
-- remain untouched. Super Admins change policy through one audited RPC; both
-- browser and server producers can read the same registry before doing work.

CREATE TABLE IF NOT EXISTS platform.assist_producer_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_pattern text NOT NULL,
  match_kind text NOT NULL DEFAULT 'exact'
    CHECK (match_kind IN ('exact', 'prefix')),
  display_name text NOT NULL,
  feature_key text NOT NULL,
  disposition text NOT NULL DEFAULT 'assist'
    CHECK (disposition IN ('assist', 'notification', 'report', 'task', 'disabled')),
  audit_status text NOT NULL DEFAULT 'pending'
    CHECK (audit_status IN ('pending', 'approved', 'redesign', 'migrating', 'retired')),
  production_enabled boolean NOT NULL DEFAULT true,
  presentation_enabled boolean NOT NULL DEFAULT false,
  cost_class text NOT NULL DEFAULT 'free'
    CHECK (cost_class IN ('free', 'provider', 'agent')),
  max_pending_per_user integer NOT NULL DEFAULT 3
    CHECK (max_pending_per_user BETWEEN 0 AND 1000),
  max_presented_per_cycle integer NOT NULL DEFAULT 1
    CHECK (max_presented_per_cycle BETWEEN 0 AND 3),
  working_message text,
  rationale text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(config) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  version integer NOT NULL DEFAULT 1,
  UNIQUE (source_pattern, match_kind),
  CHECK (match_kind <> 'prefix' OR source_pattern <> '')
);

COMMENT ON TABLE platform.assist_producer_policy IS
  'Reversible governance for every Assist producer family. production_enabled is checked before work; presentation_enabled controls ambient eligibility independently.';

CREATE TABLE IF NOT EXISTS platform.assist_producer_policy_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  policy_id uuid NOT NULL,
  source_pattern text NOT NULL,
  match_kind text NOT NULL,
  before jsonb,
  after jsonb NOT NULL,
  reason text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid
);

CREATE INDEX IF NOT EXISTS assist_producer_policy_prefix_idx
  ON platform.assist_producer_policy (match_kind, source_pattern);
CREATE INDEX IF NOT EXISTS assist_producer_policy_history_policy_idx
  ON platform.assist_producer_policy_history (policy_id, changed_at DESC);

ALTER TABLE platform.assist_producer_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.assist_producer_policy_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assist_producer_policy_read ON platform.assist_producer_policy;
CREATE POLICY assist_producer_policy_read
  ON platform.assist_producer_policy FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS assist_producer_policy_history_admin_read ON platform.assist_producer_policy_history;
CREATE POLICY assist_producer_policy_history_admin_read
  ON platform.assist_producer_policy_history FOR SELECT TO authenticated
  USING (public.is_admin());

GRANT SELECT ON platform.assist_producer_policy TO authenticated;
GRANT SELECT ON platform.assist_producer_policy_history TO authenticated;

CREATE OR REPLACE FUNCTION platform.resolve_assist_producer_policy(p_source_key text)
RETURNS platform.assist_producer_policy
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.*
  FROM platform.assist_producer_policy p
  WHERE (p.match_kind = 'exact' AND p.source_pattern = p_source_key)
     OR (p.match_kind = 'prefix' AND p_source_key LIKE p.source_pattern || '%')
  ORDER BY
    CASE WHEN p.match_kind = 'exact' THEN 0 ELSE 1 END,
    length(p.source_pattern) DESC
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION platform.resolve_assist_producer_policy(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.resolve_assist_producer_policy(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION platform.assist_production_allowed(p_source_key text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT production_enabled
       FROM platform.resolve_assist_producer_policy(p_source_key)),
    false
  )
$$;

REVOKE ALL ON FUNCTION platform.assist_production_allowed(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.assist_production_allowed(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION platform.list_my_presentable_assists(p_limit integer DEFAULT 50)
RETURNS SETOF platform.assists
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT a.*
    FROM platform.assists a
    JOIN LATERAL platform.resolve_assist_producer_policy(a.source_key) policy
      ON true
   WHERE auth.uid() IS NOT NULL
     AND a.user_id = auth.uid()
     AND a.status = 'pending'
     AND a.deleted_at IS NULL
     AND (a.expires_at IS NULL OR a.expires_at > now())
     AND (a.suppressed_until IS NULL OR a.suppressed_until < now())
     AND policy.production_enabled
     AND policy.presentation_enabled
     AND policy.disposition = 'assist'
   ORDER BY a.priority DESC, a.created_at DESC
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)
$$;

REVOKE ALL ON FUNCTION platform.list_my_presentable_assists(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.list_my_presentable_assists(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_upsert_assist_producer_policy(
  p_source_pattern text,
  p_match_kind text,
  p_display_name text,
  p_feature_key text,
  p_disposition text,
  p_audit_status text,
  p_production_enabled boolean,
  p_presentation_enabled boolean,
  p_cost_class text,
  p_max_pending_per_user integer,
  p_max_presented_per_cycle integer,
  p_working_message text,
  p_rationale text,
  p_config jsonb,
  p_reason text,
  p_expected_version integer DEFAULT NULL
)
RETURNS platform.assist_producer_policy
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_before platform.assist_producer_policy;
  v_after platform.assist_producer_policy;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden: Super Admin required' USING ERRCODE = '42501';
  END IF;
  IF btrim(COALESCE(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'A change reason is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_before
    FROM platform.assist_producer_policy
   WHERE source_pattern = p_source_pattern AND match_kind = p_match_kind
   FOR UPDATE;

  IF FOUND AND p_expected_version IS NOT NULL AND v_before.version <> p_expected_version THEN
    RAISE EXCEPTION 'Assist producer policy changed since it was loaded'
      USING ERRCODE = '40001';
  END IF;

  INSERT INTO platform.assist_producer_policy AS policy (
    source_pattern, match_kind, display_name, feature_key, disposition,
    audit_status, production_enabled, presentation_enabled, cost_class,
    max_pending_per_user, max_presented_per_cycle, working_message, rationale,
    config, created_by, updated_by
  ) VALUES (
    p_source_pattern, p_match_kind, p_display_name, p_feature_key, p_disposition,
    p_audit_status, p_production_enabled, p_presentation_enabled, p_cost_class,
    p_max_pending_per_user, p_max_presented_per_cycle, p_working_message,
    p_rationale, COALESCE(p_config, '{}'::jsonb), auth.uid(), auth.uid()
  )
  ON CONFLICT (source_pattern, match_kind) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    feature_key = EXCLUDED.feature_key,
    disposition = EXCLUDED.disposition,
    audit_status = EXCLUDED.audit_status,
    production_enabled = EXCLUDED.production_enabled,
    presentation_enabled = EXCLUDED.presentation_enabled,
    cost_class = EXCLUDED.cost_class,
    max_pending_per_user = EXCLUDED.max_pending_per_user,
    max_presented_per_cycle = EXCLUDED.max_presented_per_cycle,
    working_message = EXCLUDED.working_message,
    rationale = EXCLUDED.rationale,
    config = EXCLUDED.config,
    updated_at = now(),
    updated_by = auth.uid(),
    version = policy.version + 1
  RETURNING * INTO v_after;

  INSERT INTO platform.assist_producer_policy_history (
    policy_id, source_pattern, match_kind, before, after, reason, changed_by
  ) VALUES (
    v_after.id, v_after.source_pattern, v_after.match_kind,
    CASE WHEN v_before.id IS NULL THEN NULL ELSE to_jsonb(v_before) END,
    to_jsonb(v_after), p_reason, auth.uid()
  );

  RETURN v_after;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_assist_producer_policy(
  text, text, text, text, text, text, boolean, boolean, text,
  integer, integer, text, text, jsonb, text, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_upsert_assist_producer_policy(
  text, text, text, text, text, text, boolean, boolean, text,
  integer, integer, text, text, jsonb, text, integer
) TO authenticated;

-- Known families start presentation-ineligible until their product audit is
-- approved. Production remains on except for proven junk/meta-noise paths.
INSERT INTO platform.assist_producer_policy (
  source_pattern, match_kind, display_name, feature_key, disposition,
  audit_status, production_enabled, presentation_enabled, cost_class,
  max_pending_per_user, max_presented_per_cycle, working_message, rationale
) VALUES
  ('cloud_browser_handoff', 'exact', 'Cloud Browser handoff', 'cloud_browser', 'task', 'pending', true, false, 'free', 3, 1, NULL, 'A takeover notice is work, not an ambient treat.'),
  ('content_ir.', 'prefix', 'Shape suggestions', 'content_ir', 'assist', 'redesign', true, false, 'agent', 3, 1, 'Building this for you', 'Eligible only after the action executes the improvement in one click.'),
  ('content_plan.', 'prefix', 'Content Plan suggestions', 'content_plan', 'assist', 'redesign', true, false, 'free', 3, 1, NULL, 'Current rows open analysis rather than completing a small outcome.'),
  ('crm.', 'prefix', 'CRM suggestions', 'crm', 'assist', 'redesign', true, false, 'free', 3, 1, NULL, 'Review each CRM action for preview and reversibility before presentation.'),
  ('education.', 'prefix', 'Education notices', 'education', 'notification', 'migrating', true, false, 'free', 3, 1, NULL, 'Health and retention notices belong in notifications.'),
  ('engram_lifecycle.', 'prefix', 'Engram lifecycle', 'engram', 'notification', 'migrating', true, false, 'free', 3, 1, NULL, 'Lifecycle receipts are notifications, not Assist actions.'),
  ('growth_loop.', 'prefix', 'Growth Loop notices', 'growth_loop', 'task', 'migrating', true, false, 'free', 3, 1, NULL, 'Approvals and deadlines belong in work or notifications.'),
  ('hindsight_finding', 'exact', 'Hindsight findings', 'hindsight', 'report', 'migrating', true, false, 'agent', 3, 1, NULL, 'Findings belong in the Hindsight report; the review may have value independent of the chip.'),
  ('hindsight_', 'prefix', 'Hindsight diagnostics', 'hindsight', 'report', 'migrating', true, false, 'free', 3, 1, NULL, 'Diagnostic findings belong in Hindsight, not the ambient Assist surface.'),
  ('hindsight.', 'prefix', 'Hindsight lifecycle', 'hindsight', 'report', 'migrating', true, false, 'agent', 3, 1, NULL, 'Hindsight system output belongs in its report.'),
  ('hindsight_walk', 'exact', 'Hindsight walk test output', 'hindsight', 'disabled', 'retired', false, false, 'agent', 0, 0, NULL, 'Integration tests wrote permanent junk into real user queues.'),
  ('masterwork.', 'prefix', 'Masterwork guidance', 'masterwork', 'task', 'redesign', true, false, 'free', 3, 1, NULL, 'Current long-form guidance is real work and must be redesigned before ambient use.'),
  ('notes.', 'prefix', 'Notes suggestions', 'notes', 'assist', 'redesign', true, false, 'free', 1, 1, NULL, 'May qualify after copy and one-click outcome audit.'),
  ('notifications.', 'prefix', 'Notification actions', 'notifications', 'notification', 'migrating', true, false, 'free', 3, 1, NULL, 'The source name already identifies this as notification traffic.'),
  ('outreach.', 'prefix', 'Outreach notices', 'outreach', 'notification', 'migrating', true, false, 'free', 3, 1, NULL, 'Backlogs, approvals, and send blockers are notifications or tasks.'),
  ('platform.producer_yield', 'exact', 'Producer yield watchdog', 'platform', 'report', 'retired', false, false, 'free', 0, 0, NULL, 'A watchdog about low-value chips must not create another complaint chip.'),
  ('scheduler_', 'prefix', 'Scheduler incidents', 'scheduler', 'notification', 'migrating', true, false, 'free', 3, 1, NULL, 'Operational incidents belong in notifications and error reporting.'),
  ('seo.backlink_assist.', 'prefix', 'Backlink suggestions', 'seo', 'assist', 'redesign', true, false, 'free', 3, 1, NULL, 'Potential Assist family; each action needs a direct, reversible outcome.'),
  ('seo.competitor_classification', 'exact', 'Competitor classification', 'seo', 'assist', 'redesign', true, false, 'agent', 3, 1, 'Classifying this competitor', 'Current implementation can re-nag and does not execute on acceptance.'),
  ('seo.finding', 'prefix', 'SEO findings', 'seo', 'report', 'migrating', true, false, 'free', 3, 1, NULL, 'Findings are report content and should not monopolize ambient presentation.'),
  ('seo.gsc_insight.', 'prefix', 'Search Console insights', 'seo', 'assist', 'redesign', true, false, 'free', 3, 1, NULL, 'Insights qualify only when accepting completes a small useful action.'),
  ('tasks.', 'prefix', 'Task notices', 'tasks', 'task', 'migrating', true, false, 'free', 1, 1, NULL, 'Existing overdue work belongs in Tasks, not Assists.'),
  ('web.', 'prefix', 'Web diagnostics', 'web', 'report', 'migrating', true, false, 'provider', 3, 1, NULL, 'Coverage, endpoint, and anomaly observations belong in reports or notifications.'),
  ('web_', 'prefix', 'Web operational guards', 'web', 'notification', 'migrating', true, false, 'free', 3, 1, NULL, 'Operational guards belong in notifications.'),
  ('workflow.', 'prefix', 'Workflow guidance', 'workflow', 'task', 'redesign', true, false, 'agent', 3, 1, 'Preparing this workflow improvement', 'Blocked work and recovery are tasks; reusable extraction needs a one-click execution audit.')
ON CONFLICT (source_pattern, match_kind) DO NOTHING;

INSERT INTO platform.assist_producer_policy_history (
  policy_id, source_pattern, match_kind, before, after, reason, changed_by
)
SELECT id, source_pattern, match_kind, NULL, to_jsonb(p),
       'Initial Chip Rescue producer audit seed', NULL
  FROM platform.assist_producer_policy p
 WHERE NOT EXISTS (
   SELECT 1 FROM platform.assist_producer_policy_history h
    WHERE h.policy_id = p.id
 );

NOTIFY pgrst, 'reload schema';
