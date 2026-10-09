// features/start/startPage.typed-table.ts — WHICH PAGE IS THIS PERSON'S START PAGE (v7 APPS-ON-DATA item 3).
//
// Arman's endgame (2026-10-02): one custom start page per person, built from their own data and platform
// features (pages hold applets; applets hold pages). The choice is one row per person, kept in a typed
// table the platform keeps for this feature — person scope, so only she sees her row. A person in several
// organizations may have a row in each; the newest choice wins.
import { defineTypedTable, f } from "@ai-matrx/records/typed-table";

export const startPageChoice = defineTypedTable({
  name: "Start page",
  slug: "start_page",
  kept_for: "start_page",
  scope: "person",
  key: "person",
  fields: {
    person: f.text({ label: "Person", unique: true, required: true }),
    page_id: f.text({ label: "Page", required: true }),
    chosen_at: f.datetime({ label: "Chosen" }),
  },
});
