-- chair-step: the inverse of typeform2_d_the_builder_reads_the_forms_knobs.sql. It DROPS custom.form_knobs and its door row. Knobs and forms are not touched.
-- lane: TYPEFORM-2
-- lock: custom,platform

set local lock_timeout = '2s';
set local statement_timeout = '60s';

delete from platform.client_callable_door where schema_name = 'custom' and function_name = 'form_knobs';
drop function custom.form_knobs(uuid);
