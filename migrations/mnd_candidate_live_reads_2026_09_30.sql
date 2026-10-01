-- chair-step: adds two candidate read functions and revokes their default PUBLIC execute before granting authenticated
--
-- mnd_candidate_live_reads_2026_09_30.sql
--
-- TWO READS THE CANDIDATE SCREENS NEED (Mandate Candidates; verification V1
-- defects D3 and D4). Arman, 2026-09-28: "each one that comes in showing up as
-- a count on the mandate list and page".
--
-- 1. public.mnd_candidate_cells(uuid[]) — the open-candidate cell for a page of
--    mandates, from the SAME helper the admin list uses
--    (mandate._admin_list_candidate, mnd_admin_list_candidates_column_2026_09_30),
--    so the member lists and the admin list can never disagree. SECURITY INVOKER:
--    each candidate row answers through its own row security (a candidate
--    inherits its mandate's access). Used by the member/org mandate list and by
--    every list cell's heartbeat while a candidate collects. At most 200 ids.
--
-- 2. Knob mandates.candidate_poll_seconds — how often a screen showing a
--    collecting candidate re-reads it. Supabase Realtime drops rows while the
--    socket claims to be connected, so screens showing work in progress poll on
--    a heartbeat while that work runs, and only then.
--
-- Additive only; re-appliable. Inverse:
-- migrations/inverse/mnd_candidate_live_reads_2026_09_30_down.sql

CREATE OR REPLACE FUNCTION public.mnd_candidate_cells(p_mandate_ids uuid[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(jsonb_object_agg(x.id::text, mandate._admin_list_candidate(x.id)), '{}'::jsonb)
  FROM (SELECT DISTINCT unnest(p_mandate_ids[1:200]) AS id) x
  WHERE x.id IS NOT NULL
$function$;

COMMENT ON FUNCTION public.mnd_candidate_cells(uuid[]) IS
  'Mandate Candidates (FX-F): {mandate_id: open-candidate cell | null} for up to 200 mandates — the same cell mnd_admin_list answers (mandate._admin_list_candidate). Row security decides what answers.';

REVOKE ALL ON FUNCTION public.mnd_candidate_cells(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mnd_candidate_cells(uuid[]) TO authenticated;

-- Agent-set by Claude Opus 5.5 (Mandate Candidates FX-F), 2026-09-30; Arman has
-- NOT reviewed it. A platform backstop over shared machinery, so it is locked
-- like the other mandates operational knobs. A human's value is never overwritten.
INSERT INTO platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value,
   allowed_values, label, description, set_by, basis, review_due,
   overridable_by, override_direction, taxonomy_node_id)
VALUES
  ('mandates', 'candidate_poll_seconds', '10', '10', 'integer', 'seconds', 3, 300, NULL,
   'How often candidate screens refresh while collecting',
   'While a candidate is collecting real runs, the mandate list, the Candidates tab and any open pair or summary window re-read it this often, so a new result shows up without a reload. Screens stop refreshing once nothing is collecting.',
   'agent',
   'A candidate run takes 30-60 s end to end (V1 measured 28-48 s), so 10 s shows a finished pair within a sixth of its own run time while costing one small read per open screen. Realtime is not used because it drops rows while the socket reports connected.',
   date '2026-10-31', '{}', 'any',
   (SELECT taxonomy_node_id FROM platform.feature_knob WHERE feature = 'mandates' AND taxonomy_node_id IS NOT NULL LIMIT 1))
ON CONFLICT (feature, key) DO UPDATE SET
  default_value = excluded.default_value,
  label = excluded.label,
  description = excluded.description,
  basis = excluded.basis,
  unit = excluded.unit,
  min_value = excluded.min_value,
  max_value = excluded.max_value,
  overridable_by = excluded.overridable_by,
  taxonomy_node_id = coalesce(platform.feature_knob.taxonomy_node_id, excluded.taxonomy_node_id),
  value = CASE WHEN platform.feature_knob.set_by = 'human' THEN platform.feature_knob.value ELSE excluded.value END,
  review_due = CASE WHEN platform.feature_knob.set_by = 'human' THEN platform.feature_knob.review_due ELSE excluded.review_due END;
