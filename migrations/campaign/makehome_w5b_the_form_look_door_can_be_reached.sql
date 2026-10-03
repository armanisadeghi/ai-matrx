-- chair-step: this GRANTs EXECUTE on ONE new function to `authenticated`, the same single grant its sibling store doors hold (custom.portal_card, custom.forms, custom.form_declare: postgres + authenticated, nothing else). A GRANT is refused by the additive allow-list by name, so it comes through this route. PUBLIC's implicit EXECUTE was cleared at the function's birth by ddl_guard (§6d-4). No REVOKE, no DROP, no data movement, no other grant changed. The function is declared by makehome_w5b_a_form_picks_from_the_public_pictures.sql, which runs before this file.
-- lane: MAKE-HOME
--
--   custom.form_look_options(uuid, jsonb)   → authenticated, EXECUTE
--
-- `anon` gains nothing. WHAT A CALLER SEES is decided by the body: custom.assert_store_door and
-- custom.assert_client_may_reach admit only a member of the organization, and it answers only that
-- organization's PUBLIC pictures — files a stranger can already load.
--
-- Idempotent: an already-holds GRANT is a no-op.

grant execute on function custom.form_look_options(uuid, jsonb) to authenticated;
