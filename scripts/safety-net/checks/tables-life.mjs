// Sub-registry of area "tables" (tables-life) — lane SN-T1 (2026-10-01): the table and its columns,
// items T01–T29. Entries: see ../checks.mjs and common-docs v5/SAFETY-NET-LANE-BRIEF.md.
const sql = (name, items, extra = {}) => ({
  id: `tables.sql-${name}`,
  area: "tables",
  kind: "sql",
  file: `scripts/campaign-tests/${name}.sql`,
  items,
  targets: ["clone"],
  ...extra,
});

export default [
  sql("databasics2_a_choice_changed_keeps_its_words", ["T26"]),
  sql("databasics2_a_choice_column_keeps_its_list", ["T26", "T03", "T04"]),
  // databasics2_a_column_default_fills_a_new_record is NOT registered: it fails on the clone today at
  // step F ("Pending" cannot be the default for "Visit fee") — a later ruling refuses a misfitting
  // default, so the suite is stale (2026-10-01 run clone-0137-t1-sql-green).
  sql("databasics2_a_default_fits_its_column", ["T25"]),
  sql("databasics2_a_list_of_words_becomes_several_choices", ["T26"]),
  sql("databasics2_a_retype_goes_through_the_column_door", ["T26"]),
  sql("databasics2_a_value_set_aside_comes_back", ["T26", "T29"]),
  sql("databasics2_an_archive_under_way_says_so", ["T03"]),
  sql("databasics_a_new_column_never_takes_a_key_another_column_holds", ["T05", "T07"]),
  sql("databasics_a_retired_column_row_can_still_be_written", ["T07"]),
  sql("databasics_two_columns_never_carry_the_same_name", ["T05", "T06"]),
  sql("choicecolumnedit_green", ["T09", "T23"]),
  sql("choicecolumnedit_b_green", ["T05", "T23"]),
  sql("checkbox_green", ["T16"]),
  sql("choiceval_green", ["T17", "T18"]),
  sql("choicetails_green", ["T09", "T29"]),
];
