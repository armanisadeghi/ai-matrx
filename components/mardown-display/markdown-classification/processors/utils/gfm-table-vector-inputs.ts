/**
 * The INPUTS of the shared GFM table vectors (verify-RC-B4 R5-3 / R5-2 twin).
 *
 `gfm-table-vectors.ts` runs THE TypeScript rule over these inputs; the test
 * `__tests__/gfm-table-vectors.test.ts` writes `__tests__/gfm-table-vectors.json`
 * (GFM_TABLE_VECTORS_WRITE=1) and fails when the rule and the JSON drift; aidream's Python block detector reads a byte-identical copy
 * (packages/matrx-ai/tests/fixtures/gfm_table_vectors.json) and must agree.
 *
 * Use case: a warehouse shift handover and a log-routing sheet an assistant
 * writes as tables — with and without edge pipes, with escaped pipes.
 */
const INTRO = "Here is tonight's handover for the Harbor warehouse.";
const OUTRO = "Omar signs off once bay B3 is re-scanned.";
const THREE = "Step | Task | Who\n--- | --- | ---\n1 | Drain the print queue | Tom\n2 | Swap the label printer | Ines";
const TWO = "Bay | Status\n:--- | ---:\nB3 | re-scan\nB4 | clear";
const ESCAPED = "Rule | Pattern\n--- | ---\nalerts | `err\\|warn`";
const PIPED = "| Rule | Pattern |\n| --- | --- |\n| alerts | `err\\|warn` |\n| audit | a \\| b |";

export const DOCUMENT_INPUTS: ReadonlyArray<{ name: string; text: string }> = [
  { name: "pipe-less, three columns", text: `${INTRO}\n\n${THREE}\n\n${OUTRO}` },
  { name: "pipe-less, two columns, aligned", text: `${INTRO}\n\n${TWO}\n\n${OUTRO}` },
  { name: "pipe-less, escaped pipe in code", text: `${INTRO}\n\n${ESCAPED}\n\n${OUTRO}` },
  { name: "pipe-less, right after a prose line", text: `${INTRO}\n${THREE}\n\n${OUTRO}` },
  { name: "pipe-less, table opens the message", text: `${TWO}\n\n${OUTRO}` },
  { name: "pipe-led table (unchanged rule)", text: `${INTRO}\n\n${PIPED}\n\n${OUTRO}` },
  {
    name: "a list item ends a pipe-less table (verify-RC-B4 R5-1 shape)",
    text: `${INTRO}\n\nStep | Task | Who\n--- | --- | ---\n1 | Drain the print queue | Tom\n- | Re-scan bay B3 | Omar\n\n${OUTRO}`,
  },
  { name: "prose with a pipe and no delimiter row", text: `${INTRO}\nUse a | b for either.\n\n${OUTRO}` },
  { name: "header wider than its delimiter row", text: `${INTRO}\n\nBay | Status | Crew\n--- | ---\nB3 | re-scan | Omar\n\n${OUTRO}` },
  { name: "list item with a pipe over a rule", text: `${INTRO}\n\n- keep a | b\n--- | ---\n\n${OUTRO}` },
  { name: "a 'delimiter' with no dashes is not a table", text: `${INTRO}\n\n| Bay | Status |\n| | |\n| B3 | re-scan |\n\n${OUTRO}` },
  { name: "a pipe-less row continues a pipe-led table", text: `${INTRO}\n\n| Bay | Status |\n| --- | --- |\nB3 | re-scan\n\n${OUTRO}` },
  // GFM spec example 202 (verify-RC-B4 R7-2): a line without a pipe is a row; a quote line ends the table.
  { name: "a line without a pipe continues the table (GFM 202)", text: `${INTRO}\n\n| Bay | Status |\n| --- | --- |\n| B3 | re-scan |\nB4 clear\n\n${OUTRO}` },
  { name: "a quote line ends a pipe-less table", text: `${INTRO}\n\nZone | Temp\n--- | ---\nA | 4C\n> 8C | alarm\n\n${OUTRO}` },
  // verify-RC-B4 round 8: a backtick run whose info string holds a backtick is a code span, not a fence (CommonMark 4.5).
  { name: "a four-backtick code span row continues the table", text: `${INTRO}\n\nStep | Task\n--- | ---\n1 | Drain the queue\n${"````"} code ${"````"} | b\n\n${OUTRO}` },
  // verify-RC-B4 round 9: an HTML block start (CommonMark 4.6, conditions 2, 6, 7) and indented code end a table.
  { name: "an HTML comment ends the table", text: `${INTRO}\n\n| Bay | Status |\n| --- | --- |\n| B3 | re-scan |\n<!-- shift note -->\n\n${OUTRO}` },
  { name: "a block tag ends the table", text: `${INTRO}\n\n| Bay | Status |\n| --- | --- |\n| B3 | re-scan |\n</details>\n\n${OUTRO}` },
  { name: "a closing tag alone on its line ends the table", text: `${INTRO}\n\n| Bay | Status |\n| --- | --- |\n| B3 | re-scan |\n</artifact>\n\n${OUTRO}` },
  { name: "a tag with text after it is a row", text: `${INTRO}\n\n| Bay | Status |\n| --- | --- |\n| B3 | re-scan |\n<span>B4</span> clear\n\n${OUTRO}` },
  { name: "an indented line ends the table", text: `${INTRO}\n\n| Bay | Status |\n| --- | --- |\n| B3 | re-scan |\n    B4 clear\n\n${OUTRO}` },
  { name: "a pipe-led header wider than its delimiter is no table", text: `${INTRO}\n\n| Bay | Status |\n|---|\n| B3 | re-scan |\n\n${OUTRO}` },
  { name: "a header with no pipe over |---| is a one-column table", text: `${INTRO}\n\nNotes\n|---|\nDock B closed\n\n${OUTRO}` },
  { name: "a table under a list item's text is that item's text", text: `${INTRO}\n\n- Dock B is closed tonight\n| Bay | Status |\n| --- | --- |\n| B3 | re-scan |\n\n${OUTRO}` },
];

export const ROW_INPUTS: readonly string[] = [
  "a | b",
  "| a | b |",
  "| a \\| b | c |",
  "| `x\\|y` | z |",
  "a \\\\| b",
  "a \\\\\\| b | c",
  "|x|",
  "| a | b",
  "--- | :-: | --:",
  "",
  "|",
  "| | |",
];

export const CELL_INPUTS: readonly string[] = [
  "`err\\|warn`",
  "a \\| b",
  "plain",
  "\\\\\\|",
  "`a \\| b` and err\\|warn",
];

export const TABLE_INPUTS: readonly string[] = [
  THREE,
  TWO,
  ESCAPED,
  PIPED,
  "Bay | Status\n--- | ---\n | \nB4 | clear",
  "| Bay | Status |\n| | |\n| B3 | re-scan |",
  // verify-RC-B4 round 9: a trailing lone `|` is an empty row GFM shows, not dropped.
  "| Bay | Status |\n| --- | --- |\n| B3 | re-scan |\n |",
];

/**
 * Where a table ENDS (verify-RC-B4 round 9): every CommonMark 4.6 HTML block start
 * condition, indented code (4+ columns past the table's container, list items
 * included), and the near-misses GFM keeps as rows. `findTableEnd` over each; the
 * frontend test judges every one against an independent GFM parser (remark-gfm).
 */
const HANDOVER = ["| Bay | Status |", "| --- | --- |", "| B3 | re-scan |"];
const after = (line: string) => ({ lines: [...HANDOVER, line, "Omar signs off."], start: 0 });
export const TABLE_END_INPUTS: ReadonlyArray<{ lines: string[]; start: number }> = [
  after("<script>"), // 1
  after("<PRE"), // 1, end of line
  after("<textarea>notes"), // 1, text after
  after("<!-- shift note -->"), // 2
  after("<?php echo 1 ?>"), // 3
  after("<!DOCTYPE html>"), // 4
  after("<!-x | b"), // not 4: no letter after <!
  after("<![CDATA[ raw ]]>"), // 5
  after("<![CDATA | b"), // not 5
  after("<div>"), // 6
  after("</details>"), // 6
  after("<div>moved to B4"), // 6, text after
  after("   <section>"), // 6, 3 spaces
  after("</artifact>"), // 7
  after("<artifact id=\"1\">"), // 7
  after("<br />"), // 7
  after("<a :b>"), // 7
  after("<span>B4</span> clear"), // not 7: text after the tag
  after("<a b=>"), // not 7: no attribute value
  after("<x:y>"), // not 7: a colon in the name
  after("    | B4 | clear |"), // indented code
  after("\t| B4 | clear |"), // a tab
  after(" \t B4"), // a space then a tab
  after("   | B4 | clear |"), // 3 spaces: a row
  after("|"), // a lone pipe: an empty row
  { lines: ["- item", "", "    | a | b |", "    |---|---|", "    | 1 | 2 |", "    | 3 | 4 |"], start: 2 },
  { lines: ["- item", "", "    | a | b |", "    |---|---|", "    | 1 | 2 |", "      | 3 | 4 |"], start: 2 },
  { lines: ["- item", "  | a | b |", "  |---|---|", "  | 1 | 2 |", "    | 3 | 4 |"], start: 1 },
  { lines: ["1. item", "   - sub", "", "     | a | b |", "     |---|---|", "     | 1 | 2 |", "         | 3 | 4 |"], start: 3 },
  { lines: ["  | a | b |", "  |---|---|", "  | 1 | 2 |", "    | 3 | 4 |"], start: 0 },
];

/**
 * Where a table can OPEN (verify-RC-B4 round 9): a header line that lazily continues
 * a list item's or a quote's paragraph is paragraph text, never a table. The table
 * candidate is the last three lines; the frontend test judges each against remark-gfm.
 */
const ROWS = ["| Bay | Status |", "|---|---|", "| B3 | re-scan |"];
const under = (...above: string[]) => [...above, ...ROWS];
const nested = (by: string, ...above: string[]) => [...above, ...ROWS.map((row) => by + row)];
export const TABLE_START_INPUTS: ReadonlyArray<string[]> = [
  under("- Dock B is closed tonight"),
  under("- Dock B is closed tonight", ""),
  under("- Dock B is closed tonight", "  and reopens at six"),
  nested("  ", "- Dock B is closed tonight"),
  under("1. Drain the print queue"),
  nested("  ", "1. Drain the print queue"),
  nested("   ", "1. Drain the print queue"),
  under("> Omar signs off"),
  under("> Omar signs off", ""),
  under("- Dock B is closed tonight", "# Bays"),
  under("- Dock B is closed tonight", "---"),
  under("- Docks", "  - B is closed"),
  under("Tonight's bays:"),
  under("- Dock B", "", "  closed until six"),
  under("-"),
];

/** Where a table can open at the FIRST line (header + delimiter as GFM pairs them). */
export const TABLE_OPEN_INPUTS: ReadonlyArray<string[]> = [
  ["Notes", "|---|", "Dock B closed"], // no pipe in the header: a one-column table
  ["| Notes", "| -", "| Dock B closed"], // one pipe
  ["| Bay | Status |", "|---|", "| B3 | re-scan |"], // header wider than its delimiter
  ["| Bay |", "|---|---|", "| B3 |"], // header narrower than its delimiter
  ["| Bay | Status |", "- | -", "| B3 | re-scan |"], // a list item is no delimiter
  ["Bay | Status", "- | -", "B3 | re-scan"],
  ["Bay | Status", "-|-", "B3 | re-scan"], // no space after the dash: a delimiter
  ["    | Bay | Status |", "    |---|---|", "    | B3 | re-scan |"], // indented code
];
