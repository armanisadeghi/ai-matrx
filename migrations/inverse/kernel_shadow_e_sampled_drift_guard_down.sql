-- chair-step: undo kernel_shadow_e_sampled_drift_guard.sql - the shadow runs again only for the listed people (admin@admin.com, test@test.com) on every call, drops the sample knob, the status reader and the sweep, and stops writing system errors on disagreement
-- lane: KERNEL-SHADOW
-- based-on: iam.kernel_shadow_on(uuid) c6ccb8c290081b7b679e7aebefd26a7c44f200c103a23f4a9f0fbeea392258f0
-- based-on: iam.has_access_for_shadow(uuid, uuid[], text, text, text) a71653eac729d4e00bce6f222221eb6d971ea6eba0b75a80ee1ef4815f381ce3

create or replace function iam.kernel_shadow_on(p_person uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $function$
-- KERNEL-SHADOW: is the access-kernel shadow on for this person (knob access/kernel_shadow, a list of
-- user ids, empty by default)? Any failure to read the knob answers false: the shadow is optional
-- and must never stand between a person and an answer.
begin
  if p_person is null then return false; end if;
  return coalesce(platform.knob_resolve('access', 'kernel_shadow', null) ? p_person::text, false);
exception when others then
  return false;
end;
$function$;

CREATE OR REPLACE FUNCTION iam.has_access_for_shadow(p_person uuid, p_targets uuid[], p_level text, p_type text DEFAULT 'record'::text, p_caller text DEFAULT NULL::text)
 RETURNS TABLE(target uuid, allowed boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- KERNEL-SHADOW: ask the one-at-a-time access kernel (iam.has_access_for) and its set form
-- (iam.has_access_for_many) the same question, log every disagreement to iam.access_shadow_log, and
-- return the OLD answer. It never raises. Agreement is written only when free (see below); a
-- disagreement or a failure of the set form is always written, or warned where nothing can be written.
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

  -- A WRITE HERE COSTS THE CALLER: the store's statement memo (platform.memo_k_*) only works while the
  -- transaction has written nothing, so the first insert would slow everything after it in the
  -- caller's transaction (measured: data_home 2.6 s -> 11 s for admin@admin.com in a read-write
  -- transaction). So an AGREEMENT is written only when the transaction has already written (no new
  -- cost); otherwise it is one server-log line. A DISAGREEMENT or an error is always written - that is
  -- what the shadow exists for - and where it cannot be (a read-only transaction: PostgREST runs STABLE
  -- functions read-only) it is a WARNING line instead.
  if v_new is not null and v_bad = 0 and pg_catalog.pg_current_xact_id_if_assigned() is null then
    raise log 'KERNEL-SHADOW person=% level=% caller=% compared=% disagreed=0', p_person, v_req, v_caller, v_n;
  else
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
  end if;

  return query select o.key::uuid, (o.value)::text::boolean from jsonb_each(v_old) o;
end;
$function$;

update platform.feature_knob
   set value = '["87a6e699-3622-4869-8843-d0867456c0dd", "4060701e-706a-4c76-b3ca-0bbc69fa5a14"]'::jsonb, updated_at = now()
 where feature = 'access' and key = 'kernel_shadow';
delete from platform.feature_knob where feature = 'access' and key = 'kernel_shadow_sample';
drop function if exists iam.access_shadow_status();
drop function if exists iam.kernel_shadow_sweep(integer, integer);
delete from platform.client_callable_door
 where schema_name = 'iam' and function_name in ('access_shadow_status', 'kernel_shadow_sweep');
