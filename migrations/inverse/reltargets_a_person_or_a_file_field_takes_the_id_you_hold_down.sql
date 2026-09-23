-- chair-step: the inverse of
--   `migrations/campaign/reltargets_a_person_or_a_file_field_takes_the_id_you_hold.sql`.
--   It DROPS the trigger `_w_relation_kernel_targets` on `custom.record` and the two functions
--   that file created, `custom._relation_kernel_targets()` and
--   `custom.relation_kernel_record(uuid, uuid, uuid)`, with that function's server-only row in
--   `platform.client_callable_door`. Nothing else calls either. No row of
--   anybody's data is touched: a Person or File record the rule wrote on first use stays, and
--   every cell that names one stays valid, because it names a live kernel record — which is
--   what the store accepted before this file too.
--
--   WHAT RUNNING IT BRINGS BACK: a writer holding a member's user id or an uploaded file's id
--   is refused again with "… points at something that is not there".
--
-- window-class: a `drop trigger` on the partitioned parent `custom.record` takes ACCESS
--   EXCLUSIVE on the parent, its 16 partitions and the 23 auth/storage/realtime relations of
--   Supabase's supautils hook (DDL-LOCK census: 28+ relations), held to COMMIT — sign-in pauses
--   for the length of this transaction. At production it runs 01:00–04:00 Pacific only.
-- lock: custom
-- lane: RELATION-TARGETS
--
-- ground-standing-ok: c — all three names are this lane's own, created by
--   migrations/campaign/reltargets_a_person_or_a_file_field_takes_the_id_you_hold.sql, and no
--   other trigger, view, policy or function on this database calls either function.

drop trigger if exists _w_relation_kernel_targets on custom.record;
drop function if exists custom._relation_kernel_targets();
-- A door follows its function (provision_shape_guard): the declaration the up wrote goes with it.
delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = 'relation_kernel_record'
   and identity_args = 'p_organization_id uuid, p_kernel_table_id uuid, p_id uuid';
drop function if exists custom.relation_kernel_record(uuid, uuid, uuid);
