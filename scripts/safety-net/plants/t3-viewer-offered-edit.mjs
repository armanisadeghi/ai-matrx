// SN-T3 intercept plant (the test browser's own network boundary only; nothing on any server changes).
export default {
  id: "t3-viewer-offered-edit",
  check: "tables.walk-views-share",
  items: ["T46"],
  description: "the levels the page reads for a Viewer say editor (my_levels and each row), so edit controls are drawn for a read-only person",
  mode: "intercept",
  rules: [
    { match: "/rest/v1/rpc/my_levels", action: "rewrite", from: '"level":"viewer"', to: '"level":"editor"' },
    { match: "/rest/v1/rpc/read_records_page", action: "rewrite", from: '"level": "viewer"', to: '"level": "editor"' },
  ],
};
