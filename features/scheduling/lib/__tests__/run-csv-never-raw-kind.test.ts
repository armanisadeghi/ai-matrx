/**
 * A run's result summary that is a kind goes to the CSV / Google Sheet as the
 * kind's markdown, never as raw `{"__kind":…}` JSON.
 */
import { runCsvRows } from "../copy";
import type { SchRunRow } from "../../types";

const KIND = JSON.stringify({ __kind: "checklist", title: "Packing", items: [{ text: "Passport" }] });

const run = (summary: string | null) =>
  ({
    id: "r1",
    status: "succeeded",
    due_at: "2026-10-01T00:00:00Z",
    result_summary: summary,
  }) as unknown as SchRunRow;

describe("runCsvRows", () => {
  it("exports a kind result summary as its markdown", () => {
    const cell = String(runCsvRows([run(KIND)])[0].result_summary);
    expect(cell).not.toContain("__kind");
    expect(cell).toContain("Passport");
  });
  it("leaves a plain summary byte for byte", () => {
    expect(runCsvRows([run("All 4 steps ran.")])[0].result_summary).toBe("All 4 steps ran.");
    expect(runCsvRows([run(null)])[0].result_summary).toBe("");
  });
});
