/**
 * GUARD 3 (lane INTEGRATION W1.2, 2026-10-03). Asked "which supplies are low?", an agent carrying
 * the `records` tool read the rows — and the turn showed "3 records." under a generic header, the
 * rows themselves nowhere. Every tool in the platform's common data set must draw its answer for a
 * person: rows as a table with Open and Save, a write as a line with a door, the rest as a sentence.
 *
 * Fails when: a common data tool has no display of its own (it would fall to the generic card); the
 * app's registration stops reaching `records` / `dataset`; or an answer the person must see (rows,
 * a write, a list) stops being read from the result's own shape.
 *
 * Proven red on plants held in memory only (a registry copy with `records` deleted; an answer
 * renderer swapped out): see the two "a plant is caught" cases.
 */
import { describe, expect, it, jest } from "@jest/globals";

jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));
jest.mock("@host/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));

// The app's feature renderers (dataset, picklist, ...) register first, as the host does.
import "@/features/chat-tool-renderers/registerFeatureToolRenderers";
import { getInlineRenderer, toolRendererRegistry } from "@ai-matrx/chat/tool-call-visualization/registry/registry";
import { ANSWER_READ_FOR, RECORDS_SPLIT_TOOLS, registerDataToolRenderers } from "../registerDataToolRenderers";
import { DATA_TOOLS, toolsWithNoDisplay } from "../dataToolDisplays";
import { readRecordsAnswer, writeSentence } from "../readRecordsAnswer";

describe("every common data tool draws its answer", () => {
  it("no common data tool falls to the generic card", () => {
    expect(toolsWithNoDisplay(toolRendererRegistry)).toEqual([]);
  });

  it("records and dataset answers go through the app's answer renderer", () => {
    for (const tool of ANSWER_READ_FOR) {
      const name = toolRendererRegistry[tool]?.InlineComponent.displayName ?? "";
      expect(name.startsWith("DataToolAnswer(")).toBe(true);
      expect(getInlineRenderer(tool).displayName).toContain("DataToolAnswer(");
    }
  });

  it("every records split tool is drawn by the records answer renderer under its own name", () => {
    for (const tool of RECORDS_SPLIT_TOOLS) {
      expect(toolRendererRegistry[tool]?.toolName).toBe(tool);
      expect(getInlineRenderer(tool).displayName).toContain("DataToolAnswer(");
    }
  });

  it("a plant is caught: a registry copy with no records renderer draws no split tool", () => {
    const planted: typeof toolRendererRegistry = {};
    registerDataToolRenderers(planted);
    expect(toolsWithNoDisplay(planted, RECORDS_SPLIT_TOOLS)).toEqual([...RECORDS_SPLIT_TOOLS]);
  });

  it("a plant is caught: a registry without records has a tool with no display", () => {
    const planted = { ...toolRendererRegistry };
    delete planted.records;
    expect(toolsWithNoDisplay(planted)).toEqual(["records"]);
    expect(toolsWithNoDisplay(planted, [...DATA_TOOLS, "picklist"])).toContain("records");
  });
});

describe("answers are read from the result's own shape", () => {
  it("rows a read returned become the table's rows", () => {
    const answer = readRecordsAnswer({
      action: "record_read",
      table_id: "4d8d6979-35b1-4d09-825e-2cfd987a9ec3",
      records: [
        { record_id: "r1", values: { item: "Ultrasound gel", on_hand: 2, reorder_at: 6 } },
        { record_id: "r2", values: { item: "Kinesiology tape", on_hand: 1, reorder_at: 10 } },
      ],
      count: 2,
    });
    expect(answer?.kind).toBe("rows");
    if (answer?.kind !== "rows") return;
    expect(answer.rows.map((row) => row.values.item)).toEqual(["Ultrasound gel", "Kinesiology tape"]);
  });

  it("dataset rows (get / search) become the same table", () => {
    const answer = readRecordsAnswer({
      dataset_id: "c71e10b9-0f67-4031-97ee-0f0a1a9236bf",
      rows: [{ row_id: "a", data: { room: "Hydrotherapy pool" } }],
      count: 1,
    });
    expect(answer?.kind).toBe("rows");
  });

  it("a write says what changed, by count, and names its one record", () => {
    const added = readRecordsAnswer({ action: "record_write", table_id: "t", written: 3, record_ids: ["a", "b", "c"], created: true });
    expect(added?.kind).toBe("write");
    if (added?.kind === "write") expect(writeSentence(added, "Clinic Supplies Count")).toBe("Added 3 records to Clinic Supplies Count.");
    const changed = readRecordsAnswer({ action: "record_write", record_id: "r9", version: 4, created: false });
    if (changed?.kind === "write") {
      expect(writeSentence(changed, null)).toBe("Changed 1 record.");
      expect(changed.recordId).toBe("r9");
    } else throw new Error("a change was not read as a write");
    const archived = readRecordsAnswer({ action: "record_delete", record_id: "r9" });
    if (archived?.kind === "write") expect(writeSentence(archived, "Clinic Supplies Count")).toBe("Archived 1 record in Clinic Supplies Count.");
  });

  it("a held write is left to the approval card", () => {
    expect(readRecordsAnswer({ action: "record_write", applied: false, awaiting_approval: true, not_done: "1 record was NOT written" })).toBeNull();
  });

  it("everything else is one sentence, never the JSON", () => {
    expect(readRecordsAnswer({ action: "table_list", count: 11, tables: [] })).toMatchObject({ text: "Found 11 tables." });
    expect(readRecordsAnswer({ action: "metadata_search", count: 1, matches: [] })).toMatchObject({ text: "Found 1 match." });
    expect(readRecordsAnswer({ topic: "record_aggregate", how: "ONE NUMBER…" })).toMatchObject({ text: "Read the guide to counts and totals." });
    expect(readRecordsAnswer({ action: "field_propose", applied: true, field: { label: "Reorder at" }, table_id: "t" })).toMatchObject({ text: "Added the column Reorder at." });
    expect(readRecordsAnswer({ action: "table_propose", applied: true, table: { name: "Clinic Supplies Count" }, table_id: "t" })).toMatchObject({ text: "Made the table Clinic Supplies Count." });
    expect(readRecordsAnswer({ tables: [{}, {}] })).toMatchObject({ text: "Found 2 tables." });
  });
});
