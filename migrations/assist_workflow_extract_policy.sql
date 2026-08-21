-- Stop the one paid producer whose only output is an unaudited Assist.
-- The workflow extraction implementation remains intact and can be restored
-- by changing this audited registry row in the administration UI.

INSERT INTO platform.assist_producer_policy (
  source_pattern, match_kind, display_name, feature_key, disposition,
  audit_status, production_enabled, presentation_enabled, cost_class,
  max_pending_per_user, max_presented_per_cycle, working_message, rationale
) VALUES (
  'workflow.extract_reusable', 'exact', 'Reusable workflow extraction',
  'workflow', 'assist', 'redesign', false, false, 'agent', 3, 1,
  'Preparing this workflow improvement',
  'This agent run exists solely to author Assist proposals, so it is blocked before spend until its one-click action and copy pass the Assist audit.'
)
ON CONFLICT (source_pattern, match_kind) DO UPDATE SET
  production_enabled = false,
  presentation_enabled = false,
  audit_status = 'redesign',
  cost_class = 'agent',
  updated_at = now(),
  version = platform.assist_producer_policy.version + 1;

INSERT INTO platform.assist_producer_policy_history (
  policy_id, source_pattern, match_kind, before, after, reason, changed_by
)
SELECT p.id, p.source_pattern, p.match_kind, NULL, to_jsonb(p),
       'Block proposal-only agent spend pending Assist product audit', NULL
  FROM platform.assist_producer_policy p
 WHERE p.source_pattern = 'workflow.extract_reusable'
   AND p.match_kind = 'exact';
