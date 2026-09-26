-- chair-step: rehearsal inverse of rca2j — restores public.access_denied_context's org-member full answer and the detail `via` on a missing record.
-- Inverse of migrations/rca2j_a_record_you_may_not_know_of_answers_like_a_random_id.sql (rehearsal only).

set local lock_timeout = '2s';

do $patch$
declare
  v_def text;
  v_n int;
  r record;
begin
  v_def := pg_get_functiondef('public.access_denied_context(text,uuid)'::regprocedure);
  for r in
    select * from (values
      (1, 1,
       $a$    v_entity_json := public.access_denied_context(v_parent_type, v_parent_id);
    -- RC-A2j: a detail on a record the caller may not know of is a random id — its own token, no
    -- `via` (which would say "a comment with this id exists on something").
    if v_entity_json ->> 'exists' = 'false' then
      return jsonb_build_object(
        'exists', false, 'deleted', false, 'level', 'none', 'disclosure', 'none',
        'entity', jsonb_build_object('token', v_meta.token, 'label', v_meta.label));
    end if;
    return v_entity_json || jsonb_build_object('via', jsonb_build_object('token', v_meta.token));
$a$,
       $a$    return public.access_denied_context(v_parent_type, v_parent_id)
           || jsonb_build_object('via', jsonb_build_object('token', v_meta.token));
$a$),
      (2, 1,
       $a$  -- RC-A2j: THE HIDDEN RECORD'S ANSWER IS THE MISSING ANSWER — for a member of its organization
  -- too. Only whoever may discover the row, or an owner/admin of the organization holding it (the
  -- org's own oversight: the Table transfer offer), keeps the full answer.
  if v_uid is not null
     and v_level = 'none'
     and not v_is_owner
     and (
           (v_ancestor_json is null
            and not (v_attrs.o_org is not null and iam.has_org_access_for(v_uid, v_attrs.o_org)))
        or not (iam.is_discoverable(v_uid, v_meta.token, p_id, 'viewer'::public.permission_level)
                or (v_attrs.o_org is not null and public.is_org_admin_for(v_uid, v_attrs.o_org)))
         ) then
$a$,
       $a$  if v_uid is not null
     and v_level = 'none'
     and not v_is_owner
     and v_ancestor_json is null
     and not (v_attrs.o_org is not null and iam.has_org_access_for(v_uid, v_attrs.o_org)) then
$a$)
    ) as t(ord, expected, anchor, repl)
    order by ord
  loop
    v_n := (length(v_def) - length(replace(v_def, r.anchor, ''))) / length(r.anchor);
    if v_n <> r.expected then
      raise exception 'rca2j inverse %: anchor occurs % time(s), expected %', r.ord, v_n, r.expected;
    end if;
    v_def := replace(v_def, r.anchor, r.repl);
  end loop;
  execute v_def;
end
$patch$;
