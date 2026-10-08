-- chair-step: the inverse of migrations/campaign/drillserver2_a_new_identity_is_counted_from_one_view.sql (lane DRILL-SERVER-2) — removes the registry row user_acquisition_facts, the view users._acquisition_facts and its two helper functions. Apply AFTER the inverse of the user_acquisition definition (which reads the view). No row of anybody's data is touched.
-- lane: DRILL-SERVER-2
-- lock: platform

delete from platform.entity_types where token = 'user_acquisition_facts';
drop view if exists users._acquisition_facts;
drop function if exists users.acquisition_traffic_kind(text, text, text);
drop function if exists users.acquisition_host_is_local(text);
