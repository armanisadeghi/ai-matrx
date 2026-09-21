-- INVERSE of migrations/campaign/argsruled_the_eighteen_doors_outside_the_store.sql.
--
-- Seven of the eight doors held argument_rules = NULL before that file (measured 2026-09-21).
-- context.provision_scope_dataset held the AD251 declared-unchecked pair written by
-- 0851_every_door_names_every_argument.sql on 2026-09-17, and this restores it byte for byte.
-- With this applied the per-argument census rises from 217 back to 225 and
-- `uv run python scripts/check_definer_bodies_decide_access.py` fails on the ceiling again.

set lock_timeout = '4s';

update platform.client_callable_door
   set argument_rules = null
 where (schema_name, function_name) in (
   ('iam','may_address_user_in_org'), ('iam','publish_binding_create'), ('iam','record_visible_in_org'),
   ('platform','emit_pending_assist'), ('platform','knob_snapshot'), ('platform','unified_data_store_set'),
   ('scheduler','sch_run_claim'));

update platform.client_callable_door
   set argument_rules = '{"version": 1, "arguments": {"p_item_id": {"type": "uuid", "check": "AD251: reads any context item; no data to prove against (context lane)", "foreign": {"note": "AD251: reads any context item; no data to prove against (context lane)", "defect": "AD251", "unchecked": true}, "optional": false, "position": 1, "verified": "static reading 2026-09-17; not provable as a non-member", "null_rule": {}}, "p_scope_id": {"type": "uuid", "check": "AD251: provisions a dataset into any scope''s organization; no data to prove against (context lane)", "foreign": {"note": "AD251: provisions a dataset into any scope''s organization; no data to prove against (context lane)", "defect": "AD251", "unchecked": true}, "optional": false, "position": 2, "verified": "static reading 2026-09-17; not provable as a non-member", "null_rule": {}}}, "declared_by": "0851_every_door_names_every_argument.sql"}'::jsonb
 where (schema_name, function_name) = ('context','provision_scope_dataset');
