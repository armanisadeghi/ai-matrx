-- additive: yes
-- guard: custom/system_enabled
--
-- chair-step: it REVOKES EXECUTE from `authenticated` on ONE function of schema `custom`
--   (`custom.doc_signature_intact(uuid, uuid)`) and deletes that function's
--   `platform.client_callable_door` row — both of which THIS LANE added 8 minutes earlier, in
--   `fix10b_the_registry_and_the_seal_are_reachable_from_a_screen.sql`, and both of which were
--   wrong. It is a revoke on a door that no caller can use and that no caller used: measured
--   immediately after that grant, a signed-in call still answers `42501 permission denied for
--   table doc_signature`, because the function is SECURITY INVOKER over a doors-only table and
--   cannot serve a client by construction. Nothing else is granted, revoked, created, replaced
--   or dropped; `custom.field_kinds()`, the other half of that file, is correct and is left
--   exactly as it is. The inverse is
--   `migrations/inverse/fix10b_the_seal_is_asked_through_its_own_door_down.sql`.
--
-- LANE FIX-10B — closing a door this lane opened by mistake, and naming the real one.
--
-- WHAT I GOT WRONG. Proving VERIFIER-10 F6 I found `SignBlock` calling
-- `custom.doc_signature_intact` once per signature and getting `42501` from a browser, and I
-- read that as a missing grant. It is not. The store already answers this question through a
-- door built for it: `custom.doc_signature_read` is SECURITY DEFINER, asks
-- `assert_client_may_reach` and `assert_client_may_open` on the RECORD by name, and returns the
-- seal AND the verdict in one answer — it calls `doc_signature_intact` itself and merges the
-- result. `doc_signature_intact` is the INTERNAL half of that pair: invoker on purpose, so that
-- when the definer calls it the comparison runs under the same identity the definer already
-- checked. Granting it to `authenticated` gave a browser EXECUTE on a function whose first
-- statement reads a table no client may read — a door that is open and leads nowhere, which is
-- worse than one that is shut, because the next person reads the grant as permission.
--
-- SO THE DEFECT IS IN THE CALLER, AND THAT IS WHERE IT IS FIXED: `@ai-matrx/records` publishes
-- `docSignatureIntact` and does NOT publish `docSignatureRead`, so the one screen that shows a
-- signature asks the half that cannot answer. The package gains the real door and loses the
-- other, and `SignBlock` asks through it — one call per signature instead of two, and the seal
-- and the verdict arrive together, which is how the store meant them to be read.
--
-- A SAFE PATH BESIDE AN UNSAFE ONE IS NOT A FIX. Leaving the grant in place "in case something
-- uses it" would leave exactly the shape this campaign keeps finding: two ways to ask one
-- question, one of which quietly fails.

revoke execute on function custom.doc_signature_intact(uuid, uuid) from authenticated;

delete from platform.client_callable_door
 where schema_name = 'custom'
   and function_name = 'doc_signature_intact';
