-- INVERSE of migrations/campaign/fix10b_the_registry_and_the_seal_are_reachable_from_a_screen.sql
-- (lane FIX-10B). It takes back the two client grants and deletes the two door rows the
-- forward file added. Neither function is dropped or changed; both existed before it and both
-- keep working for the roles that could already call them.
--
-- Running this restores the defect on purpose: the Add-field panel can no longer read the
-- store's list of column kinds, and the screen that shows a signature can no longer ask
-- whether the seal still holds.

begin;

revoke execute on function custom.field_kinds() from authenticated;
revoke execute on function custom.doc_signature_intact(uuid, uuid) from authenticated;

delete from platform.client_callable_door
 where schema_name = 'custom'
   and function_name in ('field_kinds', 'doc_signature_intact');

commit;
