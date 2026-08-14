-- udt_get_full_table_keep_and_probe.sql
--
-- Settles what `public.get_full_table(jsonb)` is FOR, and makes it impossible for
-- it to rot invisibly again. Companion to
-- udt_get_full_table_fix_column_ordering.sql (same day), which repaired the
-- 42803 that made every call fail.
--
-- ── THE DECISION: keep it. It is the only RPC that answers "what is in this
--    dataset, and how big is it?" WITHOUT loading the dataset. ───────────────
-- Measured against every sibling in the UDT read family:
--   * get_user_table_complete(uuid,text,text) — returns table + fields + EVERY
--     ROW, then derives row_count via jsonb_array_length of that array. No LIMIT
--     anywhere. Using it to learn a dataset's size means materializing the whole
--     dataset, so it is the wrong tool for a header, a column picker, a size
--     badge, or a "should I paginate this?" decision.
--   * list_table_columns(jsonb) — columns only. Never touches udt_dataset_rows,
--     has no count.
--   * get_user_tables() — the list-ALL-datasets view, not a single-dataset fetch.
-- get_full_table computes its count with COUNT(*) and returns no rows at all.
-- Nothing else covers that, so the capability is real and worth keeping even
-- though no caller exists today.
--
-- Its access model is sound and needs no hardening: SECURITY INVOKER + RLS,
-- which is this platform's stated enforcement boundary. Verified live — RLS is
-- enabled on workbench.udt_datasets (5 policies), udt_dataset_fields (4) and
-- udt_dataset_rows (4), so a caller sees only datasets they may see and the
-- function's own existence guard raises for anything else. Deliberately NOT
-- converted to SECURITY DEFINER + a hand-rolled permission check like its
-- sibling: that duplicates authorization logic outside the policy system.
--
-- ── THE ROOT CAUSE, which the fix alone did not address ─────────────────────
-- This function was broken on EVERY call and nobody noticed, because nothing
-- calls it and nothing executed it. `plpgsql_check` did flag it, but it was one
-- row in a 101-row pile that was ~97% false positives. A static checker plus a
-- human reading a noisy list is not a guarantee.
--
-- So it gets a registered runtime probe. `audit.refresh()` runs
-- `audit.run_function_runtime_probes()`, which EXECUTES every enabled probe and
-- records any failure as level='runtime_error' / severity='real' — the class the
-- admin surface shows by default. From now on the function is proven by
-- execution on every refresh, not by inspection.
--
-- The probe is read-only and self-verifying. It deliberately targets the dataset
-- with the MOST fields, because the bug lived in the aggregate-ordering path that
-- only runs when fields exist; a fieldless dataset would not have reproduced it.
-- It asserts the envelope shape too (columns is an array whose length equals the
-- real field count, table present, row_count numeric), so a silent shape
-- regression fails as loudly as a raise. Verified both directions before being
-- registered: it returns 1 against the repaired function, and it raises the
-- original `42803 column "tf.field_order" must appear in the GROUP BY clause`
-- when pointed at a twin carrying the pre-fix body.
--
-- Idempotent. Safe to re-run.

insert into audit.function_runtime_probe (function_signature, probe_sql, enabled, note)
values (
  'public.get_full_table(jsonb)',
  $probe$select case
  when (select count(*) from workbench.udt_dataset_fields) = 0 then 1
  else 1 / (case when (
      select jsonb_typeof(probe.res->'columns') = 'array'
         and probe.res->'table' is not null
         and jsonb_typeof(probe.res->'row_count') = 'number'
         and jsonb_array_length(probe.res->'columns') = probe.n
      from (
        select public.get_full_table(jsonb_build_object('table_id', tf.table_id)) as res,
               count(*)::int as n
        from workbench.udt_dataset_fields tf
        group by tf.table_id
        order by count(*) desc
        limit 1
      ) probe
    ) then 1 else 0 end)
  end$probe$,
  true,
  'Executes the RPC against the live dataset with the most fields and asserts the envelope shape. Guards the 42803 aggregate-ordering regression fixed 2026-08-13; that bug made every call fail while nothing noticed, because nothing calls this RPC. Read-only.'
)
on conflict (function_signature) do update
  set probe_sql = excluded.probe_sql,
      enabled   = excluded.enabled,
      note      = excluded.note;

-- Prove the probe is registered AND that a full refresh executes it green.
select audit.refresh();

do $assert$
declare v_enabled boolean; v_runtime_fail int; v_real int;
begin
  select enabled into v_enabled
  from audit.function_runtime_probe
  where function_signature = 'public.get_full_table(jsonb)';
  if v_enabled is not true then
    raise exception 'get_full_table probe is not registered/enabled.';
  end if;

  select count(*) into v_runtime_fail
  from audit.broken_functions
  where level = 'runtime_error' and signature like '%get_full_table%';
  if v_runtime_fail > 0 then
    raise exception 'The get_full_table probe FAILED during refresh — the RPC is broken again.';
  end if;

  -- The whole point of the day: the actionable number stays honest.
  select count(*) into v_real from audit.broken_functions where severity = 'real';
  if v_real <> 0 then
    raise exception 'Expected 0 real findings, found %.', v_real;
  end if;
end $assert$;
