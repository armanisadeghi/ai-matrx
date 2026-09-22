-- INVERSE of migrations/campaign/fix10b_the_seal_is_asked_through_its_own_door.sql
-- (lane FIX-10B). It puts back the door row and the client grant on
-- `custom.doc_signature_intact(uuid, uuid)` — that is, it restores a door that answers
-- `42501 permission denied for table doc_signature` to every browser that walks through it.
-- Nothing about the function changes either way.

begin;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, declared_by, reason)
select 'custom', 'doc_signature_intact', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       true, false,
       'migrations/inverse/fix10b_the_seal_is_asked_through_its_own_door_down.sql (lane FIX-10B)',
       'Restored by the inverse. The function is SECURITY INVOKER over a doors-only table, so this door cannot serve a client; custom.doc_signature_read is the one that can.'
  from pg_proc p
 where p.proname = 'doc_signature_intact' and p.pronamespace = 'custom'::regnamespace
   and not exists (select 1 from platform.client_callable_door d
                    where d.schema_name = 'custom' and d.function_name = 'doc_signature_intact'
                      and d.identity_argtypes = platform.door_argtypes(p.proargtypes));

grant execute on function custom.doc_signature_intact(uuid, uuid) to authenticated;

commit;
