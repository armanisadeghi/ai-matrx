-- reference_picker_hidden_types_taxonomy — the platform's taxonomy rows leave
-- the "Add a reference" picker.
--
-- WHY (G6B review, 2026-10-02, nightly clone): "All types" showed
-- "Platform › Category". A `category` row is a `platform.categories` choice —
-- the system taxonomy behind access purposes, app categories and flashcard
-- folders. A person picks one inside the screen that owns it; nobody links to
-- one. Machinery, so it is hidden here. (The other two words the review named
-- are renamed in code, per the vocabulary: Context › Record → Scopes › Scope,
-- Platform › Rulebook → Masterwork › Rulebook.)
--
-- The organization's own value is replaced only when it still equals the
-- previous starting value (nobody customised it); a customised value is left
-- alone. Idempotent. Reversible: set `value`/`default_value` back to the list in
-- reference_picker_hidden_types_people_words.sql.
--
-- Guard: features/scopes/utils/__tests__/referenceTypeGroups.test.ts
-- ("no visible group is a storage word").

INSERT INTO platform.feature_knob (
  feature, key, value, default_value, value_type, unit,
  label, description, set_by, basis, review_due,
  overridable_by, override_direction
) VALUES
(
  'platform.reference_picker', 'hidden_types',
  '["agent_surface_binding","ai_api","ai_endpoint","ai_provider","ai_setting","canvas_comment","canvas_score","category","content_ir_kind","content_ir_kind_instance","context_item","cx_agent_memory","feature_doc","flexible_data","game_result","heatmap_save","hr_jurisdiction_rule_class","hr_record_class","league_membership","organization","page_extraction_job","pc_studio_run","processed_document","scope_type","shared_canvas_item","skill_render_definition","surface","user_markdown_sample","wbx_pattern","web_analysis_item","web_provider","workflow_trigger"]'::jsonb,
  '["agent_surface_binding","ai_api","ai_endpoint","ai_provider","ai_setting","canvas_comment","canvas_score","category","content_ir_kind","content_ir_kind_instance","context_item","cx_agent_memory","feature_doc","flexible_data","game_result","heatmap_save","hr_jurisdiction_rule_class","hr_record_class","league_membership","organization","page_extraction_job","pc_studio_run","processed_document","scope_type","shared_canvas_item","skill_render_definition","surface","user_markdown_sample","wbx_pattern","web_analysis_item","web_provider","workflow_trigger"]'::jsonb,
  'json', NULL,
  'Add a reference — types never offered',
  'Entity type tokens the "Add a reference" picker leaves out of its type list and search. Child rows of other records are always left out. A type in "types offered first" is still offered.',
  'agent',
  'G6B review 2026-10-02: "Platform › Category" (the system taxonomy rows) sat beside Note and Task. Machinery is hidden; things a person references keep a product name.',
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
