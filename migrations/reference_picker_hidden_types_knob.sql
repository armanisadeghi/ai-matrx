-- reference_picker_hidden_types_knob — which kinds of thing the "Add a
-- reference" picker never offers a person.
--
-- WHY (G2 review, 2026-10-02): "All types" listed all 116 reference-pickable
-- types, ~90 of them under one "Other" bucket, including platform machinery a
-- non-technical expert has no reason to link to — "Content-IR Kind",
-- "AI Endpoint", "Flexible Data", "UI Surface", "Agent Surface Binding",
-- "Skill Render Definition". The registry does not mark these for the client:
-- `platform.entity_types.audit_class = 'machinery'` covers only two of the
-- pickable set (agent_surface_binding, organization) and is not in the
-- generated client metadata, and `reference_pickable` is a platform property
-- (agents and admin builders still reference these). Whether a person should
-- see one is an organization's opinion, so per Law 6 it is a knob with an
-- agent-chosen starting value and a dated review.
--
-- The picker ALSO drops every `is_component` type on its own (a child row of
-- another record — study_plan_block, workflow_plan); that one is a registry
-- fact, not an opinion, so it is not listed here.
--
-- Starting value, and why: configuration, telemetry and plumbing rows — the
-- AI connection settings (api, endpoint, provider, setting), the content-IR
-- kind registry, UI surfaces and their agent bindings, render definitions,
-- scoring/measurement rows (canvas score, game result, league membership,
-- heatmap save, analysis item), importer/extension internals (extraction job,
-- extension scrape pattern, markdown sample, studio run, web provider), the
-- agent memory store, the admin feature docs, the access words (organization,
-- scope type, context item) and HR rule classes. Everything a person makes or
-- works on stays. An organization that wants one back removes it in
-- /administration/users/limits.
--
-- The common tier (`common_types`) is resolved against the FULL pickable set,
-- so an organization that curates a hidden type into its shortcut tier still
-- gets it. A missing row never hides anything: the picker shows every type and
-- says why in the console.
--
-- Idempotent (ON CONFLICT DO UPDATE on the metadata, never on `value`).
-- Reversible: DELETE the row.
--
-- Ledger: public._schema_migrations (source 'matrx-frontend').

INSERT INTO platform.feature_knob (
  feature, key, value, default_value, value_type, unit,
  label, description, set_by, basis, review_due,
  overridable_by, override_direction
) VALUES
(
  'platform.reference_picker', 'hidden_types',
  '["agent_surface_binding","ai_api","ai_endpoint","ai_provider","ai_setting","canvas_score","content_ir_kind","context_item","cx_agent_memory","feature_doc","flexible_data","game_result","heatmap_save","hr_jurisdiction_rule_class","hr_record_class","league_membership","organization","page_extraction_job","pc_studio_run","scope_type","skill_render_definition","surface","user_markdown_sample","wbx_pattern","web_analysis_item","web_provider"]'::jsonb,
  '["agent_surface_binding","ai_api","ai_endpoint","ai_provider","ai_setting","canvas_score","content_ir_kind","context_item","cx_agent_memory","feature_doc","flexible_data","game_result","heatmap_save","hr_jurisdiction_rule_class","hr_record_class","league_membership","organization","page_extraction_job","pc_studio_run","scope_type","skill_render_definition","surface","user_markdown_sample","wbx_pattern","web_analysis_item","web_provider"]'::jsonb,
  'json', NULL,
  'Add a reference — types never offered',
  'Entity type tokens the "Add a reference" picker leaves out of its type list and search. Child rows of other records are always left out. A type in "types offered first" is still offered.',
  'agent',
  'G2 review 2026-10-02: machinery types (content-IR kinds, AI endpoints, UI surfaces, render definitions) sat beside Note and Task in a non-technical expert''s picker. Starting value: configuration, telemetry and plumbing types; everything a person makes or works on stays visible.',
  (current_date + 60),
  ARRAY['organization'], 'any'
)
ON CONFLICT (feature, key) DO UPDATE SET
  default_value      = EXCLUDED.default_value,
  value_type         = EXCLUDED.value_type,
  unit               = EXCLUDED.unit,
  label              = EXCLUDED.label,
  description        = EXCLUDED.description,
  basis              = EXCLUDED.basis,
  review_due         = EXCLUDED.review_due,
  overridable_by     = EXCLUDED.overridable_by,
  override_direction = EXCLUDED.override_direction,
  updated_at         = now();
