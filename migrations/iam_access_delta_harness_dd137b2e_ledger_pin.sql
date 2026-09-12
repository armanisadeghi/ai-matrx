-- iam_access_delta_harness_dd137b2e_ledger_pin — A LEDGER'S APPEND TIMESTAMP IS `occurred_at`.
--
-- The DD-137b13 gate REFUSED, and it was right to:
--     access_delta gate REFUSES: 2 (table, principal) pair(s) would WIDEN
--       activity / arman@armansadeghi.com: 213629 -> 213635
--       activity / info@aimatrx.com:       213628 -> 213635
-- `platform.activity_log` gained six rows between the two snapshots. Nobody was handed anything:
-- it is an append-only activity log and six things happened on the platform in the ten minutes
-- between them. DD-137b2d pins both snapshots to one instant with `created_at <= as_of` so exactly
-- this cannot happen — and `platform.activity_log` has no `created_at`. Its append timestamp is
-- `occurred_at`, which `iam.verify_canonical` has always known ("ledger append timestamp is
-- occurred_at (the history.row_versions shape)") and this harness did not.
--
-- The harness ANNOUNCED it rather than hiding it — every one of those 54 probes across 7 tokens
-- carries `note: no created_at column — this pair could not be pinned … Re-run the pair rather than
-- waiving it` — and the gate then refused on the count. That is the design working. It is still a
-- gap, and the fix is one line: pin on `created_at`, else `occurred_at`, else say so.
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
  v_label text; v_has_id boolean; v_pin_col text; v_pin text;
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

    -- THE PIN COLUMN. `created_at` on an entity; `occurred_at` on a ledger, which is the same fact
    -- under the name db-rules gives it for an append-only row (iam.verify_canonical: "ledger append
    -- timestamp is occurred_at"). Neither ⇒ no pin, and the probe says so in its own row.
    select column_name into v_pin_col
      from information_schema.columns
     where table_schema = v_schema and table_name = v_table
       and column_name in ('created_at','occurred_at')
     order by case column_name when 'created_at' then 0 else 1 end
     limit 1;
    v_pin := case when v_pin_col is not null
                  then format(' where t.%I <= %L::timestamptz', v_pin_col, v_as_of) else '' end;

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

      if v_pin_col is null and v_err is null then
        v_err := 'note: no created_at or occurred_at column — this pair could not be pinned to the '
              || 'run instant, so a row inserted between the two snapshots will read as a widening '
              || 'and refuse. Prove the token by its class and its emitted policy instead, or give '
              || 'the table a timestamp.';
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

-- Proven on the exact table that refused: two snapshots of `platform.activity_log` pinned to one
-- instant must compare clean while the log is being appended to.
do $$
declare v_a uuid; v_b uuid; v_as timestamptz := now(); v_msg text; v_n integer;
begin
  v_a := iam.access_delta_snapshot('dd137b2e pin proof A',
           array['6555aa73-c647-4ecf-8a96-b60e315b6b18'::uuid], array['activity'], 400000, null, v_as);
  v_b := iam.access_delta_snapshot('dd137b2e pin proof B',
           array['6555aa73-c647-4ecf-8a96-b60e315b6b18'::uuid], array['activity'], 400000, null, v_as);
  select count(*) into v_n from iam.access_delta_probe
   where run_id = v_a and error_text is not null;
  if v_n > 0 then
    raise exception 'dd137b2e: platform.activity_log still reports it cannot be pinned';
  end if;
  v_msg := iam.access_delta_assert_no_widening(v_a, v_b);
  if v_msg not like '%GREEN%' then
    raise exception 'dd137b2e: an append-only ledger pinned to one instant still does not compare clean: %', v_msg;
  end if;
  delete from iam.access_delta_run where id in (v_a, v_b);
  raise notice 'dd137b2e: %', v_msg;
end $$;
