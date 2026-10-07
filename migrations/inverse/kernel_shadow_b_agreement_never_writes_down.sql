-- chair-step: undo kernel_shadow_b_agreement_never_writes.sql - restores iam.has_access_for_shadow's first body (every shadow call writes a summary row); answers never change
-- lane: KERNEL-SHADOW
-- based-on: iam.has_access_for_shadow(uuid, uuid[], text, text, text) d6e7108a3b1331211d51dfd0e0f3556ec72569b2e01f4c4e177d1e5e478ce464

create or replace function iam.has_access_for_shadow(
  p_person  uuid,
  p_targets uuid[],
  p_level   text,
  p_type    text default 'record',
  p_caller  text default null
)
returns table(target uuid, allowed boolean)
language plpgsql
volatile
security definer
set search_path to ''
as $function$
-- KERNEL-SHADOW: ask the one-at-a-time access kernel (iam.has_access_for) and its set form
-- (iam.has_access_for_many) the same question, log every disagreement to iam.access_shadow_log, and
-- return the OLD answer. It never raises: a failure of the set form is logged as an error summary,
-- and a read-only transaction (where nothing can be written) gets a WARNING line tagged KERNEL-SHADOW.
declare
  v_req     public.permission_level := coalesce(p_level, 'viewer')::public.permission_level;
  v_old     jsonb;
  v_new     jsonb;
  v_n       integer := 0;
  v_bad     integer := 0;
  v_err     text;
  v_caller  text := coalesce(p_caller, 'direct');
begin
  if p_targets is null or cardinality(p_targets) = 0 then
    return;
  end if;

  select coalesce(jsonb_object_agg(u.x::text, coalesce(iam.has_access_for(p_person, p_type, u.x, v_req), false)), '{}'::jsonb)
    into v_old
    from (select distinct x from unnest(p_targets) x where x is not null) u(x);
  v_n := (select count(*) from jsonb_object_keys(v_old));

  begin
    select coalesce(jsonb_object_agg(m.target::text, m.allowed), '{}'::jsonb)
      into v_new
      from iam.has_access_for_many(p_person, p_targets, p_level, p_type) m;
  exception when others then
    v_err := sqlstate || ' ' || sqlerrm;
    v_new := null;
  end;

  if v_new is not null then
    v_bad := (select count(*) from jsonb_each(v_old) o
               where (v_new -> o.key) is distinct from o.value);
  end if;

  begin
    if v_new is not null and v_bad > 0 then
      insert into iam.access_shadow_log (person, target, level, old_answer, new_answer, caller)
      select p_person, o.key::uuid, v_req::text, (o.value)::text::boolean,
             (v_new ->> o.key)::boolean, v_caller
        from jsonb_each(v_old) o
       where (v_new -> o.key) is distinct from o.value;
    end if;
    insert into iam.access_shadow_log (person, target, level, caller, compared, disagreed, error)
    values (p_person, null, v_req::text, v_caller, v_n, case when v_new is null then null else v_bad end, v_err);
  exception when others then
    raise warning 'KERNEL-SHADOW person=% level=% caller=% compared=% disagreed=% error=% (not logged: % %)',
      p_person, v_req, v_caller, v_n, case when v_new is null then null else v_bad end, v_err, sqlstate, sqlerrm;
  end;

  return query select o.key::uuid, (o.value)::text::boolean from jsonb_each(v_old) o;
end;
$function$;
