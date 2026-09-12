-- iam_access_delta_harness_dd137b2c_no_id_column — A TABLE WITH NO `id` COLUMN IS STILL MEASURABLE.
--
-- Found running the DD-137b step 3 rehearsal: the gate refused 24 pairs as UNMEASURED, and all 24
-- were four tokens — `industry_curator`, `user_analysis_preference`, `user_form_profile`,
-- `user_preference` — whose tables have no `id` column at all. The probe selected `t.id` and died
-- with 42703. Those four are among F-7's eleven bespoke owner-only tokens, which is not a
-- coincidence: they are bespoke precisely BECAUSE they do not have the canonical shape.
--
-- The gate was right to refuse (an unmeasured pair is not a pass), and the harness was wrong to be
-- unable to measure them. A table with no `id` column still has rows, and "which rows can this
-- person read" is still answerable — by the row values themselves instead of by an id set. So the
-- probe now falls back to counting rows and hashing their text, records `sampled = true`, and the
-- comparison reads it exactly as it reads any over-cap table: a changed count is WIDER or NARROWER,
-- a changed hash at an unchanged count is UNPROVEN and still refuses.
--
-- 🚨 The fallback is chosen by the CATALOGUE, never by catching the error. Reading a 42703 as
-- "probably no id column" would also swallow a typo in this function's own SQL.
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
  v_label text; v_has_id boolean;
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

    select exists (select 1 from information_schema.columns
                    where table_schema = v_schema and table_name = v_table
                      and column_name = 'id' and udt_name = 'uuid')
      into v_has_id;

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

        if v_has_id then
          execute format(
            'select count(*), md5(coalesce(string_agg(t.id::text, '','' order by t.id), '''')), '
            'case when count(*) <= %s then array_agg(t.id order by t.id) else null end '
            'from %I.%I t', p_id_cap, v_schema, v_table)
            into v_count, v_hash, v_ids;
          v_sampled := v_ids is null;
        else
          -- No uuid `id`: the rows are their own identity. Count and hash them by value.
          execute format(
            'select count(*), md5(coalesce(string_agg(t::text, '','' order by t::text), '''')) '
            'from %I.%I t', v_schema, v_table)
            into v_count, v_hash;
          v_ids := null; v_sampled := true;
        end if;

        execute 'reset role';
      exception
        when insufficient_privilege then
          begin execute 'reset role'; exception when others then null; end;
          v_count := 0; v_ids := case when v_has_id then '{}'::uuid[] end;
          v_hash := md5(''); v_sampled := not v_has_id;
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

do $$
declare v_a uuid; v_n integer;
begin
  v_a := iam.access_delta_snapshot('dd137b2c proof',
           array['34ed4fc3-c527-4819-99bf-15c26603b261'::uuid],
           array['user_preference','user_form_profile','industry_curator','user_analysis_preference']);
  select count(*) into v_n from iam.access_delta_probe
   where run_id = v_a and error_text is not null;
  if v_n > 0 then
    raise exception 'dd137b2c: % of the four id-less tables still cannot be measured', v_n;
  end if;
  select count(*) into v_n from iam.access_delta_probe
   where run_id = v_a and readable_count is not null and sampled;
  if v_n <> 4 then
    raise exception 'dd137b2c: expected four measured-by-value probes, got %', v_n;
  end if;
  delete from iam.access_delta_run where id = v_a;
  raise notice 'dd137b2c: the four id-less bespoke tables are measurable by value';
end $$;
