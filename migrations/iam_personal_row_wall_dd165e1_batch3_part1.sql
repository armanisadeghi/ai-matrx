-- iam_personal_row_wall_dd165e1_batch3_part1 — REGENERATION BATCH 3 OF 4, PART 1 OF 3 (DD-165).
--
-- 🚨 WHY BATCH 3 IS THREE FILES AND THE OTHER THREE ARE NOT. dd165e ran 45 tables in one
-- transaction and lost `40P01 deadlock detected` on `runtime.operation_stream` TWICE in a row
-- against live traffic — the same table both times, so it is a hot table under constant write load
-- rather than a coincidence. The file did exactly what it was written to do: it refused to commit
-- 44 of 45 tables and rolled back. The answer is the one `ddl_lock_timeout_guard` prints on every
-- run — "commit per table — this bounds waiting, never holding" — taken one step further for the
-- batch that could not hold its locks: 15 tables per transaction instead of 45.
--
-- Each part is idempotent and re-runnable, in a fixed (schema, table) order. dd165g measures the END
-- state token by token, so a part that has not run yet is NAMED there rather than assumed.
-- The same closed set of structural refusals applies; anything else aborts this part by name.
set local lock_timeout = '30s';

do $$
declare
  r record; v_ok int := 0; v_refused int := 0;
  v_tokens text[] := array['iam_api_key','wc_claim','mandate_binding','mandate','provision','mandate_reference','mandate_scan','mandate_treatment','marketing_initiative','ops_proof_check','ops_proof_scenario','pdf_redaction_audit','plan_entity','plan_node','plan_profile'];
begin
  for r in select et.schema_name, et.table_name, et.token, et.rls_variant
             from platform.entity_types et
            where et.token = any(v_tokens) and et.is_active
              and to_regclass(format('%I.%I', et.schema_name, et.table_name)) is not null
            order by et.schema_name, et.table_name
  loop
    begin
      perform iam.apply_rls(r.schema_name, r.table_name, r.token, r.rls_variant);
      v_ok := v_ok + 1;
    exception when others then
      if sqlstate in ('P0001','42703','42883')
         and (sqlerrm like '%access machinery%'
              or sqlerrm like '%column "id" does not exist%'
              or sqlerrm like '%operator does not exist%'
              or sqlerrm like '%not an active registered entity%'
              or sqlerrm like '%has no composition parent%') then
        v_refused := v_refused + 1;
        raise notice 'dd165e1: % (%.%) keeps its bespoke policy — %',
          r.token, r.schema_name, r.table_name, sqlerrm;
      else
        raise exception 'dd165e1: % (%.%) failed with %: %. That is not a structural refusal, so '
          'this part refuses to commit partially. A 55P03 or 40P01 here is a lost race — re-run this '
          'file; it is idempotent.', r.token, r.schema_name, r.table_name, sqlstate, sqlerrm;
      end if;
    end;
  end loop;
  raise notice 'dd165e1: batch 3 part 1/3 — regenerated %, structurally refused %', v_ok, v_refused;
  if v_ok + v_refused < 15 then
    raise exception 'dd165e1: only % of 15 tokens were reached — a silent drop is exactly the '
      'shape of the omission this file exists to prevent', v_ok + v_refused;
  end if;
end $$;
