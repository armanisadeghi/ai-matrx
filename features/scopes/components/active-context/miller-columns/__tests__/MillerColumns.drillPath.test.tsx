/**
 * Miller Columns over a drill path (lane INSPECTOR-TAILS, VERIFIER-22 #1 and #6).
 * - A drill path previews nothing it was not given: before a pick the later
 *   columns wait with a hint, and no sentence claims a selection. A host that
 *   asks for the Finder focus preview (`preview: true`, the Context Switcher's
 *   way) still gets it.
 * - Every row carries its full name as a tooltip, and the column the person is
 *   working in is marked focused (it takes the room its names need when the
 *   columns are squeezed).
 * Mocked: the context-items loader (data.ts). The core and the engine are real.
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
function Harness({ preview }: { preview?: boolean }) {
  const [path, setPath] = useState<DrillPath>(EMPTY_DRILL_PATH);
  const engine = useDrillPathEngine({
    orgs,
    path,
    preview,
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
async function mount(preview?: boolean) {
  paths.length = 0;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<Harness preview={preview} />));
}
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const rows = () => [...host.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")];
const rowLabels = () => rows().map((b) => b.textContent);
const click = async (label: string) => {
  const button = rows().find((b) => b.textContent === label);
  if (!button) throw new Error(`no row "${label}" in ${rowLabels().join(" | ")}`);
  await act(async () => button.click());
  await act(async () => undefined);
};
const focusedTitle = () =>
  host.querySelector("[data-miller-focused]")?.querySelector("span")?.textContent;

it("a drill path shows nothing past the deepest pick, and says what to pick", async () => {
  await mount();
  expect(rowLabels()).toEqual(["Castellano & Reyes, LLP", "Titanium"]);
  expect(host.textContent).toContain("Pick an organization");
  expect(host.textContent).not.toMatch(/selected/i);
  expect(focusedTitle()).toBe("Organizations");

  await click("Castellano & Reyes, LLP");
  expect(rowLabels()).toEqual(expect.arrayContaining(["Clients", "Matters"]));
  expect(rowLabels()).not.toContain("Meridian Risk Services");
  expect(host.textContent).toContain("Pick a scope type");
  expect(focusedTitle()).toBe("Scope types");

  await click("Clients");
  expect(rowLabels()).toContain("Meridian Risk Services");
  expect(host.textContent).toContain("Pick a scope to see its items.");
  expect(focusedTitle()).toBe("Clients");

  await click("Meridian Risk Services");
  expect(rowLabels()).toContain("Contact Phone");
  expect(focusedTitle()).toBe("Meridian Risk Services · items");
});

it("a host that asks for the focus preview still gets it", async () => {
  await mount(true);
  // The first organization's types, previewed with nothing picked — the Context Switcher's way.
  expect(rowLabels()).toEqual(expect.arrayContaining(["Clients", "Matters", "Golden State Indemnity Co."]));
});

it("every row carries its full name as a tooltip", async () => {
  await mount();
  await click("Castellano & Reyes, LLP");
  await click("Clients");
  const row = rows().find((b) => b.textContent === "Golden State Indemnity Co.");
  expect(row?.getAttribute("title")).toBe("Golden State Indemnity Co.");
});
