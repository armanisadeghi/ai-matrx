-- chair-step: the inverse of typeform2_a_form_visit_is_rate_capped_and_a_form_reads_its_knobs.sql. It DROPS custom.form_visit_admit and custom.form_public_options, deletes their two door rows and the three forms/* knob rows (and their overrides go with them). Visit counts and forms are not touched.
-- lane: TYPEFORM-2
-- lock: custom,platform

set local lock_timeout = '2s';
set local statement_timeout = '60s';

delete from platform.client_callable_door where schema_name = 'custom' and function_name in ('form_visit_admit', 'form_public_options');
drop function custom.form_visit_admit(uuid, text);
drop function custom.form_public_options(uuid);
delete from platform.feature_knob where feature = 'forms' and key in ('visit_rate_per_minute', 'show_owner_header', 'choice_auto_advance');
