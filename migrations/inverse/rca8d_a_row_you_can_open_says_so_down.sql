-- chair-step: rehearsal inverse of rca8d — access_denied_context's level ladder asks the kernel and every level must pass the privilege-based real read again; _access_request_file asks the kernel.
-- Inverse of migrations/rca8d_a_row_you_can_open_says_so.sql (rehearsal only).

set local lock_timeout = '2s';

do $patch$
declare
  v_def text;
  v_n int;
  r record;
  v_fn text := null;
begin
  for r in
    select * from (values
      (4, 'public._access_request_file(text,uuid,text,text)', 3,
       $a$platform.detail_parent_access(p_resource_type, p_resource_id, $a$,
       $a$iam.has_access(p_resource_type, p_resource_id, $a$),
      (3, 'public.access_denied_context(text,uuid)', 1,
       $a$  -- RC-A8 L2: a table no client role may SELECT at all (the Data Tables store, read only through
  -- its doors) has no policy to evaluate — the one rule that granted the level IS its real read.
  if v_level <> 'none'
     and not (v_door_level
              and not has_column_privilege(case when v_uid is null then 'anon' else 'authenticated' end,
                                           format('%I.%I', v_meta.schema_name, v_meta.table_name), 'id', 'select')) then
    v_read_role := case when v_uid is null then 'anon' else 'authenticated' end;
$a$,
       $a$  if v_level <> 'none' then
    v_read_role := case when v_uid is null then 'anon' else 'authenticated' end;
$a$),
      (2, 'public.access_denied_context(text,uuid)', 1,
       $a$    -- RC-A8 L2: the ONE RULE the doors use (platform.detail_parent_access: custom.reaches_directly
    -- for a Data Tables record — the Table shared with you opens its rows — iam.has_access otherwise).
    if platform.detail_parent_access(v_meta.token, p_id, 'admin'::public.permission_level) then
      v_level := 'admin';
    elsif platform.detail_parent_access(v_meta.token, p_id, 'editor'::public.permission_level) then
      v_level := 'edit';
    elsif platform.detail_parent_access(v_meta.token, p_id, 'viewer'::public.permission_level) then
      v_level := 'view';
    end if;
    v_door_level := v_level <> 'none';
$a$,
       $a$    if iam.has_access(v_meta.token, p_id, 'admin'::public.permission_level) then
      v_level := 'admin';
    elsif iam.has_access(v_meta.token, p_id, 'editor'::public.permission_level) then
      v_level := 'edit';
    elsif iam.has_access(v_meta.token, p_id, 'viewer'::public.permission_level) then
      v_level := 'view';
    end if;
$a$),
      (1, 'public.access_denied_context(text,uuid)', 1,
       $a$  v_row_security   boolean := false;
  v_door_level     boolean := false;  -- RC-A8 L2: the level came from the one rule
$a$,
       $a$  v_row_security   boolean := false;
$a$)
    ) as t(ord, fn, expected, anchor, repl)
    order by ord desc
  loop
    if v_fn is distinct from r.fn then
      if v_fn is not null then execute v_def; end if;
      v_fn := r.fn;
      v_def := pg_get_functiondef(r.fn::regprocedure);
    end if;
    v_n := (length(v_def) - length(replace(v_def, r.anchor, ''))) / length(r.anchor);
    if v_n <> r.expected then
      raise exception 'rca8d inverse %: anchor occurs % time(s) in %, expected % — nothing was changed', r.ord, v_n, r.fn, r.expected;
    end if;
    v_def := replace(v_def, r.anchor, r.repl);
  end loop;
  execute v_def;
end
$patch$;
