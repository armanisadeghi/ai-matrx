// The shared drill door's definition of a custom Table silently loses its last Measure (the store's
// own definition keeps it). Inside the suite's rolled-back transaction: the live door is renamed
// aside and a wrapper drops one Measure. drillcustom_parity_green must go RED (PAR-1).
export default {
  id: "drill-custom-describe-drops-a-measure",
  check: "drill.sql-custom-parity",
  items: ["R01"],
  description: "platform.drill_describe drops a custom Table's last Measure (rolled back)",
  mode: "in-transaction",
  apply: `
alter function platform.drill_describe(uuid, jsonb) rename to drill_describe__sn_orig;
create function platform.drill_describe(p_org uuid, p_src jsonb) returns jsonb language sql as $f$
  select case when p_src->>'kind' = 'table'
              then jsonb_set(d, '{measures}', coalesce((d->'measures') - (-1), '[]'::jsonb))
              else d end
    from (select platform.drill_describe__sn_orig(p_org, p_src) d) x
$f$;
grant execute on function platform.drill_describe(uuid, jsonb) to authenticated;`,
};
