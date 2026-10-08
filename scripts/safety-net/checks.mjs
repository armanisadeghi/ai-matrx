// scripts/safety-net/checks.mjs — the coverage items (NIGHT-PLAN-2026-10-01 §4, one id each, nothing
// left out) and the registry of checks that prove them. Each area keeps its own checks file under
// ./checks/ so two lanes never edit one file. The coverage table with owners, proven-red evidence and
// the live before/after slots is common-docs/projects/data-doctrine-adoption/v5/SAFETY-NET-COVERAGE.md.
import tables from "./checks/tables.mjs";
import lists from "./checks/lists.mjs";
import scopes from "./checks/scopes.mjs";
import datahome from "./checks/datahome.mjs";
import agents from "./checks/agents.mjs";
import agentsA12 from "./checks/agents-a12.mjs";
import drill from "./checks/drill.mjs";
import cutover from "./checks/cutover.mjs";
import platform from "./checks/platform.mjs";
import query from "./checks/query.mjs";
import forms from "./checks/forms.mjs";
import customFields from "./checks/custom-fields.mjs";
import external from "./checks/external.mjs";

export const ITEMS = {
  // Tables
  T01: "Create a table",
  T02: "Rename a table",
  T03: "Archive a table",
  T04: "Restore a table",
  T05: "Add a column",
  T06: "Rename a column",
  T07: "Retire a column",
  T08: "Reorder columns",
  T09: "Recolor a column / choice",
  T10: "Edit a text cell",
  T11: "Edit a number cell",
  T12: "Edit a currency cell",
  T13: "Edit a percent cell",
  T14: "Edit a date cell",
  T15: "Edit a datetime cell",
  T16: "Edit a checkbox cell",
  T17: "Edit a choice cell",
  T18: "Edit a multi-choice cell",
  T19: "Edit a relation cell",
  T20: "Edit a multi-reference cell",
  T21: "Edit a file cell",
  T22: "Edit a kind / directive cell",
  T23: "Enum ASK — single choice (off-list word offered, kept or added)",
  T24: "Enum ASK — multi choice",
  T25: "Default values fill a new record",
  T26: "Type change with data keeps / sets aside values",
  T27: "Sort and filter persist after an edit",
  T28: "Click-off blur saves the cell",
  T29: "Undo",
  T30: "Paste into the grid",
  T31: "Paste into the sheet",
  T32: "Paste into an empty table (owner and editor)",
  T33: "Import (CSV / XLSX)",
  T34: "Export (CSV / JSON / XLSX)",
  T35: "300-row paging",
  T36: "Grid view",
  T37: "Sheet view",
  T38: "Board view incl. drag",
  T39: "Calendar view",
  T40: "Gallery view (all records reachable)",
  T41: "Make it work (a view asks for its field and makes it)",
  T42: "Ask AI → approval card",
  T43: "Record panel",
  T44: "Share — owner",
  T45: "Share — editor",
  T46: "Share — viewer (read-only)",
  T47: "Trash restore — tables",
  T48: "Trash restore — records",
  T49: "Trash restore — views",
  T50: "Trash restore — fields",
  T51: "Trash restore — rules",
  T52: "Trash restore — links",
  T53: "Trash restore — templates",
  T54: "Trash restore — dashboards",
  T55: "Trash restore — mandates",
  T56: "Trash restore — meetings",
  T57: "Trash restore — terms",
  T58: "Record history",
  T59: "Keys never shown to a person",
  // Lists / pick lists
  L01: "Lists read the store only",
  L02: "Choice columns bound to a list",
  L03: "Agents' picklist tool",
  // Scopes / context
  S01: "Scope type create / edit / archive via the doors",
  S02: "Scope create / edit / archive via the doors",
  S03: "Context item create / edit / archive via the doors",
  S04: "Scope templates",
  S05: "Scope tags in chat",
  S06: "Scope tags on tasks",
  S07: "Scope tags on notes",
  S08: "Scope tags on projects",
  S09: "Context inspector byte parity",
  S10: "Agent hand-off identical (old vs store)",
  S11: "Member visibility — shared-only organizations",
  S12: "Member visibility — archived organizations",
  S13: "Member visibility — creator who is not a member",
  S14: "Member visibility — restricted field",
  S15: "Class checkout",
  S16: "Education functions",
  // Data home
  D01: "Data home — all lanes (All, Mine, My team, My Orgs, Shared, Public, System)",
  D02: "Data home — organization filter (URL only, All on every visit)",
  D03: "Data home — search",
  D04: "Data home — kinds",
  D05: "Data home — saved views",
  D06: "Data home — New table carries the active organization",
  // Agents / API / MCP
  A01: "Variables picker — cross-org binding + Run",
  A02: "Agents' dataset tool",
  A03: "Save as table — from chat",
  A04: "Save as table — from notes",
  A05: "Save as table — from a selection",
  A06: "REST v1 + personal key",
  A07: "AI Matrx MCP via personal key",
  A08: "AI Matrx MCP via OAuth",
  A09: "Member refusals (API / MCP)",
  A10: "Idempotency (API / MCP writes)",
  A12: "Dataset tool writes one row into a custom table, changes it, and reads it back (real agent run)",
  A11: "Same before/after the press — switching org + switched control (SAFETY-NET-B)",
  // Drill-down
  R01: "drill_describe — both kinds",
  R02: "drill_ask — both kinds",
  R03: "drill_rows — both kinds",
  R04: "Usage page — 12 URLs",
  R05: "Drill leakage test",
  // Cutover mechanics (store only since the switch's soak; the press, undo and Copy again items retired with them)
  C04: "No older write door answers a signed-in caller (gone, closed, or refusing)",
  C05: "The older tables live only in deprecated, out of every client's reach",
  C07: "Old systems unreachable (guard)",
  C08: "Context follow backlog 0",
  C10: "Personal-key policy file freezes sign-in under 100 ms (SAFETY-NET-B)",
  C11: "Rolling release stopped during the hour (SAFETY-NET-B)",
  C12: "Rollback path per step, with the exact command (SAFETY-NET-B)",
  // Platform
  P01: "Sign-in",
  P02: "Organization switch",
  P03: "No 500s",
  P04: "No console errors",
  P05: "Mobile 390 — light",
  P06: "Mobile 390 — dark",
  P07: "Performance — data home < 1 s",
  P08: "Performance — table page first paint",
  P09: "Performance — scope tree",
  // Query correctness (lane 5 VISION-REACH): each answered by the aggregate door AND by the chat's records tool
  Q01: "Query — sum across all rows (a formula column; the $640 / $1,440 case)",
  Q02: "Query — count by status",
  Q03: "Query — filter + sum",
  Q04: "Query — as of an earlier moment",
  Q05: "Query — roll-up across a relation",
  Q06: "Query — empty result",
  Q07: "Query — a hidden (restricted) field",
  Q08: "Query — a member-invisible row stays out",
  Q09: "Query — group by date",
  Q10: "Query — top 5 by a measure",
  Q11: "Query — roll-up for named related records (related_to)",
  Q12: "Query — a cut group list says it is cut",
  Q13: "Query — the roll-up door refuses rather than answer 0 from a walk that missed the field",
  Q14: "Query — REST v1 answers the questions exactly with a personal key",
  Q15: "Query — the AI Matrx MCP answers the questions exactly",
  Q16: "Query — an \"Only me\" row is listed and counted for nobody else, every door (plain / confidential / restricted table)",
  Q17: "Query — a related row named by its name is measured (never a silent 0), tool / REST / MCP",
  Q18: "Query — groups of a relation column carry each related row's name, tool / REST",
  // Public form (lane MAKE-HOME W5, guard G4): a stranger's form fits a phone and its answer boxes fill the column
  F01: "Public form at 390 — no sideways scroll, every answer box ≥ 80% of the column, title and box on one edge",
  F02: "Public form at 1280 — every answer box ≥ 80% of the column, title and box on one edge",
  // Custom fields (lane 7 W5)
  CF01: "Every declared record view shows its custom-fields section (or says why not)",
  // Connect a database (lane 5 VISION-REACH W3): a table synced from an outside Postgres
  EXT01: "External — an outside table connects through the server and lands as a Synced table; Refresh finds every row again",
  EXT02: "External — the read-only promise from the client channel: edit, new row, delete and a client-sent sync are refused in one sentence; our own column on a synced row is written",
  EXT03: "External — a relation points at the synced table and links a row",
  EXT04: "External — a person with no share meets the synced table nowhere (data home, search, pickers, rows, REST v1, MCP)",
  EXT05: "External — control: the owner reads every row through REST v1 and the MCP",
  EXT06: "External — the connection string is in no response body",
  EXT07: "External — no-secret-to-client: the server's guard (connection string absent from every response, header, diagnostic and log line)",
};

export const CHECKS = [...tables, ...lists, ...scopes, ...datahome, ...agents, ...agentsA12, ...drill, ...cutover, ...platform, ...query, ...forms, ...customFields, ...external];

for (const c of CHECKS) for (const id of c.items) if (!ITEMS[id]) throw new Error(`check ${c.id} names unknown item ${id}`);
const ids = new Set();
for (const c of CHECKS) {
  if (ids.has(c.id)) throw new Error(`duplicate check id ${c.id}`);
  ids.add(c.id);
}
