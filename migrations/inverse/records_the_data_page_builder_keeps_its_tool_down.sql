-- chair-step: THE INVERSE of `records_the_data_page_builder_keeps_its_tool.sql`. Puts the Data Page
-- Builder's tool list back to the empty array it held immediately before (read on production).
SELECT set_config('app.actor_system', 'migration:records_the_data_page_builder_keeps_its_tool.inverse', true);

UPDATE agent.definition
   SET tools = '{}'::uuid[]
 WHERE id = '35e47f88-a074-435f-a627-ca71b0ab770f'::uuid;
