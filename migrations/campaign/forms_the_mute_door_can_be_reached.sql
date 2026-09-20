-- chair-step: this GRANTs EXECUTE on ONE function to `authenticated`. A GRANT is refused by the additive allow-list by name, so it comes through this route and a person reads exactly which function and why. No REVOKE, no DROP, no data movement, no existing declared grant changed. The function is already declared in platform.client_callable_door by forms_a_subscription_can_be_seen_and_switched_off.sql, which runs before this file.
-- lane: FORMS (the public form, PRODUCTS row 1)
--
--   custom.subscription_mute(uuid, uuid, boolean)  → authenticated, EXECUTE
--
-- and nothing else. `custom.subscriptions` next to it came out of its own apply already
-- granted, because platform.reopen_declared_doors reached it during the sweep that the
-- LAST statement of that file triggered; this one was created after its own declaration
-- row and no later statement swept, so it needs the grant issued by name. That asymmetry
-- is exactly why FORTY-FIVE's law says the grant is a deliberate act and never a hope.
--
-- WHO MAY CALL IT is not decided by this grant: custom.subscription_mute asks
-- custom.assert_client_may_reach, then requires the caller to be the subscription's own
-- recipient or to hold admin on the Table the Rule is about.
--
-- Idempotent: an already-holds GRANT is a no-op.

grant execute on function custom.subscription_mute(uuid, uuid, boolean) to authenticated;
