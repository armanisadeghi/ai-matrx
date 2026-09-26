-- chair-step: rehearsal inverse of rca2i — restores the six bodies and the client EXECUTE grants, drops iam.asks_about_caller.
-- Inverse of migrations/rca2i_per_person_functions_answer_only_about_the_caller.sql (rehearsal only).

set local lock_timeout = '2s';

do $patch$
declare
  v_def text;
  v_fn text;
  v_n int;
  r record;
begin
  for r in
    select * from (values
      (1, 'public.can_curate_library_document(uuid,uuid)', 1,
       E'            and pd.deleted_at is null\n      ))\n  end;\n',
       E'            and pd.deleted_at is null\n      );\n'),
      (2, 'public.can_curate_library_document(uuid,uuid)', 1,
       E'  select case when iam.asks_about_caller(p_user, ''public.can_curate_library_document'')\n  then (public.is_super_admin_user(p_user)\n      or exists (\n',
       E'  select public.is_super_admin_user(p_user)\n      or exists (\n'),
      (3, 'billing.resolve_tier(uuid)', 1,
       E'\nbegin\n  perform iam.asks_about_caller(p_user, ''billing.resolve_tier'');\n',
       E'\nbegin\n'),
      (4, 'billing.resolve_capability(uuid,text,uuid)', 1,
       E'\nbegin\n  perform iam.asks_about_caller(p_user, ''billing.resolve_capability'');\n',
       E'\nbegin\n'),
      (5, 'public.dict_list_owners_for(uuid)', 1,
       E'\n    PERFORM iam.asks_about_caller(p_user_id, ''public.dict_list_owners_for'');\n', E'\n'),
      (6, 'public.dict_resolve_for(uuid,boolean,boolean,uuid[],uuid[],uuid[])', 1,
       E'\n    PERFORM iam.asks_about_caller(p_user_id, ''public.dict_resolve_for'');\n', E'\n'),
      (7, 'public.dict_assert_access(uuid,text,uuid)', 1,
       E'\n    PERFORM iam.asks_about_caller(p_user_id, ''public.dict_assert_access'');\n', E'\n')
    ) as t(ord, fn, expected, anchor, repl)
    order by ord
  loop
    -- one function's anchors are applied together and the function is replaced ONCE, so a body is
    -- never executed half-edited
    if v_fn is distinct from r.fn then
      if v_fn is not null then execute v_def; end if;
      v_fn := r.fn;
      v_def := pg_get_functiondef(r.fn::regprocedure);
    end if;
    v_n := (length(v_def) - length(replace(v_def, r.anchor, ''))) / length(r.anchor);
    if v_n <> r.expected then
      raise exception 'rca2i inverse %: anchor occurs % time(s) in %, expected % — nothing was changed', r.ord, v_n, r.fn, r.expected;
    end if;
    v_def := replace(v_def, r.anchor, r.repl);
  end loop;
  execute v_def;
end
$patch$;

grant execute on function platform.detail_parent_access_for(uuid, text, uuid, public.permission_level) to authenticated;
grant execute on function public.fn_get_user_usage_snapshot(uuid) to authenticated, authenticator;
grant execute on function public.cx_canvas_list_by_user(uuid, text, boolean, text, integer, integer) to authenticated, authenticator;
grant execute on function iam.entity_read_equivalence(text, text, text, uuid, integer, text) to authenticated, authenticator;
grant execute on function iam.privacy_wall_read_lane_parity(integer) to authenticated, authenticator;
grant execute on function iam.access_resolver_disagreements(integer, text, integer) to authenticated, authenticator;
grant execute on function iam.component_wider_than_parent(uuid[], text) to authenticated, authenticator;

drop function iam.asks_about_caller(uuid, text);
