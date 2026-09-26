-- chair-step: rule-27 inverse of can_act_questions_ask_the_access_kernel.sql — the four doors go back to the direct-share check (people the kernel admits, e.g. through their organization, are refused again) and the inner list reader's door row is removed.
-- based-on: public.get_agent_core_batch(uuid[], text[]) c8d7eed35ad6d15ee788d653cc0bee1148539178d7b19208d4b8c2a0c5dd139e
-- based-on: public.get_agent_operational(uuid, text) 508c5b60c7639ac9c775eaafdcd7261a43183eada44abe07ac2c3bcb83839974
-- based-on: public._d31_impl_get_user_list_with_items(uuid) 03efb274ec1149ba4f7d4730936ea00f5bc4d136bdb49a11c1eafc4f7657f1fd
-- based-on: public.get_user_list_with_items(uuid) 0b8fa9c6bd192716f04a37f2cafb4e50a6ff60da4ebcd8252721bcfd72eba93e

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
       $a$iam.has_access('agent', d.id, 'viewer'::public.permission_level)$a$,
       $b$has_permission('agent', d.id, 'viewer')$b$),
      ('public.get_agent_operational(uuid,text)',
       $a$iam.has_access('agent', d.id, 'viewer'::public.permission_level)$a$,
       $b$has_permission('agent', d.id, 'viewer')$b$),
      ('public._d31_impl_get_user_list_with_items(uuid)',
       $a$iam.has_access('structured_list', l.id, 'editor'::public.permission_level)$a$,
       $b$has_permission('structured_list', l.id, 'editor'::permission_level)$b$),
      ('public.get_user_list_with_items(uuid)',
       $a$iam.has_access('structured_list', p_list_id, 'viewer'::public.permission_level)$a$,
       $b$public.has_permission('structured_list', p_list_id, 'viewer')$b$)
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

delete from platform.client_callable_door where schema_name = 'public' and function_name = '_d31_impl_get_user_list_with_items';
