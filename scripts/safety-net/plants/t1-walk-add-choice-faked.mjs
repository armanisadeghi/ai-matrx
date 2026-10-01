// SN-T1 plant (2026-10-01): Add on the off-list ask answers ok without being sent (rpc/record_update_adding_choices), so the word never joins the list
// Planted at the network boundary of the walk's own test browser only (mode intercept): nothing on
// any server changes, so it runs on live and on the clone. The walk's JSON lists every interception.
export default {
  id: "t1-walk-add-choice-faked",
  check: "tables.walk-life",
  items: ["T23","T24"],
  description: "Add on the off-list ask answers ok without being sent (rpc/record_update_adding_choices), so the word never joins the list",
  mode: "intercept",
  rules: [{ match: "/rest/v1/rpc/record_update_adding_choices(\\?|$)", method: "POST", action: "fake-ok", body: "1" }],
};
