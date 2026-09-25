-- INVERSE of migrations/campaign/cutovercensus_the_integrations_fact_is_what_the_census_measured.sql (lane CUTOVER-CENSUS).
-- chair-step: drops the census door, the guard and the run log, and puts the Data tables switch's integrations fact back to the typed value FLIP-SEAMS wrote (met false, "Not yet: 44 …"), byte for byte. The switch stays not ready either way.

set lock_timeout = '2s';

drop trigger if exists cutover_seam_census_facts_are_measured on platform.cutover_seam;
drop function if exists platform._cutover_seam_census_facts_are_measured();
drop function if exists platform.cutover_census_record(text, text, jsonb);

update platform.cutover_seam s
   set prerequisites = (
     select coalesce(jsonb_agg(
              case when e ->> 'key' = 'integrations_repointed'
                   then jsonb_build_object(
                          'key', 'integrations_repointed',
                          'says', 'Every feature that reads or writes tables uses the new store (the agents'' dataset tool, the workflow steps, "save as a table", row-change automations, the browser extension).',
                          'met', false,
                          'evidence', 'Not yet: 44 of the places that read or write tables still reach the older tables directly. This is checked off when the last of them has moved and a check proves none is left.')
                   else e end order by ord), '[]'::jsonb)
       from jsonb_array_elements(s.prerequisites) with ordinality as t(e, ord))
 where s.seam_key = 'older_tables';

drop trigger if exists cutover_census_run_is_append_only on platform.cutover_census_run;
drop table if exists platform.cutover_census_run;
drop function if exists platform._cutover_census_run_is_append_only();
delete from platform.client_callable_door
 where schema_name = 'platform' and function_name = 'cutover_census_record';
