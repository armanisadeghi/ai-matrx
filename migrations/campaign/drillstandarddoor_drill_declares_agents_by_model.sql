-- lane: DRILL-STANDARD-DOOR
-- lock: platform
-- Written by aidream apps/shared/records/scripts/drill-sync.ts from: aidream/apps/shared/records/scripts/drill-definitions/agents_by_model.drill.ts
-- Declared drill definitions, one function each (platform.drill_def__<key>()). Code, not data.

create or replace function platform.drill_def__agents_by_model()
returns jsonb
language sql
immutable
set search_path to 'pg_catalog'
as $function$
  select $drill${"key":"agents_by_model","label":"Agents by model","grain":"one row per agent","fact":"agent","mode":"invoker","lanes":["organization","mine","platform"],"lane_columns":{"organization":"organization_id","mine":"created_by"},"joins":[{"as":"model","token":"ai_model","from":"model_id"},{"as":"provider","token":"ai_provider","from":"model.provider_id"}],"dimensions":[{"key":"provider","label":"Provider","from":"provider.id","kind":"relation","relation":{"token":"ai_provider"}},{"key":"model","label":"Model","from":"model.id","kind":"relation","relation":{"token":"ai_model"}},{"key":"agent_type","label":"Kind of agent","from":"agent_type","kind":"choice"},{"key":"category","label":"Category","from":"category","kind":"text","cardinality":"medium"},{"key":"organization","label":"Organization","from":"organization_id","kind":"relation","relation":{"token":"organization"}},{"key":"created_at","label":"Added","from":"created_at","kind":"time","grains":["year","quarter","month","week","day"]}],"measures":[{"key":"count","label":"Agents","op":"count","unit":"count","additive":true},{"key":"people","label":"People who made them","op":"count_distinct","of":"created_by","unit":"count","additive":false},{"key":"models","label":"Models used","op":"count_distinct","of":"model_id","unit":"count","additive":false},{"key":"model_context","label":"Context window of the models used, each model once","op":"sum","of":"model.context_window","at_grain":"model_id","unit":"tokens","additive":false}],"paths":[{"key":"what","label":"What","levels":["provider","model"]},{"key":"when","label":"When","levels":["created_at:year","created_at:quarter","created_at:month","created_at:week","created_at:day"]}],"detail":{"columns":["name","created_at","model","provider","agent_type","category","organization"]},"default":{"by":["provider"],"show":["count","people"],"sort":{"key":"count","direction":"desc"},"path":"what"}}$drill$::jsonb;
$function$;

comment on function platform.drill_def__agents_by_model() is
  'DRILL-STANDARD-DOOR: the declared drill definition "Agents by model" (agents_by_model), compiled from its *.drill.ts file by aidream apps/shared/records/scripts/drill-sync.ts. Code, not data: never edited by hand.';
