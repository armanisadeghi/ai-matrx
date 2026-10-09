-- chair-step: the inverse of typeform_a_form_visit_is_counted_by_the_store.sql. It DELETES the `anon_form_visit` entity type row and DROPS the table `custom.anon_form_visit` — every visit count with it. Submissions and records are not touched. Run the inverse of typeform_a_form_routes_scores_and_counts_itself.sql first (its functions read this table).
-- lane: TYPEFORM-DUP
-- lock: custom,platform

set local lock_timeout = '2s';
set local statement_timeout = '60s';

delete from platform.entity_types where token = 'anon_form_visit' and table_name = 'anon_form_visit';
drop table custom.anon_form_visit;
