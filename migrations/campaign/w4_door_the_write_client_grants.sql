-- chair-step: GRANT, which the additive allow-list refuses by name at production — and correctly, because a blacklist cannot tell a door being opened from a schema being thrown open. This opens EXACTLY the eight write-side doors declared by w4_door_the_write_doors_are_client_callable.sql, and nothing else in schema custom. Every other object stays revoked from every client role, anon gets nothing, and the product switch custom/system_enabled still resolves false, so the store still takes no writes from a browser until the switch checklist turns it on.
--
-- W4-DOOR — THE WRITE DOORS THE CLIENTS NEED, AND ONLY THOSE.
--
-- DOOR-1 · DOOR-3 · DOOR-N-1 · AGT-N-4.
--
-- WHAT THIS OPENS, for `authenticated` only:
--   · EXECUTE on custom.record_write, custom.record_update, custom.record_delete and
--     custom.record_restore — the four record write doors.
--   · EXECUTE on custom.table_declare, custom.applicable_fields, custom.table_capacity
--     and custom.promote_table — the four Table-shaped doors.
-- All eight carry `signed_in_callers = true` in `platform.client_callable_door`, all eight
-- are SECURITY DEFINER, and all eight decide membership in their own body through
-- `custom.assert_client_may_reach` before they read or write anything. The schema USAGE
-- grant is already held (the read doors).
--
-- WHAT THIS DOES NOT OPEN
--   · Any table. `custom.record` and every other table in the schema keep zero INSERT,
--     UPDATE or DELETE for every client role: DOOR-N-1 is a privilege fact, and
--     `custom.client_write_grants()` still answers empty after this file.
--   · anon, public, service_role. Nothing here reaches any of them.
--   · custom.record_values_versioned and custom.record_aggregate, which stay server-lane
--     for the reasons written into the companion file's last section.
--
-- THE INVERSE is `migrations/inverse/w4_door_the_write_client_grants_down.sql`, which
-- revokes exactly these eight grants and leaves the read doors untouched.

set lock_timeout = '5s';
set statement_timeout = '120s';

-- ---------------------------------------------------------------------------------------
-- 1. THE FOUR RECORD DOORS' REGISTRY ROWS, FLIPPED FIRST. `platform.enforce_definer_client_grants`
--    reads the door row INSIDE the GRANT statement and revokes a client EXECUTE on any
--    function whose row says no client may open it — so a grant issued before this UPDATE
--    would be taken back by the database in the same breath, silently enough that the file
--    would look applied. The four Table-shaped doors' rows were INSERTed by the companion
--    file; these four already existed and an UPDATE is what a flip is.
-- ---------------------------------------------------------------------------------------

update platform.client_callable_door d
   set signed_in_callers = true,
       non_client_lane   = null,
       identity_args     = iam.door_identity_args(p.oid),
       reason            = v.reason,
       declared_by       = 'W4-DOOR-WRITE'
  from (values
    ('record_write',
     'W4-DOOR / DOOR-3: the create door. The store is switched per organization by custom/system_enabled and the body asks custom.assert_store_door first; membership is decided by custom.assert_client_may_reach for auth.uid() before the insert, and custom._field_write_door judges every field of the document as it lands. The client (the agent tool and @ai-matrx/records) runs as the operating person, so there is no principal argument to forge.'),
    ('record_update',
     'W4-DOOR / DOOR-3: the patch door, with the opt-in compare-and-swap on expected_version. Switch first, then custom.assert_client_may_reach for auth.uid(), then the field write door per key. A stale write is refused with the contested values rather than silently overwritten.'),
    ('record_delete',
     'W4-DOOR / DOOR-3: the soft-delete door. Switch first, then custom.assert_client_may_reach for auth.uid(). It sets deleted_at and never removes a row, so every delete a client makes is reversible through custom.record_restore.'),
    ('record_restore',
     'W4-DOOR / DOOR-3: the undo door for a soft delete. Switch first, then custom.assert_client_may_reach for auth.uid(). It refuses by name when the record was not deleted or is not in this organization.')
  ) v(fn, reason),
       pg_proc p
  join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'custom'
 where d.schema_name = 'custom'
   and d.function_name = v.fn
   and p.proname = v.fn
   and d.identity_argtypes = platform.door_argtypes(p.proargtypes);

-- ---------------------------------------------------------------------------------------
-- 2. THE GRANTS, and they are exactly eight functions.
-- ---------------------------------------------------------------------------------------

grant execute on function custom.record_write(uuid, uuid, jsonb) to authenticated;
grant execute on function custom.record_update(uuid, uuid, jsonb, integer) to authenticated;
grant execute on function custom.record_delete(uuid, uuid) to authenticated;
grant execute on function custom.record_restore(uuid, uuid) to authenticated;

grant execute on function custom.table_declare(uuid, jsonb) to authenticated;
grant execute on function custom.applicable_fields(uuid, uuid, text) to authenticated;
grant execute on function custom.table_capacity(uuid, uuid) to authenticated;
grant execute on function custom.promote_table(uuid, uuid) to authenticated;
