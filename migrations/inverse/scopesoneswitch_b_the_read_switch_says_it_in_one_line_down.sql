-- chair-step: restores the long description of the scope read switch.

set local lock_timeout = '3s';
set local statement_timeout = '30s';

update platform.feature_knob
   set description = 'While false, the scope tree, scope types, context items, a scope''s values, a person''s full '
         'context and the agent hand-off (the old public resolver) are read from the old scope tables. '
         'When true they are read from the record store, same arguments and same answers. The web''s scope '
         'screens resolve it per person in their active organization, once per page load, so an override for '
         'one person or one organization shows them the store path side by side with everyone else''s old one; '
         'the database readers take the platform value. Flipped once by the owner for the whole platform.'
 where feature = 'custom' and key = 'scope_readers_read_the_store';
