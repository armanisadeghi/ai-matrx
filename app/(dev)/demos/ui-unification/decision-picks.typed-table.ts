// The decision board's picks, kept in the record store (scope: person) instead of localStorage.
// Declared once; the table is made on first use. Imports only @ai-matrx/records/typed-table.
import { defineTypedTable, f } from "@ai-matrx/records/typed-table";

export const uiDecisionPicks = defineTypedTable({
  name: "UI decision picks",
  slug: "ui_decision_picks",
  kept_for: "decisions",
  scope: "person",
  owner: "lane:PLATFORM-APP-DATA",
  key: "decision_id",
  fields: {
    decision_id: f.text({ label: "Decision", unique: true, required: true }),
    winner: f.text({ label: "Winner" }),
    note: f.longText({ label: "Note" }),
  },
  // Graduated 2026-10-07: the rows live in ui.decision_pick (entity:ui_decision_pick); the store copies are archived.
  graduatedTo: { token: "ui.decision_pick", map: { decision_id: "decision_id", winner: "winner", note: "note" } },
});
