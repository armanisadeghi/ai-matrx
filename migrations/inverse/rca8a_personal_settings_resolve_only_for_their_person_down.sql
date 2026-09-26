-- chair-step: rehearsal inverse of rca8a — restores the knob resolver's and knob_history's user-rung behaviour, drops platform.knob_person_for.
-- Inverse of migrations/rca8a_personal_settings_resolve_only_for_their_person.sql (rehearsal only).

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
      (1, 'platform.knob_resolve_uncached(text,text,uuid,uuid,jsonb)', 1,
       E'  v_offered numeric;\n  -- RC-A8: the user rung is the caller''s own (or the server''s to name), never a colleague''s.\n  v_person uuid := platform.knob_person_for(p_user_id);\nbegin\n',
       E'  v_offered numeric;\nbegin\n'),
      (2, 'platform.knob_resolve_uncached(text,text,uuid,uuid,jsonb)', 2,
       $a$o.scope_kind = 'user' and v_person is not null and o.scope_id = v_person$a$,
       $a$o.scope_kind = 'user' and p_user_id is not null and o.scope_id = p_user_id$a$),
      (3, 'platform.knob_resolve_uncached(text,text,uuid,uuid,jsonb)', 2,
       $a$e ->> 'kind' = o.scope_kind and o.scope_kind <> 'user'$a$,
       $a$e ->> 'kind' = o.scope_kind$a$),
      (4, 'platform.knob_history(text,text,uuid,text,uuid,integer)', 1,
       $a$if v_kind = 'user' and p_scope_id is distinct from v_uid and not (v_backend or v_padmin) then  -- RC-A8: never an org admin$a$,
       $a$if v_kind = 'user' and p_scope_id is distinct from v_uid and not v_org_admin then$a$),
      (5, 'platform.knob_history(text,text,uuid,text,uuid,integer)', 1,
       $a$(a.scope_kind <> 'user' or v_backend or v_padmin or a.scope_id = v_uid)$a$,
       $a$(a.scope_kind <> 'user' or v_org_admin or a.scope_id = v_uid)$a$)
    ) as t(ord, fn, expected, anchor, repl)
    order by ord
  loop
    if v_fn is distinct from r.fn then
      if v_fn is not null then execute v_def; end if;
      v_fn := r.fn;
      v_def := pg_get_functiondef(r.fn::regprocedure);
    end if;
    v_n := (length(v_def) - length(replace(v_def, r.anchor, ''))) / length(r.anchor);
    if v_n <> r.expected then
      raise exception 'rca8a inverse %: anchor occurs % time(s) in %, expected %', r.ord, v_n, r.fn, r.expected;
    end if;
    v_def := replace(v_def, r.anchor, r.repl);
  end loop;
  execute v_def;
end
$patch$;

drop function platform.knob_person_for(uuid);
