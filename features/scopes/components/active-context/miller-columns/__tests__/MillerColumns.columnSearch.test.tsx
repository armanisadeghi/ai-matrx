/**
 * Miller Columns — per-column search inside the primitive (lane
 * CONTEXT-INSPECTOR-3). A long column shows its own search box; typing narrows
 * that column only; a short column shows none; the query clears when the
 * column's source changes. Mocked: the context-items loader (data.ts). The
 * core, the engine and the drill-path selection are the real code.
 */
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

jest.mock("@/features/scopes/components/context-assignment/data", () => ({
  fetchTypeItems: jest.fn(async () => [
    { id: "item-phone", key: "contact_phone", display_name: "Contact Phone" },
    { id: "item-industry", key: "industry", display_name: "Industry" },
  ]),
  fetchAssignableProjects: jest.fn(async () => []),
  fetchAssignableTasks: jest.fn(async () => []),
}));

import { MillerColumnsCore } from "../MillerColumns";
import {
  EMPTY_DRILL_PATH,
  useDrillPathEngine,
  type DrillPath,
  type Universe,
} from "../../quick-pick/engine";
import type { OrgNode } from "@/features/scopes/types";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CLIENTS = [
  "Golden State Indemnity Co.",
  "Meridian Risk Services",
  "Pacific Coast Freight Lines",
  "Harbor View Medical Group",
  "Sierra Madre Vineyards",
  "Coronado Marine Supply",
  "Mesa Verde Builders",
  "Torrey Pines Biotech",
  "La Jolla Dental Partners",
  "Escondido Citrus Growers",
];

const type = (id: string, plural: string, names: string[]) => ({
  id,
  organization_id: "org-castellano",
  label_singular: plural.replace(/s$/, ""),
  label_plural: plural,
  icon: "briefcase",
  color: "blue",
  max_assignments_per_entity: null,
  sort_order: 1,
  parent_type_id: null,
  default_variable_keys: [],
  scopes: names.map((name, i) => ({
    id: `${id}-scope-${i}`,
    scope_type_id: id,
    organization_id: "org-castellano",
    name,
    description: "",
    parent_scope_id: null,
    settings: {},
  })),
});

const orgs = [
  {
    id: "org-castellano",
    name: "Castellano & Reyes, LLP",
    scope_types: [
      type("type-clients", "Clients", CLIENTS),
      type("type-matters", "Matters", ["Meridian v. Harbor Freight", "Estate of Alvarez"]),
    ],
  },
  { id: "org-titanium", name: "Titanium", scope_types: [] },
] as unknown as OrgNode[];

const universe: Universe = {
  orgs,
  projects: [],
  tasks: [],
  treeStatus: "ready",
  treeError: null,
  retryTree: () => undefined,
  engagementStatus: "ready",
  engagementError: null,
  retryEngagement: () => undefined,
};

const paths: DrillPath[] = [];
function Harness() {
  const [path, setPath] = useState<DrillPath>(EMPTY_DRILL_PATH);
  const engine = useDrillPathEngine({
    orgs,
    path,
    onChange: (next) => {
      paths.push(next);
      setPath(next);
    },
  });
  return (
    <MillerColumnsCore
      universe={universe}
      engine={engine}
      mode="filter"
      variant="full"
      includeEngagements={false}
    />
  );
}

let root: Root;
let host: HTMLDivElement;
beforeEach(async () => {
  paths.length = 0;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<Harness />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const search = (label: string) =>
  host.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement | null;
const rowLabels = () =>
  [...host.querySelectorAll("button[aria-pressed]")].map((b) => b.textContent);
const click = async (label: string) => {
  const button = [...host.querySelectorAll("button[aria-pressed]")].find(
    (b) => b.textContent === label,
  ) as HTMLButtonElement | undefined;
  if (!button) throw new Error(`no row "${label}" in ${rowLabels().join(" | ")}`);
  await act(async () => button.click());
};
async function type_(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

it("shows a search box on the long Scope column only, and typing narrows it", async () => {
  await click("Castellano & Reyes, LLP");
  await click("Clients");
  // 10 clients > 8 → the Clients column searches; 2 orgs / 2 types do not.
  expect(search("Search Clients")).not.toBeNull();
  expect(search("Search Organizations")).toBeNull();
  expect(search("Search Scope types")).toBeNull();
  expect(rowLabels()).toContain("Torrey Pines Biotech");

  await type_(search("Search Clients")!, "meri");
  const labels = rowLabels();
  expect(labels).toContain("Meridian Risk Services");
  expect(labels).not.toContain("Torrey Pines Biotech");
  expect(labels).not.toContain("Golden State Indemnity Co.");
  // Other columns keep every row.
  expect(labels).toContain("Titanium");
  expect(labels).toContain("Matters");

  await click("Meridian Risk Services");
  expect(paths.at(-1)).toEqual({
    orgId: "org-castellano",
    typeId: "type-clients",
    scopeId: "type-clients-scope-1",
    itemId: null,
  });
  await act(async () => undefined);
  await click("Contact Phone");
  expect(paths.at(-1)?.itemId).toBe("item-phone");
});

it("clears a column's query when its source changes", async () => {
  await click("Castellano & Reyes, LLP");
  await click("Clients");
  await type_(search("Search Clients")!, "zzz");
  expect(host.textContent).toContain('No scope matches "zzz".');
  await click("Matters");
  await click("Clients");
  expect(search("Search Clients")!.value).toBe("");
  expect(rowLabels()).toContain("Torrey Pines Biotech");
});
