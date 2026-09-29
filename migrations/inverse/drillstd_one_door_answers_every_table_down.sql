-- chair-step: the inverse of migrations/campaign/drillstd_one_door_answers_every_table.sql (lane DRILL-STANDARD-DOOR) — drops every function it created (the three drill doors, the two signed-in definer steps, the two server-only helpers, the catalogue helpers), their door rows, and the three drill knob rows it inserted. Declared definitions (platform.drill_def__<key>()) belong to their own sync files and their own inverses. No row of anybody's data is touched.
-- lane: DRILL-STANDARD-DOOR
-- lock: platform


drop function if exists platform.drill_rows(uuid, jsonb, jsonb);
drop function if exists platform.drill_ask(uuid, jsonb, jsonb);
drop function if exists platform.drill_describe(uuid, jsonb);
drop function if exists platform._drill_run_declared(uuid, text, jsonb, text);
drop function if exists platform._drill_plan(uuid, jsonb, jsonb, text);
drop function if exists platform._drill_compile(uuid, jsonb, jsonb, text);
drop function if exists platform._drill_resolve(uuid, text);
drop function if exists platform._drill_agg_sql(jsonb, text, text, text);
drop function if exists platform._drill_assert_values(jsonb, text, text);
drop function if exists platform._drill_ordinal_sql(text, text, text);
drop function if exists platform._drill_label_sql(text);
drop function if exists platform._drill_period_sql(text, text, integer);
drop function if exists platform._drill_moment_sql(text, text);
drop function if exists platform._drill_local_sql(text, text);
drop function if exists platform.drill_definition_problems(jsonb);
drop function if exists platform._drill_fk(text, text, text, text);
drop function if exists platform._drill_column(text, text, text);
drop function if exists platform.drill_declared_all();
drop function if exists platform.drill_declared(text);

delete from platform.client_callable_door
 where schema_name = 'platform'
   and function_name in ('drill_describe', 'drill_ask', 'drill_rows', '_drill_plan', '_drill_run_declared', '_drill_resolve', '_drill_compile');

delete from platform.feature_knob
 where feature = 'drill' and key in ('groups_per_level', 'pivot_columns', 'text_dimension_max_distinct');
