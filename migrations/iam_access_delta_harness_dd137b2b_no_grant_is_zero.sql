-- iam_access_delta_harness_dd137b2b_no_grant_is_zero — A ROLE WITH NO TABLE GRANT READS ZERO ROWS.
--
-- Found running the DD-137b step 3 baseline: the `anon` probe on `transcripts.studio_recording_chunks`
-- came back `42501: permission denied for table studio_recording_chunks`, and the gate — correctly,
-- by its own rule — refused the whole comparison as UNMEASURED.
--
-- But that is not an unmeasured pair. `permission denied for table` means the role holds no SELECT
-- grant at all, which is a STRONGER statement than "RLS let no rows through": it is zero rows, and
-- it is zero rows for reasons RLS never even gets asked about. Recording it as an error would make
-- every run containing a deliberately anon-less table unusable, and the predictable response to an
-- unusable gate is to stop running it.
--
-- So 42501 on the probe itself is recorded as readable_count = 0 with an empty id set and a NOTE in
-- error_text saying which grant was missing — the count is a measurement, the note is the reason,
-- and the gate reads the count. Every OTHER error stays an error: a timeout, a bad column, a
-- recursive policy (42P17) are all "I could not measure it", and those must keep refusing.
--
-- 🚨 AND THE ASYMMETRY IS DELIBERATE. If a grant is ADDED between the two snapshots, the after-side
-- stops being 42501 and starts counting real rows — so the pair reads as WIDER and the gate refuses
-- it, which is exactly right: handing `anon` a SELECT grant it did not have IS a widening.
create or replace function iam.access_delta_snapshot(
  p_label text,
  p_principals uuid[],
  p_tokens text[],
  p_id_cap integer default 20000,
  p_note text default null
) returns uuid
language plpgsql
as $function$
declare
  v_run uuid;
  v_principal uuid;
  v_token text;
  v_schema text; v_table text;
  v_label text;
  v_count bigint; v_hash text; v_ids uuid[]; v_sampled boolean; v_err text;
  v_anon constant uuid := '00000000-0000-0000-0000-000000000000';
begin
  if p_principals is null or cardinality(p_principals) = 0 then
    raise exception 'access_delta_snapshot: no principals. A delta over nobody proves nothing.';
  end if;
  if p_tokens is null or cardinality(p_tokens) = 0 then
    raise exception 'access_delta_snapshot: no tokens. A delta over no tables proves nothing.';
  end if;

  insert into iam.access_delta_run(label, note) values (p_label, p_note) returning id into v_run;

  foreach v_token in array p_tokens loop
    select et.schema_name, et.table_name into v_schema, v_table
      from platform.entity_types et where et.token = v_token and et.is_active;
    if v_schema is null then
      raise exception 'access_delta_snapshot: token % is not an active registered entity', v_token;
    end if;
    if to_regclass(format('%I.%I', v_schema, v_table)) is null then
      raise exception 'access_delta_snapshot: %.% does not exist', v_schema, v_table;
    end if;

    foreach v_principal in array p_principals loop
      v_count := null; v_hash := null; v_ids := null; v_sampled := false; v_err := null;

      select coalesce(u.email, v_principal::text) into v_label from auth.users u where u.id = v_principal;
      if v_principal = v_anon then v_label := 'anonymous (no JWT)'; end if;
      v_label := coalesce(v_label, v_principal::text || ' (no auth.users row)');

      begin
        if v_principal = v_anon then
          perform set_config('request.jwt.claims', null, true);
          execute 'set local role anon';
        else
          perform set_config('request.jwt.claims',
            json_build_object('sub', v_principal::text, 'role', 'authenticated')::text, true);
          execute 'set local role authenticated';
        end if;

        execute format(
          'select count(*), md5(coalesce(string_agg(t.id::text, '','' order by t.id), '''')), '
          'case when count(*) <= %s then array_agg(t.id order by t.id) else null end '
          'from %I.%I t', p_id_cap, v_schema, v_table)
          into v_count, v_hash, v_ids;
        v_sampled := v_ids is null;

        execute 'reset role';
      exception
        when insufficient_privilege then
          begin execute 'reset role'; exception when others then null; end;
          -- A MEASUREMENT, not a failure: no SELECT grant means zero rows, and says so.
          v_count := 0; v_ids := '{}'::uuid[]; v_hash := md5(''); v_sampled := false;
          v_err := format('note: no SELECT grant for this role — zero rows by grant, not by policy (%s)', sqlerrm);
        when others then
          begin execute 'reset role'; exception when others then null; end;
          v_err := format('%s: %s', sqlstate, sqlerrm);
      end;

      insert into iam.access_delta_probe(
        run_id, principal_id, principal_label, token, schema_name, table_name,
        readable_count, id_hash, ids, sampled, error_text)
      values (v_run, v_principal, v_label, v_token, v_schema, v_table,
              v_count, v_hash, v_ids, v_sampled, v_err);
    end loop;
  end loop;

  update iam.access_delta_run set finished_at = now() where id = v_run;
  return v_run;
end
$function$;

revoke all on function iam.access_delta_snapshot(text, uuid[], text[], integer, text) from public, anon, authenticated;

-- The comparison must read the COUNT for a no-grant probe, not the note. `error_text` starting with
-- `note: ` is a reason, not a failure.
create or replace function iam.access_delta_compare(p_before uuid, p_after uuid)
returns table(
  token text, principal_id uuid, principal_label text,
  count_before bigint, count_after bigint,
  rows_lost integer, rows_gained integer,
  gained_sample uuid[], lost_sample uuid[],
  verdict text)
language sql
stable
as $function$
  with before_run as (select * from iam.access_delta_probe where run_id = p_before),
       after_run  as (select * from iam.access_delta_probe where run_id = p_after)
  select
    coalesce(b.token, a.token),
    coalesce(b.principal_id, a.principal_id),
    coalesce(b.principal_label, a.principal_label),
    b.readable_count, a.readable_count,
    case when b.ids is not null and a.ids is not null
         then cardinality(array(select unnest(b.ids) except select unnest(a.ids))) end,
    case when b.ids is not null and a.ids is not null
         then cardinality(array(select unnest(a.ids) except select unnest(b.ids))) end,
    case when b.ids is not null and a.ids is not null
         then (array(select unnest(a.ids) except select unnest(b.ids)))[1:20] end,
    case when b.ids is not null and a.ids is not null
         then (array(select unnest(b.ids) except select unnest(a.ids)))[1:20] end,
    case
      when b.run_id is null or a.run_id is null then 'UNMEASURED'
      when coalesce(b.error_text,'') not like 'note: %' and b.error_text is not null then 'UNMEASURED'
      when coalesce(a.error_text,'') not like 'note: %' and a.error_text is not null then 'UNMEASURED'
      when b.readable_count is null or a.readable_count is null then 'UNMEASURED'
      when b.ids is null or a.ids is null then
        case when a.readable_count > b.readable_count then 'WIDER'
             when a.readable_count < b.readable_count then 'NARROWER'
             when a.id_hash is distinct from b.id_hash then 'UNPROVEN'
             else 'SAME' end
      when exists (select unnest(a.ids) except select unnest(b.ids)) then 'WIDER'
      when exists (select unnest(b.ids) except select unnest(a.ids)) then 'NARROWER'
      else 'SAME'
    end
  from before_run b
  full join after_run a on a.token = b.token and a.principal_id = b.principal_id
  order by 1, 3;
$function$;

revoke all on function iam.access_delta_compare(uuid, uuid) from public, anon, authenticated;

-- Proven: the anon probe on a table anon cannot reach is now a measured zero, and a REAL error
-- still refuses.
do $$
declare v_a uuid; v_b uuid; v_n integer; v_caught boolean := false;
begin
  v_a := iam.access_delta_snapshot('dd137b2b proof A',
           array['00000000-0000-0000-0000-000000000000'::uuid], array['studio_recording_chunks']);
  select count(*) into v_n from iam.access_delta_probe
   where run_id = v_a and readable_count = 0 and error_text like 'note: no SELECT grant%';
  if v_n <> 1 then
    raise exception 'dd137b2b: the no-grant probe was not recorded as a measured zero';
  end if;
  v_b := iam.access_delta_snapshot('dd137b2b proof B',
           array['00000000-0000-0000-0000-000000000000'::uuid], array['studio_recording_chunks']);
  if iam.access_delta_assert_no_widening(v_a, v_b) not like '%GREEN%' then
    raise exception 'dd137b2b: a no-grant pair still refuses';
  end if;
  -- a REAL error must still refuse
  update iam.access_delta_probe set error_text = '57014: canceling statement due to statement timeout'
   where run_id = v_b;
  begin perform iam.access_delta_assert_no_widening(v_a, v_b);
  exception when insufficient_privilege then v_caught := true; end;
  if not v_caught then
    raise exception 'dd137b2b: a timed-out probe no longer refuses — every error but "no grant" must';
  end if;
  delete from iam.access_delta_run where id in (v_a, v_b);
  raise notice 'dd137b2b: no grant is a measured zero; every other error still refuses';
end $$;
