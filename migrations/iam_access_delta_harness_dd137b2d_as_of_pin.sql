-- iam_access_delta_harness_dd137b2d_as_of_pin — THE TWO SNAPSHOTS MUST COMPARE THE SAME ROWS.
--
-- Found running the DD-137b step 3 rehearsal a second time. The gate refused two pairs as WIDER:
--     coding_session | <platform admin> | 3266 -> 3106 | WIDER
--     conversation   | <platform admin> | 24573 -> 15061 | WIDER
-- Both counts went DOWN by hundreds or thousands, and both still contained at least one id the
-- before-set did not — because this is a LIVE database and rows were created in the sixty seconds
-- between the two snapshots. The regeneration did not hand anybody anything; time did.
--
-- The gate was right to refuse (a gained id is a gained id, and a harness that shrugs at one is
-- worthless), and the harness was asking the wrong question. The right question is:
--     of the rows that EXISTED WHEN WE STARTED, did any principal gain one?
-- So both snapshots are now pinned to the same instant: `created_at <= p_as_of`, with p_as_of
-- carried from the before-run into the after-run. A row born after the pin is in neither set.
--
-- 🚨 A TABLE WITH NO `created_at` CANNOT BE PINNED, and this file does not pretend otherwise. Those
-- probes record `sampled` with a note saying the pin could not be applied, and a concurrent insert
-- there will still read as WIDER and still refuse — the safe direction, loudly, with a message that
-- names the reason so the next person re-runs the pair instead of arguing with it.
create or replace function iam.access_delta_snapshot(
  p_label text,
  p_principals uuid[],
  p_tokens text[],
  p_id_cap integer default 20000,
  p_note text default null,
  p_as_of timestamptz default null
) returns uuid
language plpgsql
as $function$
declare
  v_run uuid;
  v_principal uuid;
  v_token text;
  v_schema text; v_table text;
  v_label text; v_has_id boolean; v_has_created boolean; v_pin text;
  v_count bigint; v_hash text; v_ids uuid[]; v_sampled boolean; v_err text;
  v_as_of timestamptz := coalesce(p_as_of, now());
  v_anon constant uuid := '00000000-0000-0000-0000-000000000000';
begin
  if p_principals is null or cardinality(p_principals) = 0 then
    raise exception 'access_delta_snapshot: no principals. A delta over nobody proves nothing.';
  end if;
  if p_tokens is null or cardinality(p_tokens) = 0 then
    raise exception 'access_delta_snapshot: no tokens. A delta over no tables proves nothing.';
  end if;

  insert into iam.access_delta_run(label, note, started_at)
  values (p_label, coalesce(p_note,'') || format(' [as_of %s]', v_as_of), v_as_of)
  returning id into v_run;

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
                      and column_name = 'id' and udt_name = 'uuid') into v_has_id;
    select exists (select 1 from information_schema.columns
                    where table_schema = v_schema and table_name = v_table
                      and column_name = 'created_at') into v_has_created;
    v_pin := case when v_has_created
                  then format(' where t.created_at <= %L::timestamptz', v_as_of) else '' end;

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
            'from %I.%I t%s', p_id_cap, v_schema, v_table, v_pin)
            into v_count, v_hash, v_ids;
          v_sampled := v_ids is null;
        else
          execute format(
            'select count(*), md5(coalesce(string_agg(t::text, '','' order by t::text), '''')) '
            'from %I.%I t%s', v_schema, v_table, v_pin)
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

      if not v_has_created and v_err is null then
        v_err := 'note: no created_at column — this pair could not be pinned to the run instant, so '
              || 'a row inserted between the two snapshots will read as a widening and refuse. '
              || 'Re-run the pair rather than waiving it.';
      end if;

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

revoke all on function iam.access_delta_snapshot(text, uuid[], text[], integer, text, timestamptz) from public, anon, authenticated;
drop function if exists iam.access_delta_snapshot(text, uuid[], text[], integer, text);

-- Proven: two snapshots pinned to the SAME instant over a table that is being written to compare
-- as unchanged, and the pin is recorded so nobody has to take it on trust.
do $$
declare v_a uuid; v_b uuid; v_as timestamptz; v_msg text; v_n integer;
begin
  v_as := now();
  v_a := iam.access_delta_snapshot('dd137b2d pin proof A',
           array['4cf62e4e-2679-484f-b652-034e697418df'::uuid], array['conversation'], 200000, null, v_as);
  v_b := iam.access_delta_snapshot('dd137b2d pin proof B',
           array['4cf62e4e-2679-484f-b652-034e697418df'::uuid], array['conversation'], 200000, null, v_as);
  v_msg := iam.access_delta_assert_no_widening(v_a, v_b);
  if v_msg not like '%GREEN%' then
    raise exception 'dd137b2d: a pinned pair over a live table still does not compare clean: %', v_msg;
  end if;
  select count(*) into v_n from iam.access_delta_run where id = v_a and note like '%as_of%';
  if v_n <> 1 then raise exception 'dd137b2d: the run does not record its pin'; end if;
  delete from iam.access_delta_run where id in (v_a, v_b);
  raise notice 'dd137b2d: %', v_msg;
end $$;
