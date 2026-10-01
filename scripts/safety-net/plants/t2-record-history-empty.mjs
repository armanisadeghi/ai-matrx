// PLANT for tables.walk-bulk (T58): the record history door answers nothing for Cedar Ridge Physical
// Therapy (clone only). Committed, restored from the function's own captured definition, read back.
const CEDAR = "0a54df90-eab8-4d07-ab29-81a45fb41e04";
export default {
  id: "t2-record-history-empty",
  check: "tables.walk-bulk",
  items: ["T58"],
  description: "custom.record_history returns no versions for Cedar Ridge Physical Therapy (clone only)",
  mode: "committed",
  captureRestore: "select pg_get_functiondef('custom.record_history'::regproc);",
  apply: `do $plant$
declare d text := pg_get_functiondef('custom.record_history'::regproc);
        d2 text;
begin
  d2 := replace(d, 'offset greatest(0, coalesce(p_offset, 0));',
                   'offset greatest(0, coalesce(p_offset, 0)) + case when p_organization_id = ''${CEDAR}''::uuid then 1000000 else 0 end;');
  if d2 = d then raise exception 'plant did not apply: record_history body changed'; end if;
  execute d2;
end $plant$;`,
  restore: "",
  readback: `select (pg_get_functiondef('custom.record_history'::regproc) not like '%1000000%')::text;`,
};
