// PLANT for sql.history-screens (T58): custom.record_history answers no versions at all. In-transaction:
// spliced inside the suite's own transaction and rolled back with it.
export default {
  id: "t2-history-door-empty",
  check: "sql.history-screens",
  items: ["T58"],
  description: "custom.record_history returns no versions (rolled back with the suite)",
  mode: "in-transaction",
  apply: `do $plant$
declare d text := pg_get_functiondef('custom.record_history'::regproc);
        d2 text;
begin
  d2 := replace(d, 'offset greatest(0, coalesce(p_offset, 0));', 'offset greatest(0, coalesce(p_offset, 0)) + 1000000;');
  if d2 = d then raise exception 'plant did not apply: record_history body changed'; end if;
  execute d2;
end $plant$;`,
};
