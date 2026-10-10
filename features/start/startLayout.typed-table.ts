// features/start/startLayout.typed-table.ts — THIS PERSON'S START PAGE LAYOUT (lane START-PAGE).
//
// One row per person (person scope: only she sees it), holding the whole `StartDoc` as JSON. Every write
// is a record version in the store, so the history panel lists, previews and restores layouts with no
// second store. Written in ONE home organization per person: the organization her row already lives in,
// else the organization new things are saved in; read across every organization, newest wins.
import { defineTypedTable, f } from "@ai-matrx/records/typed-table";

export const startLayoutTable = defineTypedTable({
  name: "Start layout",
  slug: "start_layout",
  kept_for: "start_page",
  scope: "person",
  key: "person",
  fields: {
    person: f.text({ label: "Person", unique: true, required: true }),
    doc: f.longText({ label: "Layout", required: true }),
    note: f.text({ label: "Note" }),
    saved_at: f.datetime({ label: "Saved" }),
  },
});
