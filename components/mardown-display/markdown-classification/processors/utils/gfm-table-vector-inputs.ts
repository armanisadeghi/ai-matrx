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
];
