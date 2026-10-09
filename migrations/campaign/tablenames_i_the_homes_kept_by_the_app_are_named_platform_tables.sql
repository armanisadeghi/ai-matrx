-- chair-step: existing organizations' agent-output Home was named "Kept by the app"; new ones are made as "Platform tables" (tablenames_a). Renames the old ones.
-- lane: TABLE-NAMES-CLEANUP
-- lock: custom
--
update custom.record
   set data = jsonb_set(data, '{name}', to_jsonb('Platform tables'::text))
 where table_id = custom.person_kernel_id()
   and data ->> 'kept_for' = 'agent_output'
   and data ->> 'name' = 'Kept by the app';
