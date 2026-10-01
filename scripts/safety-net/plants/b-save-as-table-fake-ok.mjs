// SAFETY-NET-B · A03–A05. The store's column door claims success without writing (this test browser only): the
// dialog's Make the table answers as if every column were declared, and nothing is. Each save must go RED on its
// columns ("MISSING Patient, Visit type …"). Safe on live and the clone: nothing on any server changes.
export default {
  id: "b-save-as-table-fake-ok",
  check: "agents.walk-save-as-table",
  items: ["A03", "A04", "A05"],
  description: "rpc/field_declare answers 200 without reaching the server in the test browser",
  mode: "intercept",
  rules: [{ match: "/rest/v1/rpc/field_declare", method: "POST", action: "fake-ok", body: "\"00000000-0000-4000-8000-000000000000\"" }],
};
