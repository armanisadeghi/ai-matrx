// DRILL-WIRE — the explorer hands the published drill primitives what the usage definitions declare:
// a relation's record kind (`entity`: the group row's doors and its kind's menu), a choice's chart
// colour (`colorFor`), a moment Measure (`moment`: never a share or a change); and the table host gives
// a person the admin user menu on administration pages only.

import type { DrillDefinition } from "@ai-matrx/records";

import { drillSiblingDimensions, drillSiblingMeasures } from "../drillSiblings";
import { adminUserTableMenu, hostEntityMenu } from "@/features/admin/users/components/admin-user-table-menu";
import { buildAdminUserMenuSection } from "@/features/admin/users/components/admin-user-menu-section";

const usage = {
  dimensions: [
    { key: "person", label: "Person", from: "person_id", kind: "relation", relation: { token: "user", person: true } },
    { key: "organization", label: "Organization", from: "organization_id", kind: "relation", relation: { token: "organization" } },
    { key: "table", label: "Table", from: "table_id", kind: "relation", relation: { table_id: "00000000-0000-4000-8000-000000000001" } },
    {
      key: "origin",
      label: "Origin",
      from: "origin",
      kind: "choice",
      choices: [
        { value: "human", label: "A person", color: "--matrx-chart-1" },
        { value: "workflow", label: "A workflow", color: "--matrx-chart-4" },
        { value: "legacy", label: "Older rows" },
      ],
    },
    { key: "model", label: "Model", from: "model", kind: "text" },
  ],
  measures: [
    { key: "cost", label: "Cost", op: "sum", of: "cost_usd", unit: "usd" },
    { key: "total_tokens", label: "Total tokens", op: "sum_of", parts: ["tokens_in", "tokens_cached", "tokens_out"], unit: "tokens", additive: true },
    { key: "last_activity", label: "Last active hour", op: "max", of: "bucket", unit: "time" },
  ],
} as unknown as DrillDefinition;

describe("the explorer's Dimensions carry what the definition declares", () => {
  const dims = drillSiblingDimensions(usage, {}, undefined);
  const by = (key: string) => dims.find((d) => d.key === key)!;

  it("a relation names its record kind; a custom table relation and a code do not", () => {
    expect(by("person").entity).toBe("user");
    expect(by("organization").entity).toBe("organization");
    expect(by("table").entity).toBeUndefined();
    expect(by("origin").entity).toBeUndefined();
  });

  it("a choice keeps its declared chart token; an undeclared value and a blank keep none", () => {
    expect(by("origin").colorFor?.("human")).toBe("--matrx-chart-1");
    expect(by("origin").colorFor?.("workflow")).toBe("--matrx-chart-4");
    expect(by("origin").colorFor?.("legacy")).toBeNull();
    expect(by("origin").colorFor?.(null)).toBeNull();
    expect(by("model").colorFor).toBeUndefined();
  });
});

describe("the explorer's Measures", () => {
  const measures = drillSiblingMeasures(usage, "points");
  const by = (key: string) => measures.find((m) => m.key === key)!;

  it("a moment is a moment: never additive, never a share or a change", () => {
    expect(by("last_activity").moment).toBe(true);
    expect(by("last_activity").additive).toBe(false);
    expect(by("cost").moment).toBeUndefined();
    expect(by("total_tokens").additive).toBe(true);
    expect(by("cost").lowerIsBetter).toBe(true);
  });
});

describe("a person's record menu in a table", () => {
  it("on an administration page is the admin user menu, in its order, acting on that person", () => {
    const went: string[] = [];
    const menu = hostEntityMenu("user", "6b1f3b52-6f0e-4f0a-9d0e-2a3b4c5d6e7f", "/administration/usage", (to) => went.push(to))!;
    const canonical = buildAdminUserMenuSection({ id: "6b1f3b52-6f0e-4f0a-9d0e-2a3b4c5d6e7f" }).items;
    expect(menu.map((m) => m.label)).toEqual(canonical.map((m) => m.label));
    menu.find((m) => m.id === "admin-user-account")!.onSelect!();
    expect(went).toEqual(["/administration/users?user=6b1f3b52-6f0e-4f0a-9d0e-2a3b4c5d6e7f"]);
    expect(menu.some((m) => m.destructive)).toBe(false);
  });

  it("is absent off the administration pages and for any other record kind", () => {
    expect(hostEntityMenu("user", "6b1f3b52-6f0e-4f0a-9d0e-2a3b4c5d6e7f", "/agents/all", () => {})).toBeUndefined();
    expect(hostEntityMenu("user", "6b1f3b52-6f0e-4f0a-9d0e-2a3b4c5d6e7f", "/administrationx", () => {})).toBeUndefined();
    expect(hostEntityMenu("organization", "6b1f3b52-6f0e-4f0a-9d0e-2a3b4c5d6e7f", "/administration/usage", () => {})).toBeUndefined();
    expect(adminUserTableMenu("6b1f3b52-6f0e-4f0a-9d0e-2a3b4c5d6e7f", () => {}).length).toBeGreaterThan(0);
  });
});
