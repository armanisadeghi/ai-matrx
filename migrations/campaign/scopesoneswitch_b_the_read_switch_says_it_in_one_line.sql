-- chair-step: shortens the scope read switch's description to one line; it is drawn under the setting on Personal and Organization configuration, where secondary text is one line (interface-text law). Inverse restores the long text.
--
-- SCOPES-ON-THE-STORE, builder E (lane 9, 2026-10-02). The long explanation lives in
-- matrx-frontend features/scopes/service/scopesReadKnob.ts and the basis column.

set local lock_timeout = '3s';
set local statement_timeout = '30s';

update platform.feature_knob
   set description = 'Scope screens read from the record store instead of the old tables.'
 where feature = 'custom' and key = 'scope_readers_read_the_store';
