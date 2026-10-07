-- reference_picker_hidden_types_machinery_g11a — five more machinery types
-- leave the "Add a reference" picker.
--
-- WHY (G11A review, 2026-10-07): "All types" still offered, to a non-technical
-- expert, types they never link to:
--   mandate          — a code-owned point where a job is fulfilled (vocabulary
--                      § Mandate); a person works with the agent, not the slot;
--   tool_bundle      — a grouping of agent tools, configured in admin;
--   data_store       — "being replaced by Scopes" (vocabulary § Data Store);
--   code_repository  — an indexed git repository behind Knowledge;
--   canvas_item      — has no page to open (entityRegistry: no href), so a
--                      reference to one would be a dead end.
-- `flexible_data` leaves the list: it is no longer reference-pickable.
-- Kept, because a person references them: Scope (now under Workspace) and
-- Public Form (now under Communication) — groups are code
-- (features/scopes/utils/referenceTypeGroups.ts).
--
-- The organization's own value is replaced only when it still equals the
-- previous starting value (nobody customised it); a customised value is left
-- alone. Idempotent. Reversible: set `value`/`default_value` back to the list in
-- reference_picker_hidden_types_taxonomy.sql.
--
-- Guard: features/matrx-envelope/components/reference-picker/__tests__/one-name-per-type-no-group-of-one.test.ts

INSERT INTO platform.feature_knob (
  feature, key, value, default_value, value_type, unit,
  label, description, set_by, basis, review_due,
  overridable_by, override_direction
) VALUES
(
  'platform.reference_picker', 'hidden_types',
  '["agent_surface_binding","ai_api","ai_endpoint","ai_provider","ai_setting","canvas_comment","canvas_item","canvas_score","category","code_repository","content_ir_kind","content_ir_kind_instance","context_item","cx_agent_memory","data_store","feature_doc","game_result","heatmap_save","hr_jurisdiction_rule_class","hr_record_class","league_membership","mandate","organization","page_extraction_job","pc_studio_run","processed_document","scope_type","shared_canvas_item","skill_render_definition","surface","tool_bundle","user_markdown_sample","wbx_pattern","web_analysis_item","web_provider","workflow_trigger"]'::jsonb,
  '["agent_surface_binding","ai_api","ai_endpoint","ai_provider","ai_setting","canvas_comment","canvas_item","canvas_score","category","code_repository","content_ir_kind","content_ir_kind_instance","context_item","cx_agent_memory","data_store","feature_doc","game_result","heatmap_save","hr_jurisdiction_rule_class","hr_record_class","league_membership","mandate","organization","page_extraction_job","pc_studio_run","processed_document","scope_type","shared_canvas_item","skill_render_definition","surface","tool_bundle","user_markdown_sample","wbx_pattern","web_analysis_item","web_provider","workflow_trigger"]'::jsonb,
  'json', NULL,
  'Add a reference — types never offered',
  'Entity type tokens the "Add a reference" picker leaves out of its type list and search. Child rows of other records are always left out. A type in "types offered first" is still offered.',
  'agent',
  'G11A review 2026-10-07: Mandate, Tool Bundle, Data Store, Code Repository and Canvas Item sat in All types. Machinery (and a type with no page to open) is hidden; things a person references keep a product name.',
  (current_date + 60),
  ARRAY['organization'], 'any'
)
ON CONFLICT (feature, key) DO UPDATE SET
  value = CASE
    WHEN platform.feature_knob.value = platform.feature_knob.default_value
      THEN EXCLUDED.value
    ELSE platform.feature_knob.value
  END,
  default_value = EXCLUDED.default_value,
  basis         = EXCLUDED.basis,
  review_due    = EXCLUDED.review_due,
  updated_at    = now();
