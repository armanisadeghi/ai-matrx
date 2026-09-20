-- MIRROR-2, the inverse of file 3: the door row's stored signature put back to the hand-typed
-- text it carried, which is what census 9 of `pnpm check:store-doors-decide` goes red on.
update platform.client_callable_door
   set identity_args = 'p_organization_id uuid, p_table_id uuid, p_id uuid, p_visibility visibility, p_created_by uuid, p_required permission_level'
 where schema_name = 'iam' and function_name = 'record_visible_in_org';
