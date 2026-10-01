// PLANT for sql.export-green (T34): the export door hands over only the first row of the suite's own
// throwaway organization (e5f00000-…-000001). In-transaction: spliced inside the suite's transaction
// and rolled back with it — nothing survives on the clone.
export default {
  id: "t2-export-drops-rows",
  check: "sql.export-green",
  items: ["T34"],
  description: "custom.io_export returns at most one row for the suite's throwaway organization (rolled back with the suite)",
  mode: "in-transaction",
  apply: `do $plant$
declare d text := pg_get_functiondef('custom.io_export'::regproc);
        d2 text;
begin
  d2 := replace(d, 'jsonb_agg(c.doc order by c.ord) from cells c',
                   'jsonb_agg(c.doc order by c.ord) from cells c where c.ord <= 1 or p_organization_id <> ''e5f00000-0000-4a00-8a00-000000000001''::uuid');
  if d2 = d then raise exception 'plant did not apply: the io_export body no longer has the expected line'; end if;
  execute d2;
end $plant$;`,
};
