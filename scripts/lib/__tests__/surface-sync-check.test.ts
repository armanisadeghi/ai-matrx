/**
 * `--check` must address every child row by its full plan key. A screen value
 * and an item value that share a name ("status" on a pickup board and on each
 * pickup row) are two rows; keyed on (surface_name, name) one hides the other
 * and the check reports a difference that does not exist (or misses one).
 */
import { planSurfaceSync } from "@ai-matrx/alchemy/checks";
import { createDeclarationRegistry } from "@ai-matrx/alchemy/declare";
import { childMetadataFailures, rowsByKey } from "../surface-sync-check";

const value = (name: string, label: string) => ({
  name,
  label,
  description: `The ${label.toLowerCase()}.`,
  valueType: "string" as const,
  alwaysAvailable: true,
  typicalCharCount: 20,
});

function plan() {
  const registry = createDeclarationRegistry();
  registry.register({
    surfaceName: "matrx-user/cascade-pickup-board",
    client: "matrx-user",
    executionMode: "python-stream",
    description: "A recycling company's pickup board.",
    label: "Pickup board",
    readiness: "stub",
    values: [value("status", "Board status")],
    itemTypes: [
      {
        name: "pickup",
        label: "Pickup",
        description: "One scheduled pickup.",
        identity: ["pickup_id"],
        values: [value("pickup_id", "Pickup id"), value("status", "Pickup status")],
      },
    ],
  });
  return planSurfaceSync(registry.all(), {
    organizationId: "39c38960-d30c-4840-b0c1-c9960de95582",
    syncedFrom: "check",
    schema: { itemType: true },
  });
}

describe("surface sync --check keys child rows by the plan's full key", () => {
  it("keeps a screen value and an item value with the same name apart", () => {
    const p = plan();
    const live = p.tables.find((t) => t.table === "ui.ui_surface_value")!.rows.map((row) => ({ ...row }));
    expect(rowsByKey(live).size).toBe(live.length);
    expect(childMetadataFailures(p, [live, [], [], []])).toEqual([]);
  });

  it("reports a real difference on the item row, not the screen row", () => {
    const p = plan();
    const live = p.tables
      .find((t) => t.table === "ui.ui_surface_value")!
      .rows.map((row) => (row.item_type === "pickup" && row.name === "status" ? { ...row, label: "Stale label" } : { ...row }));
    expect(childMetadataFailures(p, [live, [], [], []])).toEqual([
      "matrx-user/cascade-pickup-board::pickup.status: label differs",
    ]);
  });
});
