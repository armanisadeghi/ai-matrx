/**
 * @jest-environment node
 */
/**
 * A VALUE READ FROM THE STORE LANDS IN THE SAME CELL THE OLD SCREEN READ, FOR EVERY KIND
 * (lane SCOPES-READ-SWITCH-VALIDATE, 2026-09-30).
 *
 * The read-switch validation compared every value of every scope on the dev clone, old path against
 * store path, from admin@admin.com's and test@test.com's seats. Two value kinds came back wrong:
 *
 *  1. An item the store landed AS TEXT (`carried.as_text`, the old word kept in `carried.value_type`)
 *     — e.g. an Engagement's "Known defects" cell holding a `directive_v1_reference_table` fence, or a
 *     team's "Team members" fence naming people the store has no Record for. The carried word
 *     ("reference") sent the value into the reference branch, which found no uuid in a fence string,
 *     and the cell came back EMPTY: the screen showed nothing where the old one showed the chips.
 *  3. A File column's reference came back as the File RECORD's id; the old fence (and every file chip)
 *     names the FILE. The door now answers `files` (record → file) and the adapter writes `file_id`.
 *  2. A reference to a row outside the scope system (a workbook, a note, a site, a brand) carries its
 *     label inside the store's element; the adapter dropped it, so the chip lost its name.
 *
 * Every other kind is pinned here too (date, datetime, a free-text "datetime", number, currency,
 * boolean, time, object, list, email, markdown, a scope reference, a file reference), so a later
 * change to the kind map cannot quietly move one. RED on the HEAD copy of storeScopeAdapter.ts
 * (cases 1, 2 and 3), GREEN after.
 */
import { contextValueFromStore, type StoreValueRow } from "@/features/scopes/service/storeScopeAdapter";

const SCOPE = "cc6a9ba2-fb83-4ea7-bb56-96b9e4ef4d91";
const ITEM = "f2acc6cd-c4f0-42ac-9cbc-3ceaeed34c40";
const FILE_KERNEL = "11111111-0000-4000-8000-000000000006";

function row(value: unknown, field: StoreValueRow["field"], labels?: Record<string, string>): StoreValueRow {
  return { scope_id: SCOPE, context_item_id: ITEM, key: "k", value, field, version: 1, set_at: "2026-09-25T02:03:25Z", value_id: "77c0a889-f881-4d8f-84dc-535daf9ee553", labels: labels ?? null };
}

const TABLE_FENCE =
  '```matrx\n{"__kind":"directive_v1_reference_table","items":[{"label": "Northwind Logistics — Known defects", "table_id": "8c67a085-197d-44c0-b2bb-ceeea9555303", "table_name": "Northwind Logistics — Known defects"}]}\n```';
const PEOPLE_FENCE =
  '```matrx\n{\n  "matrx_version": 1,\n  "kind": "reference",\n  "type": "scope",\n  "items": [\n    {\n      "id": "0cb16e97-e146-406f-a517-7f45d7618508",\n      "label": "Tomas Reyes"\n    }\n  ]\n}\n```';

describe("a store value lands in the old cell for every kind", () => {
  it("an item landed as text keeps its old text verbatim, whatever its old word", () => {
    const carriedRef = { type: "text", multi: false, config: {}, format: null, carried: { as_text: true, value_type: "reference" } };
    expect(contextValueFromStore(row(TABLE_FENCE, carriedRef)).value_text).toBe(TABLE_FENCE);
    expect(contextValueFromStore(row(PEOPLE_FENCE, carriedRef)).value_text).toBe(PEOPLE_FENCE);
    const carriedDatetime = { type: "text", multi: false, config: {}, format: null, carried: { as_text: true, value_type: "datetime" } };
    const c = contextValueFromStore(row("2016", carriedDatetime));
    expect(c.value_text).toBe("2016");
    expect(c.value_timestamp).toBeNull();
  });

  it("a reference outside the scope system keeps the label the store holds", () => {
    const v = contextValueFromStore(
      row([{ id: "18e4a6c3-cb94-4c53-b71f-9b0b73748e07", label: "Internal linking audit.xlsx", token: "workbook" }], { type: "relation", multi: true, config: {}, relation_target: null }),
    );
    expect(v.value_text).toContain('"type": "workbook"');
    expect(v.value_text).toContain('"label": "Internal linking audit.xlsx"');
  });

  it("a scope reference is named by the door's label, and a file reference stays a file", () => {
    const scope = contextValueFromStore(
      row("a71eeea7-739e-4f32-ba13-fbb91b279447", { type: "relation", multi: false, config: {}, relation_target: "2a0fff28-25db-4adc-89f4-e402df1121f5" }, { "a71eeea7-739e-4f32-ba13-fbb91b279447": "Golden State Indemnity Co." }),
    );
    expect(scope.value_text).toContain('"label": "Golden State Indemnity Co."');
    // The store holds the File RECORD; the old fence (and every file chip) names the FILE.
    const file = contextValueFromStore({
      ...row(["be939cea-95f2-4c72-b3c2-26736cae88f8"], { type: "relation", multi: true, config: {}, relation_target: FILE_KERNEL }, { "be939cea-95f2-4c72-b3c2-26736cae88f8": "QME Report.pdf" }),
      files: { "be939cea-95f2-4c72-b3c2-26736cae88f8": "e6acafbd-7d85-469b-bee4-02d17cc4b52d" },
    });
    expect(file.value_text).toContain('"type": "file"');
    expect(file.value_text).toContain('"file_id": "e6acafbd-7d85-469b-bee4-02d17cc4b52d"');
    expect(file.value_text).not.toContain("be939cea");
  });

  it.each([
    ["date", "2023-09-02", { type: "range", config: { kind: "date" }, format: "date" }, "value_date", "2023-09-02"],
    ["datetime", "2026-06-07T01:59:01Z", { type: "range", config: { kind: "datetime" } }, "value_timestamp", "2026-06-07T01:59:01Z"],
    ["a date-only datetime", "1984-03-12", { type: "range", config: { kind: "datetime" } }, "value_text", "1984-03-12"],
    ["number", 42, { type: "range", config: {} }, "value_number", 42],
    ["currency", 1250, { type: "range", config: {}, format: "currency" }, "value_number", 1250],
    ["boolean", true, { type: "boolean", config: {} }, "value_boolean", true],
    ["time", "09:30", { type: "text", config: {}, format: "time" }, "value_time", "09:30"],
    ["object", { plan: "PPO" }, { type: "text", config: {}, format: "json" }, "value_json", { plan: "PPO" }],
    ["list", ["knee", "hip"], { type: "text", multi: true, config: {} }, "value_json", ["knee", "hip"]],
    ["email", "front.desk@cedar-ridge-pt.test", { type: "text", config: {}, format: "email" }, "value_text", "front.desk@cedar-ridge-pt.test"],
    ["markdown", "## Plan of care", { type: "text", config: {}, format: "markdown" }, "value_text", "## Plan of care"],
    ["text", "Cumulative Trauma (CT)", { type: "text", config: {} }, "value_text", "Cumulative Trauma (CT)"],
  ])("%s", (_name, value, field, column, expected) => {
    const cell = contextValueFromStore(row(value, field as StoreValueRow["field"])) as unknown as Record<string, unknown>;
    expect(cell[column]).toEqual(expected);
  });
});
