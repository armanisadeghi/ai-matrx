-- chair-step: it DROPS seven functions nobody calls that read the old context.* scope tables with the caller's rights — the six image halves of the wave-1 read doors (context.get_scope_tree_from_the_image, list_scope_types_from_the_image, list_scope_type_items_from_the_image, get_scope_context_from_the_image, get_user_full_context_from_the_image, resolve_full_context_from_the_image) and public.kg_simulated_scope_graph. Each is SECURITY INVOKER with client EXECUTE, so each would fail with a permission error once the old tables stop answering signed-in callers (wave 2 revoke). Census 2026-10-05 on production: no function body, view or trigger names any of them; no product code in aidream, matrx-frontend, matrx-local or matrx-extend calls them (only an old shadow-compare instrument, which skips when they are absent). The inverse recreates each body, owner and EXECUTE grant exactly as production held them.
-- lane: FINISH-THE-SWITCH (FTS-1, wave 2 of SCOPES-ON-THE-STORE)
-- lock: custom
--
-- Inverse: migrations/inverse/scopesw2_the_dead_image_readers_are_gone_down.sql.
-- Guard: scripts/campaign-tests/scopesw2_the_dead_image_readers_are_gone_red_green.sql.
--
-- THE USE CASE. When Cedar Ridge Physical Therapy's scopes stop living in the old tables, nothing a member can call
-- still reaches for them: the screens, the agent hand-off and the pickers read the record store, and these seven
-- leftovers go rather than wait to fail.

drop function context.get_scope_tree_from_the_image(uuid, uuid);
drop function context.list_scope_types_from_the_image(uuid);
drop function context.list_scope_type_items_from_the_image(uuid);
drop function context.get_scope_context_from_the_image(uuid, uuid[], boolean);
drop function context.get_user_full_context_from_the_image(uuid);
drop function context.resolve_full_context_from_the_image(uuid, text, uuid, uuid[], text[]);
drop function public.kg_simulated_scope_graph(uuid);
