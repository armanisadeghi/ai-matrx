-- INVERSE of migrations/campaign/argsruled_every_relation_argument_names_its_check.sql.
--
-- It takes the eleven rulings back off the door registry. All eleven rows carried
-- argument_rules = NULL before that file (measured 2026-09-21), so this restores them exactly.
-- With this applied the per-argument census rises from 225 back to 236 and
-- `uv run python scripts/check_definer_bodies_decide_access.py` fails on the ceiling again,
-- which is what makes the shrink a measurement rather than a story.

set lock_timeout = '4s';

update platform.client_callable_door
   set argument_rules = null
 where schema_name = 'platform'
   and function_name in ('relation_declaration','relation_delete_effects','relation_field',
                         'relation_history','relation_label','relation_on_delete','relation_set',
                         'relation_snapshot_of','relation_unset','relations_from','relations_to');
