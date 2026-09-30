-- target: branch,production
-- additive: yes
-- seeds-guards: yes
--
-- SCOPES-READS-TREE — THE SWITCH FOR THE SCOPE READERS (lane SCOPES-READS-TREE, 2026-09-29).
--
-- One platform knob, OFF. While it is false the six scope readers
-- (get_scope_tree, list_scope_types, list_scope_type_items, get_scope_context,
-- get_user_full_context, resolve_full_context) answer from the old tables exactly as before;
-- when the owner flips it they answer from the record store
-- (scopesreadstree_the_scope_tree_and_values_read_the_store.sql). One flip for everyone, in COPY
-- mode (lane preamble rule 25): old and new side by side until the owner validates. The web's own
-- read switch (lane SCOPES-READS-WEB) is a different knob.
--
-- IDEMPOTENT: `on conflict do nothing`; it never overwrites a value somebody has set.

set lock_timeout = '3s';
set statement_timeout = '2min';

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, label, description,
   set_by, basis, overridable_by, override_direction, propagation, public_read, ui)
values
  ('custom', 'scope_readers_read_the_store', 'false'::jsonb, 'false'::jsonb, 'boolean',
   'Scope readers answer from the record store',
   'While false, the scope tree, scope types, context items, a scope''s values, a person''s full '
   'context and the agent hand-off (the old public resolver) are read from the old scope tables. '
   'When true they are read from the record store, same arguments and same answers (shadow '
   'compare: scripts/campaign-tests/scopesreadstree_shadow_compare.sql). Flipped once by the owner '
   'for the whole platform.',
   'agent', 'Scopes cutover plan, phase 2.2 (lane SCOPES-READS-TREE, 2026-09-29): readers move behind one switch.',
   '{}'::text[], 'any', 'next_load', false, '{}'::jsonb)
on conflict do nothing;
