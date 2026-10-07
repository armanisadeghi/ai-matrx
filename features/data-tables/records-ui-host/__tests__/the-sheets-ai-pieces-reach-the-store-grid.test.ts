/**
 * THE OLDER SHEET'S AI PIECES REACH THE STORE GRID (Sheet retirement).
 *
 * THE USE CASE: Cedar Ridge Physical Therapy's office manager writes a formula column on the
 * Visits table and asks for help; later she has the table's settings open and asks the side chat
 * for a "Discharge" row action. The older Sheet ran the formula-writing job with the formula, the
 * columns and the parser's mistake as that job's NAMED values (never inside her message), and its
 * settings window fed `matrx-user/table-settings` with three staging writes. RED before this
 * module: records-ui had no `formulaHelp` / `settingsAgent` ports and nothing bound them.
 */
jest.mock("@/components/official/ProTextareaAgentPanel", () => ({ ProTextareaAgentPanel: () => null }));

import type { Field } from "@ai-matrx/records";
import type { TableSettingsAgent, TableSettingsSnapshot } from "@ai-matrx/records-ui";

import { tableSettingsManifest } from "@/features/surfaces/manifests/table-settings.manifest";
import { formulaHelpValues, tableSettingsScope, tableSettingsWriteHandlers, RECORDS_AGENT_PORTS } from "../recordsAgentPorts";

const COLUMNS = [
  { id: "f1", key: "visit_fee", label: "Visit fee", type: "range" },
  { id: "f2", key: "copay", label: "Copay collected", type: "range" },
] as unknown as Field[];

describe("help in the formula box", () => {
  it("offers the formula-writing job its declared values by key, never the person's message", () => {
    const values = formulaHelpValues({
      text: "{Visit fee} -",
      columns: COLUMNS,
      mistake: "The formula stops before it is finished.",
      functions: ["IF", "ROUND"],
    });
    const byKey = Object.fromEntries(values.map((v) => [v.key, v.value]));
    expect(Object.keys(byKey).sort()).toEqual(
      ["formula_columns", "formula_columns_detail", "formula_current", "formula_language", "formula_parse_error", "formula_purpose"].sort(),
    );
    expect(byKey["formula_current"]).toBe("{Visit fee} -");
    expect(byKey["formula_columns"]).toBe("{Visit fee}, {Copay collected}");
    expect(byKey["formula_parse_error"]).toBe("The formula stops before it is finished.");
    expect(byKey["formula_language"]).toContain("IF, ROUND");
    expect(JSON.parse(byKey["formula_columns_detail"]!)).toContainEqual({ display_name: "Visit fee", field_name: "visit_fee", data_type: "range" });
  });

  it("is bound on every records-ui host", () => {
    expect(typeof RECORDS_AGENT_PORTS.formulaHelp).toBe("function");
    expect(typeof RECORDS_AGENT_PORTS.settingsAgent).toBe("function");
  });
});

describe("the table-settings surface", () => {
  const seen: TableSettingsSnapshot = {
    table_id: "t1",
    has_unsaved_changes: true,
    table_details_draft: { table_name: "Visits", description: "Every visit.", row_label: "Patient" },
    saved_row_actions: [{ id: "a1", name: "Check in", kind: "update", steps: [] }],
    editing_row_action: { name: "Discharge", kind: "update", steps: [{ field: "visit_fee", set: "formula", expression: "{Visit fee} + 5" }] },
    editing_row_action_problems: [],
  };
  const calls: Array<[string, unknown]> = [];
  const agent: TableSettingsAgent = {
    read: () => seen,
    stageRowAction: async (v) => void calls.push(["row", v]),
    stageStepFormula: async (v) => void calls.push(["step", v]),
    stageTableDetails: async (v) => void calls.push(["details", v]),
  };

  it("reads the panel through the package's agent, with the language while an update action is open", () => {
    const scope = tableSettingsScope(agent, ["IF"]) as Record<string, unknown>;
    expect(scope["has_unsaved_changes"]).toBe(true);
    expect(scope["table_details_draft"]).toEqual(seen.table_details_draft);
    expect(scope["editing_row_action"]).toEqual(seen.editing_row_action);
    expect(scope["saved_row_actions"]).toEqual(seen.saved_row_actions);
    expect(String(scope["formula_language"])).toContain("IF");
    expect(scope).not.toHaveProperty("settings_tab");
  });

  it("routes each write target to its staging call, and offers only those three", async () => {
    const handlers = tableSettingsWriteHandlers(agent);
    expect(Object.keys(handlers).sort()).toEqual(["editing_row_action", "row_action_step_formula", "table_details"]);
    // The manifest promises exactly what is handled — no dead target advertised.
    expect((tableSettingsManifest.writeTargets ?? []).map((t) => t.name).sort()).toEqual(Object.keys(handlers).sort());
    await (handlers["editing_row_action"] as (v: unknown) => Promise<void>)({ name: "Discharge" });
    await (handlers["row_action_step_formula"] as (v: unknown) => Promise<void>)({ field: "visit_fee", expression: "1" });
    await (handlers["table_details"] as (v: unknown) => Promise<void>)({ description: "Every visit." });
    expect(calls.map((c) => c[0])).toEqual(["row", "step", "details"]);
  });
});
