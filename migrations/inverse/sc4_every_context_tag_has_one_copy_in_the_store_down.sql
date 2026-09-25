-- chair-step: inverse of sc4_every_context_tag_has_one_copy_in_the_store.sql (lane SC-4) — drops the tag follow's and the fence's triggers on platform.associations and their functions, and custom.context_tag_copy. The copied tags already written stay, archived (soft delete, never a hard delete: the soft-delete law), and the fourteen `<kind> -> record` types are deactivated rather than removed, because an archived edge still names its type. Nothing in the old tags is touched.
-- window-class: DROP TRIGGER takes ACCESS EXCLUSIVE on platform.associations for the length of
--   this transaction (short; readers wait a moment), under lock_timeout.
set local lock_timeout = '2s';
set local statement_timeout = '180s';

drop trigger if exists zz_context_tag_follow_ins on platform.associations;
drop trigger if exists zz_context_tag_follow_upd on platform.associations;
drop trigger if exists zz_context_tag_follow_del on platform.associations;
drop trigger if exists _ab_context_tag_copy_fence_ins on platform.associations;
drop trigger if exists _ab_context_tag_copy_fence_upd on platform.associations;
drop function if exists platform._context_tag_follow_to_the_copy();
drop function if exists platform._context_tag_copy_fence();
drop function if exists custom.context_tag_copy(uuid);
-- A door follows its function (provision_shape_guard): the function is gone, so is its door row.
delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = 'context_tag_copy' and identity_args = 'p_organization_id uuid';

select set_config('app.actor_system', 'migration/sc4-inverse', true);
update platform.associations
   set deleted_at = now()
 where role = 'context_tag' and target_type = 'record' and deleted_at is null;

update platform.association_types
   set is_active = false
 where target_type = 'record'
   and notes like 'SC-4 P4:%';
