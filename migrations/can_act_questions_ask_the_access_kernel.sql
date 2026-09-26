-- "May this person act on this record?" is answered by the ACCESS KERNEL (iam.has_access), never by
-- public.has_permission, which reads DIRECT share rows only. Census 2026-09-26 (RC-B11 round 3):
-- these four doors used the direct-share check as their access question, so a person the kernel
-- admits (organization visibility, membership, container reach) was refused. Measured: admin@admin.com
-- reads agent 24b60447… through RLS (1 row) but get_agent_operational / get_agent_core_batch returned
-- 0 rows for it; 34 such agents among the first 3000 user agents.
-- Kept on purpose (they ARE the direct-share lane or say so): iam.has_access_for_base,
-- iam.is_discoverable_base, iam.access_level, files.is_listable_for (lane composition),
-- public.get_resource_access (components/registry-only tokens), seo_rank_target_list_scoped ('shared'
-- scope = shared with me directly).
-- based-on: public.get_agent_core_batch(uuid[], text[]) 895613c12f7faa8937ab108bf815e26749734a63bea0b1f085d8f9a4b5e35288
-- based-on: public.get_agent_operational(uuid, text) 1134a8b1684000c8f3f94ac41dbea7954c30afa071ab9b505b817273d78a5284
-- based-on: public._d31_impl_get_user_list_with_items(uuid) 18b519f55ed2ac89af8b96d55b9568775d9ee06e7ad8134385bd1cba3a303ce6
-- based-on: public.get_user_list_with_items(uuid) 9fe9417823387f6fe70abf7f35c8e21cebb386a37ef0cbe41de2eae44842346a

set local lock_timeout = '2s';

do $patch$
declare
  r record;
  v_def text;
  v_n int;
begin
  for r in
    select * from (values
      ('public.get_agent_core_batch(uuid[],text[])',
       $a$has_permission('agent', d.id, 'viewer')$a$,
       $b$iam.has_access('agent', d.id, 'viewer'::public.permission_level)$b$),
      ('public.get_agent_operational(uuid,text)',
       $a$has_permission('agent', d.id, 'viewer')$a$,
       $b$iam.has_access('agent', d.id, 'viewer'::public.permission_level)$b$),
      ('public._d31_impl_get_user_list_with_items(uuid)',
       $a$has_permission('structured_list', l.id, 'editor'::permission_level)$a$,
       $b$iam.has_access('structured_list', l.id, 'editor'::public.permission_level)$b$),
      ('public.get_user_list_with_items(uuid)',
       $a$public.has_permission('structured_list', p_list_id, 'viewer')$a$,
       $b$iam.has_access('structured_list', p_list_id, 'viewer'::public.permission_level)$b$)
    ) as t(fn, old_text, new_text)
  loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    v_n := (length(v_def) - length(replace(v_def, r.old_text, ''))) / length(r.old_text);
    if v_n < 1 then
      raise exception 'can_act patch: % does not contain % (found % times)', r.fn, r.old_text, v_n;
    end if;
    execute replace(v_def, r.old_text, r.new_text);
  end loop;
end
$patch$;

-- The inner list reader is not a client door (postgres-only EXECUTE, reached only through the gated
-- public.get_user_list_with_items); recreating it needs that said IN DATA (provision_shape_guard).
insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
select 'public', '_d31_impl_get_user_list_with_items', pg_get_function_identity_arguments(p.oid), platform.door_argtypes(p.proargtypes),
       'p_list_id: the caller''s viewer access was checked by public.get_user_list_with_items (iam.has_access structured_list viewer) before this runs; NULL list id returns nothing.',
       'can_act_questions_ask_the_access_kernel',
       'server_only: called only inside public.get_user_list_with_items after its viewer gate; EXECUTE stays postgres-only, no client or server lane calls it directly.',
       false, false
  from pg_proc p where p.oid = 'public._d31_impl_get_user_list_with_items(uuid)'::regprocedure
   and not exists (select 1 from platform.client_callable_door d where d.schema_name = 'public' and d.function_name = '_d31_impl_get_user_list_with_items');

