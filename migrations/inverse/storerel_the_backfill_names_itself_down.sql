-- STORE-REL 1b's inverse — the backfilled edges stop naming their field again. It is the same
-- line STORE-REL 1's own inverse runs; the two are one undo.
-- An automated write names the system doing it (platform._stamp_actor_tier), and taking the
-- column back is exactly as automated as filling it in was.
select set_config('app.actor_system', 'custom.relations', true);

update platform.associations a
   set relation_field_id = null
 where a.source_type = 'record'
   and a.relation_field_id is not null;
