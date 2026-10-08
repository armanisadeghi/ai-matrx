-- lane: DRILL-WAVE2-C
-- lock: platform
-- Read from production 2026-10-07: platform.drill_def__app_log() does not exist (platform.drill_def__* lists agents_by_model, ai_calls, ai_usage, ai_usage_executions, kg_cost, tool_refetch, user_acquisition, workflow_runs, and the lane DRILL-WAVE2-B ones once applied), so nothing is replaced and there is no based-on line.
-- Written by aidream apps/shared/records/scripts/drill-sync.ts from: aidream/apps/shared/records/scripts/drill-definitions/app_log.drill.ts
-- Declared drill definitions, one function each (platform.drill_def__<key>()). Code, not data.

create or replace function platform.drill_def__app_log()
returns jsonb
language sql
immutable
set search_path to 'pg_catalog'
as $function$
  select $drill${"key":"app_log","label":"Structured logs","grain":"one row per log line","fact":"app_log","mode":"invoker","lanes":["platform","mine"],"lane_columns":{"mine":"user_id"},"dimensions":[{"key":"level","label":"Level","from":"level","kind":"choice","cardinality":"low","choices":[{"value":"DEBUG","label":"Debug"},{"value":"INFO","label":"Info"},{"value":"WARNING","label":"Warning"},{"value":"ERROR","label":"Error"},{"value":"CRITICAL","label":"Critical"}],"level":{"breakouts":["feature","route","logger_name","exc_type","created_at:hour"],"show":["count","requests","people"]}},{"key":"feature","label":"Feature","from":"feature","kind":"text","cardinality":"medium","empty_label":"No feature stamped","level":{"breakouts":["level","route","exc_type","logger_name","created_at:hour"],"show":["count","requests","people"]}},{"key":"route","label":"Route","from":"route","kind":"text","cardinality":"medium","empty_label":"No route","level":{"breakouts":["level","feature","exc_type","created_at:hour"],"show":["count","requests","people"]}},{"key":"logger_name","label":"Logger","from":"logger_name","kind":"text","cardinality":"medium","level":{"breakouts":["level","feature","route","created_at:hour"],"show":["count","requests","people"]}},{"key":"exc_type","label":"Exception kind","from":"exc_type","kind":"text","cardinality":"medium","empty_label":"No exception","level":{"breakouts":["feature","route","level","created_at:hour"],"show":["count","requests","people"]}},{"key":"host_role","label":"Host role","from":"host_role","kind":"text","cardinality":"low","empty_label":"Not stamped"},{"key":"classified","label":"Classified","from":"classified","kind":"boolean"},{"key":"created_at","label":"When","from":"created_at","kind":"time","grains":["year","quarter","month","week","day","hour"]}],"measures":[{"key":"count","label":"Log lines","op":"count","unit":"count","additive":true},{"key":"requests","label":"Requests","op":"count_distinct","of":"request_id","unit":"count","additive":false},{"key":"people","label":"People","op":"count_distinct","of":"user_id","unit":"count","additive":false}],"paths":[{"key":"when","label":"When","levels":["created_at:day","created_at:hour"]}],"default":{"by":["level"],"show":["count","requests"],"sort":{"key":"count","direction":"desc"}}}$drill$::jsonb;
$function$;

comment on function platform.drill_def__app_log() is
  'DRILL-STANDARD-DOOR: the declared drill definition "Structured logs" (app_log), compiled from its *.drill.ts file by aidream apps/shared/records/scripts/drill-sync.ts. Code, not data: never edited by hand.';
