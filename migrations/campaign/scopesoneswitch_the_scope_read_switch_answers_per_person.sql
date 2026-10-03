-- target: branch,production
-- additive: yes
--
-- SCOPES-ON-THE-STORE, builder E — ONE SWITCH, ANSWERED PER PERSON (lane 9, 2026-10-02).
--
-- The web's scope read path now asks this same knob at run time for the signed-in person in their
-- active organization (matrx-frontend features/scopes/service/scopesReadKnob.ts, through
-- platform.knob_snapshot); the build flag NEXT_PUBLIC_SCOPES_READ_FROM_STORE is retired. So that one
-- person (test@test.com, admin@admin.com) or one organization can see the store path beside the old
-- one with no rebuild, the knob becomes overridable on the organization and user rungs. The platform
-- value is untouched (false): nobody's path changes until an override is added at Administration →
-- Users & Access → Limits & Knobs, or the owner flips it for everyone.
--
-- The six database readers (get_scope_tree, …) keep resolving the PLATFORM rung (they pass no
-- organization), so an override moves the web's screens only; the global flip still moves both.
--
-- IDEMPOTENT: sets the same two columns to the same values on every run.

set local lock_timeout = '3s';
set local statement_timeout = '30s';

update platform.feature_knob
   set overridable_by = '{organization,user}'::text[],
       description = 'While false, the scope tree, scope types, context items, a scope''s values, a person''s full '
         'context and the agent hand-off (the old public resolver) are read from the old scope tables. '
         'When true they are read from the record store, same arguments and same answers. The web''s scope '
         'screens resolve it per person in their active organization, once per page load, so an override for '
         'one person or one organization shows them the store path side by side with everyone else''s old one; '
         'the database readers take the platform value. Flipped once by the owner for the whole platform.'
 where feature = 'custom' and key = 'scope_readers_read_the_store';
