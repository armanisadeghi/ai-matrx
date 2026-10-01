// SAFETY-NET-B · C02. A Data tables press row appears, in the press's own transaction, for an organization the readiness
// plan never named (Maxwell's Org: no older tables, neither test seat is in it). The chain's C02 must go RED:
// "the press switched 1 organizations that readiness did not plan". In-transaction: rolled back with the suite.
export default {
  id: "b-press-writes-outside-the-plan",
  check: "cutover.switch-chain",
  items: ["C02"],
  description: "a done older_tables press row for an organization outside the plan, dated inside the press's transaction",
  mode: "env", // spliced by probes/b_clone_suite.py right after the suite's first `begin`; rolled back with it
  env: { SN_B_PLANT_SQL: `insert into platform.cutover_seam_press (seam_key, organization_id, direction, outcome, says, pressed_by, did, note)
values ('older_tables', 'd3138341-5359-455e-8b27-70d538ec05f1', 'new', 'done', 'safety-net-b plant: a press the plan never named',
        '87a6e699-3622-4869-8843-d0867456c0dd', '{"safety_net_plant": true}'::jsonb, 'safety-net-b plant');` },
};
