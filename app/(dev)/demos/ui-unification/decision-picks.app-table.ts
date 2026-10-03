// The decision board's picks, kept in the record store (scope: person) instead of localStorage.
// Declared once; the table is made on first use. Imports only @ai-matrx/records/app-table.
import { defineAppTable, f } from "@ai-matrx/records/app-table";

export const uiDecisionPicks = defineAppTable({
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
});
