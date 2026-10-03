-- chair-step: closes the scope read switch to the platform rung again (overridable_by = '{}'); standing overrides go inert, never deleted.
--
-- Inverse of scopesoneswitch_the_scope_read_switch_answers_per_person.sql: the knob is platform-locked
-- again. Standing overrides are inert once the rung is not in overridable_by (knob_resolve ignores
-- them); they are not deleted.

set local lock_timeout = '3s';
set local statement_timeout = '30s';

update platform.feature_knob
   set overridable_by = '{}'::text[],
       description = 'While false, the scope tree, scope types, context items, a scope''s values, a person''s full '
         'context and the agent hand-off (the old public resolver) are read from the old scope tables. '
         'When true they are read from the record store, same arguments and same answers (shadow '
         'compare: scripts/campaign-tests/scopesreadstree_shadow_compare.sql). Flipped once by the owner '
         'for the whole platform.'
 where feature = 'custom' and key = 'scope_readers_read_the_store';
