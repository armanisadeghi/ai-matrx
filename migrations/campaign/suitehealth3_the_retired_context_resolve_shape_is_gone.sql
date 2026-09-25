-- additive: no (drops one function overload that nothing calls; see the census below)
-- based-on: custom.context_resolve(uuid,jsonb,text) fd13bee223fb86c7d3d35ba0f884b7624e6d6e334ff40a1557b44402c4e2da87
--
-- chair-step: it RETIRES one client door, `custom.context_resolve(uuid, jsonb, text)`: revokes its
--   `authenticated` EXECUTE, removes its row from `platform.client_callable_door`, and drops the
--   overload. The one-argument `custom.context_resolve(jsonb)` — the door every caller uses — is
--   untouched. No data row is touched. The inverse
--   (`migrations/inverse/suitehealth3_the_retired_context_resolve_shape_is_gone_down.sql`) puts the
--   overload, its comment, its door row and its grant back exactly as they were.
--
-- LANE SUITE-HEALTH-3 (chair ruling 1, 2026-09-25). `pnpm check:store-doors-decide` censuses 1 and
-- 5 named this overload: a client door taking an organization id whose body decides nothing. Its
-- whole body was `return custom.context_resolve(p_bindings);` — lane SC-3' kept it as a "RETIRED
-- SHAPE" so callers built before the one-argument door kept working, ignoring both
-- p_organization_id and p_scope_slug. Nothing calls it any more (grep of aidream, matrx-frontend
-- and matrx-extend on 2026-09-25: the server's RecordStore.context_resolve calls the one-argument
-- door; the only other mentions are migrations, the generated store registry and one suite that
-- read its body), and the database holds no dependent object and no other body naming it. A door
-- is never left standing beside its replacement.

set local lock_timeout = '30s';

revoke execute on function custom.context_resolve(uuid, jsonb, text) from authenticated;

delete from platform.client_callable_door
 where schema_name = 'custom'
   and function_name = 'context_resolve'
   and identity_args = 'p_organization_id uuid, p_bindings jsonb, p_scope_slug text';

drop function custom.context_resolve(uuid, jsonb, text);
