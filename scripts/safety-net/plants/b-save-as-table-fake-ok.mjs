// SAFETY-NET-B · A03–A05. The store's row-import door claims success without writing (this test browser only): the
// dialog's Make the table makes the table and its columns, then the rows "land" and none is written. Each save must go
// RED on its deciding marker ("marker row ABSENT"). Safe on live and the clone: nothing on any server changes.
// (First version faked rpc/field_declare and was MISSED — the dialog declares its columns through another door; the
// ledger row says so. This one aims at the rows, the end of the chain.)
export default {
  id: "b-save-as-table-fake-ok",
  check: "agents.walk-save-as-table",
  items: ["A03", "A04", "A05"],
  description: "rpc/io_import_rows answers 200 without reaching the server in the test browser",
  mode: "intercept",
  rules: [{ match: "/rest/v1/rpc/io_import_rows", method: "POST", action: "fake-ok", body: "{\"ok\": true, \"written\": 0}" }],
};
