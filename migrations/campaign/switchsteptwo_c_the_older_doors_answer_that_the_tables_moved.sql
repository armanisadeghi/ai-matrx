-- chair-step: lane SWITCH-STEP-TWO (2026-10-01), step two, part c — the older doors answer that the tables moved.
-- The 16 older READ doors, the 23 older WRITE doors (closed to clients at the press; service_role kept) and the older
-- list-maker create_user_list read and write only workbench.udt_*. After the move each would answer a caller
-- "relation workbench.udt_… does not exist" — a developer sentence. Every one is still NAMED by code
-- (check:old-system-unreachable census), so each is not dropped yet: its body answers the people sentence
-- "The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data." (P0001, the door named in the hint). They are dropped with the code that names them (the census
-- reaches zero). Grants, door rows and signatures are kept; LANGUAGE sql doors become plpgsql (the body raises).
-- Also: the weekly older-history trim (paused by the press) is unscheduled; its function reads only the older tables.
-- The four list doors that route to the store (get_user_list_with_items, get_structured_list_for_selection,
-- get_user_lists_summary, update_user_list) are NOT here: once file b answers `record` they answer from the store.
-- list_udt_dataset_templates is NOT here: the templates stay in workbench today (PROGRESS-SWITCH-STEP-TWO B10).
-- PRECONDITION: the undo is retired. Locks: pg_proc row locks; no relation lock.
-- based-on: public.add_column_to_user_table(uuid, text, text, text, integer, boolean, jsonb, jsonb) bc779a4575ba84e5155de1948482334e4c9627b3b64ab7bfce788b2a1783a23d
-- based-on: public.add_data_row_to_user_table(uuid, jsonb) b8e76ace727fde5311b23e9a1ad0743a44f9dc3a475e80dcdb48e4231679d12e
-- based-on: public.append_rows_to_user_table(uuid, jsonb) e4af99b773c5e76bb767f795942371b35dee5678baee19d973b27571bd1bb91e
-- based-on: public.create_new_user_table_dynamic(text, text, boolean, uuid, jsonb) e6d046550e54971b8e25e66abd9821fb1126f885437283677cb434bb100cf8d5
-- based-on: public.create_user_list(character varying, text, uuid, boolean, boolean, boolean, jsonb, uuid) 54bccd837a0efab96f2cf1fa258ab81ac1d609e212eb7f701fb6b66163011706
-- based-on: public.create_user_table_with_fields(text, text, boolean, uuid, uuid, uuid, jsonb) f9fe58edb0520dea4a61e4cb0e26f11a5e595c0b8ebff15ecdb912105477d75e
-- based-on: public.delete_data_row_from_user_table(uuid) 05cb89a275a568c5124482115126329136e26b7762f6ed025d2fc752a76d5f83
-- based-on: public.delete_user_table(uuid) 609c140e44310f06245fffb9cb3925c59c040dcef3a128a2505f74ba283b89a6
-- based-on: public.export_user_table_as_csv(uuid, text, text) 6627f0801b957ef17d0b89f94aee80b80796b180a080f813f12afd5979c888a9
-- based-on: public.export_user_table_as_csv(uuid) 0d285659f6d4b50a10ef400eaf424c669886a94cb0a158048478e40768c7a75f
-- based-on: public.get_full_table(jsonb) 677d0e96c8cd94c645b5e00088df22b61b48f37ba0cca50033c4b7cee0eba60c
-- based-on: public.get_table_cell(jsonb) 1ea9ba81684259ad97f03dd5023e385d768ad2a8c9543295235e86a646d5067d
-- based-on: public.get_table_column(jsonb) 333de12ceef4c3b946a567a890c94090fd746138b7af2255dddbdc53183a56d1
-- based-on: public.get_table_row(jsonb) fe65337744a9b492e062940526310c018eeee08aa62dd347beee3057d140e54f
-- based-on: public.get_user_table_complete(uuid, text, text) 80865d9d629a18ce83b1b760052c785baaeff881bcf6b2fe09ed97f2f9da5019
-- based-on: public.get_user_table_data_paginated_v2(uuid, integer, integer, text, text, text) 5122141dc77bc7810f0ac1ca467cdbc7fd0f4e279340848fbb6e66207ffbf64a
-- based-on: public.get_user_table_data_paginated(uuid, integer, integer, text, text, text) 7604f98bbf8639ea5cf237d99d2f50dbed7c4305598a76889bb3224916cd5bbf
-- based-on: public.get_user_tables() 364fbfaade8d5ab07609d0ff977cdacf6383040abed0e9f68a93aae74571aa54
-- based-on: public.list_table_columns(jsonb) 65d653b512522416e2336849db84c1484225446f8deca86ce0a5b4bca41fa0c8
-- based-on: public.list_table_rows(jsonb, integer, integer, text, text) 959e79f8fd3f57809f10dcb4baebe7ee8a0c45257b2584090c33c244ae3e21a0
-- based-on: public.udt_backfill_autonumber(uuid, uuid) 34228ed2986ae255ac18bec833ee4a57e22dc1dd575630f54480bdca52ce2497
-- based-on: public.udt_bulk_write(uuid, jsonb) 6f6af5343b583bc9ac72a07ffcbf84fd70114f0839f4934568730fd716e94a23
-- based-on: public.udt_change_field_type(uuid, uuid, field_data_type, text) 1477502012e891e1c3a905b7352226c6e5dd078cb2c6941ff9cc3ecf41d9ed86
-- based-on: public.udt_column_facets(uuid, text, integer, text) 51ca04a9163877cf07bd5a748aa44e10c8676e2be107fbd4ccd09b9f03160771
-- based-on: public.udt_delete_field(uuid, uuid) 63513d02a20b491d9922f98118afbeed5e208c0210abcee8ffa7de481c70caa6
-- based-on: public.udt_list_example_tables() 69e65bff458586e67aefc03cf9e6be1a2484b43837f969c5be21c424d626ce21
-- based-on: public.udt_set_field_format(uuid, uuid, jsonb) 366cc27d8be0bd8610835afff55d10828737a16fb1b81161c60fdcd46f48bd16
-- based-on: public.udt_set_table_row_actions(uuid, jsonb) 6877ca351200176beebd37368a81cb9c007945df43c170c2cbebd907d4e4e37e
-- based-on: public.udt_set_table_row_label(uuid, jsonb) a821302148ba5d47c4f7050a2ab1b64671bf8c7a10d143463ff5550721ce969b
-- based-on: public.udt_set_table_style(uuid, text[], jsonb) 8e965cb86561847898c31506b198aa237be86a67e7da06641cb1c169c533975f
-- based-on: public.udt_table_profile(uuid, integer) b0e27e7b89a0c3cf867e21cc2f54606670ece6394f79b25eab2e396ff4e6dc01
-- based-on: public.udt_upsert_cell(uuid, uuid, text, jsonb) 7cb97eabc51668df046683321cdf06b0691df0ba4df7a360057d8c5687a83db5
-- based-on: public.udt_upsert_row(uuid, uuid, jsonb) 240500372f692c1f3a9a502478a51b2b8f40bc53834b9125eba96e84ecd336c3
-- based-on: public.udt_validate_row(uuid, jsonb, jsonb) e0c0d2bec047f1f400fe4507388172a63d9c9c39b8f2e18b9ca2a612f1a56202
-- based-on: public.update_data_row_in_user_table(uuid, jsonb) 0de8e6b55f925c18d6f544cc18b76117c6ffda6fba6c3c778eb471ac027b428e
-- based-on: public.update_field_metadata(uuid, text, boolean, integer, jsonb) e98852b06d60a50a21b44959f608c73098a403cb0f7ebba1727dcf061bb406bb
-- based-on: public.update_user_table_config(uuid, jsonb, jsonb) be024ff36a342faf5843ab73c36d1e0e39c5991b2b3c586c111259452481b72f
-- based-on: public.update_user_table_default_sort(uuid, text, text) e4a62520e4996a092d32a20904a1a79ee1d9d066863d49c1175da6b331a27712
-- based-on: public.update_user_table_metadata(uuid, text, text, boolean, boolean) 891e05e951806318d66e398dae5e5ac275e9bc86af2d089e8ac6f7ce51f905e3
-- based-on: public.update_user_table_row_ordering(uuid, boolean, jsonb, text) 79228d42dc9579f3502f5b6f4b63ae7a7ee9ae555b0710df0119bfbe9de79584
-- lane: SWITCH-STEP-TWO
-- INVERSE: migrations/inverse/switchsteptwo_c_the_older_doors_answer_that_the_tables_moved_down.sql

do $pre$
begin
  if (platform._final_switch_undo_retired()).id is null then
    raise exception 'refused: the final switch''s undo is not retired; the undo reopens these doors exactly as they were.';
  end if;
end
$pre$;

select cron.unschedule(jobid) from cron.job where jobname = 'udt_dataset_row_versions_trim_weekly';

CREATE OR REPLACE FUNCTION public.add_column_to_user_table(p_table_id uuid, p_field_name text, p_display_name text, p_data_type text, p_field_order integer DEFAULT NULL::integer, p_is_required boolean DEFAULT false, p_default_value jsonb DEFAULT NULL::jsonb, p_validation_rules jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the graveyard; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'add_column_to_user_table was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.add_data_row_to_user_table(p_table_id uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the graveyard; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'add_data_row_to_user_table was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.append_rows_to_user_table(p_table_id uuid, p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the graveyard; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'append_rows_to_user_table was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_new_user_table_dynamic(p_table_name text, p_description text, p_is_public boolean, p_organization_id uuid, p_initial_fields jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the graveyard; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'create_new_user_table_dynamic was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_user_list(p_list_name character varying, p_description text, p_user_id uuid, p_is_public boolean, p_authenticated_read boolean DEFAULT false, p_public_read boolean DEFAULT false, p_items jsonb DEFAULT '[]'::jsonb, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the graveyard; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'create_user_list was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_user_table_with_fields(p_table_name text, p_description text DEFAULT NULL::text, p_is_public boolean DEFAULT false, p_organization_id uuid DEFAULT NULL::uuid, p_project_id uuid DEFAULT NULL::uuid, p_task_id uuid DEFAULT NULL::uuid, p_fields jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the graveyard; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'create_user_table_with_fields was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_data_row_from_user_table(p_row_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the graveyard; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'delete_data_row_from_user_table was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_user_table(p_table_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the graveyard; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'delete_user_table was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.export_user_table_as_csv(p_table_id uuid, p_sort_field text DEFAULT NULL::text, p_sort_direction text DEFAULT 'asc'::text)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the graveyard; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'export_user_table_as_csv was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.export_user_table_as_csv(p_table_id uuid)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the graveyard; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'export_user_table_as_csv was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_full_table(ref jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the graveyard; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'get_full_table was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_table_cell(ref jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the graveyard; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'get_table_cell was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_table_column(ref jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the graveyard; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'get_table_column was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_table_row(ref jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the graveyard; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'get_table_row was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_table_complete(p_table_id uuid, p_sort_field text DEFAULT NULL::text, p_sort_direction text DEFAULT 'asc'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the graveyard; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'get_user_table_complete was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_table_data_paginated_v2(p_table_id uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_sort_field text DEFAULT NULL::text, p_sort_direction text DEFAULT 'asc'::text, p_search_term text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the graveyard; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'get_user_table_data_paginated_v2 was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_table_data_paginated(p_table_id uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_sort_field text DEFAULT NULL::text, p_sort_direction text DEFAULT 'asc'::text, p_search_term text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the graveyard; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'get_user_table_data_paginated was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_tables()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the graveyard; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'get_user_tables was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_table_columns(ref jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the graveyard; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'list_table_columns was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_table_rows(ref jsonb, limit_rows integer DEFAULT 100, offset_rows integer DEFAULT 0, order_by text DEFAULT 'created_at'::text, order_dir text DEFAULT 'desc'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the graveyard; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'list_table_rows was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.udt_backfill_autonumber(p_table_id uuid, p_field_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the graveyard; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'udt_backfill_autonumber was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.udt_bulk_write(p_table_id uuid, p_operations jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the graveyard; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'udt_bulk_write was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.udt_change_field_type(p_table_id uuid, p_field_id uuid, p_new_type field_data_type, p_strategy text DEFAULT 'cast_or_null'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the graveyard; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'udt_change_field_type was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.udt_column_facets(p_table_id uuid, p_field_name text, p_limit integer DEFAULT 50, p_search_term text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the graveyard; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'udt_column_facets was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.udt_delete_field(p_table_id uuid, p_field_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the graveyard; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'udt_delete_field was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.udt_list_example_tables()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the graveyard; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'udt_list_example_tables was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.udt_set_field_format(p_table_id uuid, p_field_id uuid, p_format jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the graveyard; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'udt_set_field_format was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.udt_set_table_row_actions(p_table_id uuid, p_row_actions jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the graveyard; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'udt_set_table_row_actions was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.udt_set_table_row_label(p_table_id uuid, p_row_label jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the graveyard; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'udt_set_table_row_label was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.udt_set_table_style(p_table_id uuid, p_path text[], p_value jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the graveyard; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'udt_set_table_style was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.udt_table_profile(p_table_id uuid, p_preview_values integer DEFAULT 12)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the graveyard; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'udt_table_profile was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.udt_upsert_cell(p_table_id uuid, p_row_id uuid, p_field_name text, p_value jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the graveyard; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'udt_upsert_cell was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.udt_upsert_row(p_table_id uuid, p_row_id uuid DEFAULT NULL::uuid, p_data jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the graveyard; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'udt_upsert_row was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.udt_validate_row(p_table_id uuid, p_data jsonb, p_prior jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the graveyard; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'udt_validate_row was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_data_row_in_user_table(p_row_id uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the graveyard; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'update_data_row_in_user_table was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_field_metadata(p_field_id uuid, p_display_name text DEFAULT NULL::text, p_is_required boolean DEFAULT NULL::boolean, p_field_order integer DEFAULT NULL::integer, p_validation_rules jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the graveyard; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'update_field_metadata was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_user_table_config(p_table_id uuid, p_table_updates jsonb DEFAULT NULL::jsonb, p_field_updates jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the graveyard; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'update_user_table_config was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_user_table_default_sort(p_table_id uuid, p_sort_field text DEFAULT NULL::text, p_sort_direction text DEFAULT 'asc'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the graveyard; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'update_user_table_default_sort was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_user_table_metadata(p_table_id uuid, p_table_name text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_is_public boolean DEFAULT NULL::boolean, p_authenticated_read boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the graveyard; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'update_user_table_metadata was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_user_table_row_ordering(p_table_id uuid, p_enabled boolean, p_order jsonb DEFAULT NULL::jsonb, p_label_field text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- SWITCH-STEP-TWO: an older-table door. Its tables are in the graveyard; it answers that, by name.
  raise exception 'The older tables moved to the archive after the final switch. Tables and lists live in the new system now: open them from /data.'
    using errcode = 'P0001', hint = 'update_user_table_row_ordering was a door to the older tables (workbench.udt_*), retired at step two of the final switch.';
end;
$function$;
