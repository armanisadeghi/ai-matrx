// INTERCEPT plant for tables.walk-bulk (T33, T32): the importer's row door answers 500 in the test
// browser. A CSV, an XLSX and every pasted block into an empty table must fail loudly: T32 and T33 RED (T30, T34, T35, T43 follow: nothing landed).
export default {
  id: "t2-walk-import-rows-refused",
  check: "tables.walk-bulk",
  items: ["T32", "T33"], // the walk then also fails T30, T34, T35, T43 (nothing landed to paste over, export, page or open),
  description: "io_import_rows answers 500 in the test browser (nothing on any server changes)",
  mode: "intercept",
  rules: [{ match: "/rest/v1/rpc/io_import_rows", method: "POST", action: "status", status: 500 }],
};
