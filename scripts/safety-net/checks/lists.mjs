// Checks for area "lists" — lane SN-DH (2026-10-01), items L01–L03.
// Each: { id, area, kind: "walk"|"sql"|"cmd", file|cmd/args, items: [ids], targets: ["live","clone"], liveReadOnly? }
export default [
  // L01: a switched organization's lists are read from the store (where_lists_live says `record`), a new list is
  // born there, no older list/table can be made, and the server's two views (read by the agents' picklist tool,
  // the picklist REST router and the variable resolver) answer the same.
  {
    id: "lists.sql-after-switch",
    area: "lists",
    kind: "sql",
    file: "scripts/campaign-tests/listsstore_the_servers_list_views_answer_the_store.sql",
    passWhen: "LISTS STORE GREEN",
    items: ["L01", "L03"],
    targets: ["clone"],
  },
  // L01: a new picklist is platform-owned, for the choices (custom.table_placement; the tables list keeps it aside).
  {
    id: "lists.sql-new-picklist-kept",
    area: "lists",
    kind: "sql",
    file: "scripts/campaign-tests/handover_a_new_picklist_is_kept_with_the_choices.sql",
    items: ["L01"],
    targets: ["clone"],
  },
  // NOT REGISTERED: listsindex_the_lists_page_reads_one_store_door.sql passes on the 2026-10-01 clone but is
  // VACUOUS there (admin's Workspace keeps 0 store pick lists, so a planted "drop every store list" still passes
  // clause A: "0 store lists, counts right"). A guard that cannot be shown failing is not a guard.
  // A pick list made in Cedar Ridge, read on /pick-lists and its own page, bound to a table's Visit type column
  // (its chips are the list's words), a word added to the list reaches the column.
  {
    id: "lists.walk-lists",
    area: "lists",
    kind: "walk",
    file: "scripts/safety-net/walks/lists.mjs",
    walkName: "lists",
    items: ["L01", "L02"],
    targets: ["live", "clone"],
  },
];
