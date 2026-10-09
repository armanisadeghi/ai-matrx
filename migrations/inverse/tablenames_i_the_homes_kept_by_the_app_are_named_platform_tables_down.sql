-- inverse of tablenames_i_the_homes_kept_by_the_app_are_named_platform_tables.sql
-- WHAT IT DOES NOT UNDO: it cannot tell a Home renamed by tablenames_i from one made as "Platform tables" since tablenames_a, so it renames every agent-output Home with that name back; apply only to undo the whole rename.
update custom.record
   set data = jsonb_set(data, '{name}', to_jsonb('Kept by the app'::text))
 where table_id = custom.person_kernel_id()
   and data ->> 'kept_for' = 'agent_output'
   and data ->> 'name' = 'Platform tables';
