-- reference_picker_hidden_types_people_words — five more pieces of machinery
-- leave the "Add a reference" picker.
--
-- WHY (G5 review, 2026-10-02): "All types" still showed storage words beside
-- Note and Task. Each one was judged: is it a thing a person references (then
-- it gets the product's real name, in code — `FRIENDLY_REFERENCE_TYPE_LABELS`:
-- `party` → "Contact", `scope` → "Record"), or machinery (then it is hidden
-- here)? Machinery:
--   * processed_document  — the processing output of a File; a person links the File
--   * content_ir_kind_instance ("Saved Result") — a stored render payload; a person
--     links the chat or document it came from
--   * canvas_comment       — a comment row on a canvas item
--   * shared_canvas_item   — the share record of a canvas item (Canvas Item stays)
--   * workflow_trigger     — a workflow's start configuration (Workflow stays)
--
-- The organization's own value is replaced only when it still equals the
-- previous starting value (nobody customised it); a customised value is left
-- alone. Idempotent. Reversible: set `value`/`default_value` back to the list in
-- reference_picker_hidden_types_knob.sql.
--
-- Guard: features/scopes/utils/__tests__/referenceTypeGroups.test.ts
-- ("no visible type carries a storage word").

INSERT INTO platform.feature_knob (
  feature, key, value, default_value, value_type, unit,
  label, description, set_by, basis, review_due,
  overridable_by, override_direction
) VALUES
(
  'platform.reference_picker', 'hidden_types',
  '["agent_surface_binding","ai_api","ai_endpoint","ai_provider","ai_setting","canvas_comment","canvas_score","content_ir_kind","content_ir_kind_instance","context_item","cx_agent_memory","feature_doc","flexible_data","game_result","heatmap_save","hr_jurisdiction_rule_class","hr_record_class","league_membership","organization","page_extraction_job","pc_studio_run","processed_document","scope_type","shared_canvas_item","skill_render_definition","surface","user_markdown_sample","wbx_pattern","web_analysis_item","web_provider","workflow_trigger"]'::jsonb,
  '["agent_surface_binding","ai_api","ai_endpoint","ai_provider","ai_setting","canvas_comment","canvas_score","content_ir_kind","content_ir_kind_instance","context_item","cx_agent_memory","feature_doc","flexible_data","game_result","heatmap_save","hr_jurisdiction_rule_class","hr_record_class","league_membership","organization","page_extraction_job","pc_studio_run","processed_document","scope_type","shared_canvas_item","skill_render_definition","surface","user_markdown_sample","wbx_pattern","web_analysis_item","web_provider","workflow_trigger"]'::jsonb,
  'json', NULL,
  'Add a reference — types never offered',
  'Entity type tokens the "Add a reference" picker leaves out of its type list and search. Child rows of other records are always left out. A type in "types offered first" is still offered.',
  'agent',
  'G5 review 2026-10-02: storage words (Processed document, Saved Result, Canvas Comment, Shared Canvas Item, Workflow Trigger) still sat beside Note and Task. Machinery is hidden; things a person references keep a product name.',
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
