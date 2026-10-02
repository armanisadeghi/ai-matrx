-- INVERSE of migrations/campaign/kindsglue_d_kind_create_declares_what_a_kind_is.sql (lane KINDS-GLUE): kind_create's
-- parameters without disposition / child_dispositions, exactly as before the file.
-- lane: KINDS-GLUE

select set_config('app.actor_system', 'migration/kindsglue_d', true);

update tool.definition
   set parameters = jsonb_set(parameters, '{properties}', (parameters -> 'properties') - 'disposition' - 'child_dispositions')
 where name = 'kind_create';
