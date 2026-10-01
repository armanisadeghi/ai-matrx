// PLANT for tables.walk-bulk (T35): the paged read door serves nothing past the first 100 rows of
// Cedar Ridge Physical Therapy (clone only). Committed, restored from the captured definition.
const CEDAR = "0a54df90-eab8-4d07-ab29-81a45fb41e04";
export default {
  id: "t2-read-paging-stops-at-100",
  check: "tables.walk-bulk",
  items: ["T35"],
  description: "custom.read_records answers an offset of 100 or more with no rows for Cedar Ridge Physical Therapy (clone only)",
  mode: "committed",
  captureRestore: "select pg_get_functiondef('custom.read_records'::regproc);",
  apply: `do $plant$
declare d text := pg_get_functiondef('custom.read_records'::regproc);
        d2 text;
        needle text := E'  p_limit := custom.page_size(p_organization_id, ''custom.read_records'', p_limit, 200);';
begin
  d2 := replace(d, needle, needle || E'\\n  if p_organization_id = ''${CEDAR}''::uuid and coalesce(p_offset,0) >= 100 then p_limit := 0; end if;');
  if d2 = d then raise exception 'plant did not apply: read_records body changed'; end if;
  execute d2;
end $plant$;`,
  restore: "",
  readback: `select (pg_get_functiondef('custom.read_records'::regproc) not like '%coalesce(p_offset,0) >= 100%')::text;`,
};
