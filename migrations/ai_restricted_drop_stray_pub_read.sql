-- ai.api / ai.endpoint / ai.offering are rls_variant='restricted': authenticated
-- reads already require owner-or-super-admin. They each also carried a `pub_read`
-- policy granting ANON read of any row with visibility='public' — a contradiction
-- the `restricted` variant explicitly disallows, and a latent exposure of provider
-- API/endpoint/offering configuration.
--
-- Zero rows are currently visibility='public' (28 / 14 / 218 rows checked), so this
-- removes a trap rather than changing any live answer. Completes the ai schema.
DROP POLICY IF EXISTS pub_read ON ai.api;
DROP POLICY IF EXISTS pub_read ON ai.endpoint;
DROP POLICY IF EXISTS pub_read ON ai.offering;
