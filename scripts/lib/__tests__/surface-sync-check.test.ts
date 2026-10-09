/**
 * `--check` must address every child row by its full plan key. A screen value
 * and an item value that share a name ("status" on a pickup board and on each
 * pickup row) are two rows; keyed on (surface_name, name) one hides the other
 * and the check reports a difference that does not exist (or misses one).
 */
import { planSurfaceSync } from "@ai-matrx/alchemy/checks";
import { createDeclarationRegistry } from "@ai-matrx/alchemy/declare";
import { childMetadataFailures, lifecycleFailures, mirrorLifecycle, rowsByKey } from "../surface-sync-check";

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

describe("the sync archives what the code removed and revives what it re-declared", () => {
  const SURFACE = "matrx-user/cascade-pickup-board";
  const declaredValues = (): Array<Record<string, unknown>> =>
    plan()
      .tables.find((t) => t.table === "ui.ui_surface_value")!
      .rows.map((row, index) => ({ ...row, id: `v-${index}`, deleted_at: null as string | null }));
  // The notes rename of 2026-09-28 in miniature: a value the code renamed away stays live in the mirror.
  const renamedAway = { id: "v-stale", surface_name: SURFACE, item_type: "", name: "board_visibility", deleted_at: null };

  it("archives a live mirror value the manifest no longer declares", () => {
    const p = plan();
    const [values] = mirrorLifecycle(p, [[...declaredValues(), renamedAway], [], [], []], [SURFACE]);
    expect(values!.archive.map((row) => row.id)).toEqual(["v-stale"]);
    expect(values!.revive).toEqual([]);
    expect(lifecycleFailures(mirrorLifecycle(p, [[...declaredValues(), renamedAway], [], [], []], [SURFACE]), p)).toEqual([
      `value ${SURFACE}::board_visibility: live in the mirror but no longer declared in code`,
    ]);
  });

  it("leaves an already-archived stale value alone and touches no surface outside the run", () => {
    const p = plan();
    const archived = { ...renamedAway, deleted_at: "2026-10-01T00:00:00Z" };
    const otherSurface = { ...renamedAway, id: "v-other", surface_name: "matrx-user/someone-elses-page" };
    const lifecycle = mirrorLifecycle(p, [[...declaredValues(), archived, otherSurface], [], [], []], [SURFACE]);
    expect(lifecycle.flatMap((t) => [...t.archive, ...t.revive])).toEqual([]);
    expect(lifecycleFailures(lifecycle, p)).toEqual([]);
  });

  it("revives a declared value that sits archived (a re-added value)", () => {
    const p = plan();
    const rows = declaredValues().map((row) =>
      row.item_type === "pickup" && row.name === "status" ? { ...row, deleted_at: "2026-10-01T00:00:00Z" } : row,
    );
    const [values] = mirrorLifecycle(p, [rows, [], [], []], [SURFACE]);
    expect(values!.archive).toEqual([]);
    expect(values!.revive.map((row) => `${row.item_type}.${row.name}`)).toEqual(["pickup.status"]);
    expect(lifecycleFailures(mirrorLifecycle(p, [rows, [], [], []], [SURFACE]), p)).toEqual([
      `value ${SURFACE}::pickup.status: declared in code but archived in the mirror`,
    ]);
  });

  it("archives every live row of a child table the plan declares nothing for", () => {
    const p = plan();
    const role = { id: "r-1", surface_name: SURFACE, name: "removed_role", deleted_at: null };
    const lifecycle = mirrorLifecycle(p, [declaredValues(), [role], [], []], [SURFACE]);
    expect(lifecycle[1]!.archive.map((row) => row.id)).toEqual(["r-1"]);
  });
});
