-- lane: SECURITY-SWEEP — the inverse of
-- migrations/campaign/secsweep_the_webhook_secret_is_minted_behind_a_door.sql
-- Removes the two doors and their register rows. Run only to prove the pair reverses (rule 27);
-- run it while the callers point at the doors and Create stops working.
drop function if exists files.webhook_create(text, uuid, text, text[], text[]);
drop function if exists files.webhook_rotate_secret(uuid);
delete from platform.client_callable_door
 where schema_name = 'files' and function_name in ('webhook_create', 'webhook_rotate_secret');
