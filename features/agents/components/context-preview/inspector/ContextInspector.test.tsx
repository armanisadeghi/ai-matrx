/**
 * The inspector (lanes CONTEXT-INSPECTOR-GUIDED, -2, -3): the four steps are
 * the platform's Miller Columns — Organizations → Scope types → Scopes →
 * Context items, one pick per column — and the compare re-resolves at every
 * pick with the selection the columns describe (the server's
 * `ContextSelection`, the type as the TYPE). A `?scope=` link back-fills its
 * organization and type from the scope tree, or from the scope row when the
 * scope is outside the person's tree.
 *
 * Mocked: the person's scope tree (useUniverse), the context-items loader under
 * the items column, the scopes chokepoint (values, scope home) and the compare
 * (whose own request/response suite is ContextCompareView.test.tsx). The
 * inspector, Miller Columns, the drill-path engine and the selection logic are
 * the real code.
 */
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

const CASTELLANO = "7cd12da2-2213-4378-8fba-a9e2dc4ea657";
const TITANIUM = "f9cb3e35-2a65-4f2a-8525-088d6551071c";
const CLIENTS = "0b6f1c1e-6a1f-4c55-9d7e-1f2a3b4c5d6e";
const MATTERS = "2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f";
const MERIDIAN = "3f0e2d1c-4b5a-4968-8776-5a4b3c2d1e0f";
const GOLDEN_STATE = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const PHONE = "9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d";
const INDUSTRY = "8b7c6d5e-4f3a-4b2c-9d1e-0f9a8b7c6d5e";

const scopeRow = (id: string, name: string, type: string) => ({
  id,
  scope_type_id: type,
  organization_id: CASTELLANO,
  name,
  description: "",
  parent_scope_id: null,
  settings: {},
});
const typeRow = (id: string, plural: string, scopes: ReturnType<typeof scopeRow>[]) => ({
  id,
  organization_id: CASTELLANO,
  label_singular: plural.replace(/s$/, ""),
  label_plural: plural,
  icon: "briefcase",
  color: "blue",
  max_assignments_per_entity: null,
  sort_order: 1,
  parent_type_id: null,
  default_variable_keys: [],
  scopes,
});
const TREE = [
  {
    id: CASTELLANO,
    name: "Castellano & Reyes, LLP",
    scope_types: [
      typeRow(CLIENTS, "Clients", [
        scopeRow(GOLDEN_STATE, "Golden State Indemnity Co.", CLIENTS),
        scopeRow(MERIDIAN, "Meridian Risk Services", CLIENTS),
      ]),
      typeRow(MATTERS, "Matters", []),
    ],
  },
  { id: TITANIUM, name: "Titanium", scope_types: [] },
];

jest.mock("@/features/scopes/components/active-context/quick-pick/engine", () => {
  const actual = jest.requireActual("@/features/scopes/components/active-context/quick-pick/engine");
  return {
    ...actual,
    useUniverse: () => ({
      orgs: TREE,
      projects: [],
      tasks: [],
      treeStatus: "ready",
      treeError: null,
      retryTree: () => undefined,
      engagementStatus: "ready",
      engagementError: null,
      retryEngagement: () => undefined,
    }),
  };
});
jest.mock("@/features/scopes/components/context-assignment/data", () => ({
  fetchTypeItems: jest.fn(async (typeId: string) =>
    typeId === "0b6f1c1e-6a1f-4c55-9d7e-1f2a3b4c5d6e"
      ? [
          { id: "9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d", key: "contact_phone", display_name: "Contact Phone" },
          { id: "8b7c6d5e-4f3a-4b2c-9d1e-0f9a8b7c6d5e", key: "industry", display_name: "Industry" },
        ]
      : [],
  ),
  fetchAssignableProjects: jest.fn(async () => []),
  fetchAssignableTasks: jest.fn(async () => []),
}));
jest.mock("@/features/scopes/service/scopesService", () => ({
  scopesService: {
    getScopeHome: jest.fn(),
    listContextItems: jest.fn(),
    listContextValues: jest.fn(),
  },
}));
const compareProps: Array<Record<string, unknown>> = [];
jest.mock("../ContextCompareView", () => ({
  ContextCompareView: (props: Record<string, unknown>) => {
    compareProps.push(props);
    return <div data-compare-mock={JSON.stringify(props.selection)} />;
  },
}));

import { scopesService } from "@/features/scopes/service/scopesService";
import { ContextInspector } from "./ContextInspector";
import { EMPTY_SELECTION, type InspectorSelection } from "./selection";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const svc = scopesService as unknown as Record<string, jest.Mock>;
const writes: Array<{ next: InspectorSelection; replace: boolean }> = [];

function Harness({ initial }: { initial: InspectorSelection }) {
  const [selection, set] = useState(initial);
  return (
    <ContextInspector
      selection={selection}
      onChange={(next, opts) => {
        writes.push({ next, replace: Boolean(opts?.replace) });
        set(next);
      }}
    />
  );
}

let root: Root;
let host: HTMLDivElement;
async function mount(initial: InspectorSelection) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<Harness initial={initial} />));
  await act(async () => undefined);
}
const lastCompare = () => compareProps[compareProps.length - 1];
const rows = () => [...host.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")];
const pressed = () => rows().filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.textContent);
async function pick(label: string) {
  const row = rows().find((b) => b.textContent === label);
  if (!row) throw new Error(`no column row "${label}" in ${rows().map((b) => b.textContent).join(" | ")}`);
  await act(async () => row.click());
  await act(async () => undefined);
}

beforeEach(() => {
  compareProps.length = 0;
  writes.length = 0;
  jest.clearAllMocks();
  svc.listContextItems.mockResolvedValue({
    ok: true,
    data: {
      items: [
        { id: PHONE, key: "contact_phone", display_name: "Contact Phone", sort_order: 1 },
        { id: INDUSTRY, key: "industry", display_name: "Industry", sort_order: 2 },
      ],
    },
  });
  svc.listContextValues.mockResolvedValue({
    ok: true,
    data: {
      values: [
        {
          context_item_id: PHONE,
          value_text: "(619) 555-0177",
          value_number: null,
          value_boolean: null,
          value_date: null,
          value_json: null,
          value_document_url: null,
          value_reference_id: null,
        },
      ],
    },
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

it("is Miller Columns — no hand-rolled pickers, no free-text boxes", async () => {
  await mount(EMPTY_SELECTION);
  expect(host.querySelector("[data-inspector-step]")).toBeNull();
  expect(host.querySelector('[role="combobox"]')).toBeNull();
  expect(host.textContent).toContain("Organizations");
  expect(host.textContent).toContain("Scope types");
  expect(rows().map((b) => b.textContent)).toEqual(
    expect.arrayContaining(["Castellano & Reyes, LLP", "Titanium"]),
  );
  // Short columns carry no search box; nothing is previewed before a pick.
  expect(host.querySelector("input, textarea")).toBeNull();
  expect(compareProps).toHaveLength(0);
});

it("a pick in each column drives the compare, narrowing at every step", async () => {
  await mount(EMPTY_SELECTION);

  await pick("Castellano & Reyes, LLP");
  expect(writes.at(-1)?.next).toEqual({ ...EMPTY_SELECTION, org: CASTELLANO });
  expect(lastCompare()).toMatchObject({
    selection: { organization_id: CASTELLANO, scope_type_id: null, scope_id: null, context_item_id: null },
  });

  await pick("Clients");
  expect(lastCompare()).toMatchObject({
    selection: { organization_id: CASTELLANO, scope_type_id: CLIENTS, scope_id: null, context_item_id: null },
  });
  expect(JSON.stringify(lastCompare())).not.toMatch(/scopeIds|scope_ids/);
  expect(host.querySelector("[data-inspector-caption]")?.textContent).toBe(
    "All 2 Clients selected at once.",
  );

  await pick("Meridian Risk Services");
  expect(svc.listContextValues).toHaveBeenCalledWith(MERIDIAN);
  expect(lastCompare()).toMatchObject({
    selection: { organization_id: CASTELLANO, scope_type_id: CLIENTS, scope_id: MERIDIAN, context_item_id: null },
    focus: undefined,
  });

  await pick("Contact Phone");
  expect(writes.at(-1)?.next).toEqual({ org: CASTELLANO, scopeType: CLIENTS, scope: MERIDIAN, item: PHONE });
  expect(host.querySelector("[data-inspector-value]")?.getAttribute("data-inspector-value")).toBe(
    "(619) 555-0177",
  );
  expect(lastCompare()).toMatchObject({
    selection: { organization_id: CASTELLANO, scope_type_id: CLIENTS, scope_id: MERIDIAN, context_item_id: PHONE },
    focus: { itemId: PHONE, key: "contact_phone", label: "Contact Phone" },
  });
  expect(pressed()).toEqual([
    "Castellano & Reyes, LLP",
    "Clients",
    "Meridian Risk Services",
    "Contact Phone",
  ]);

  // Re-picking a column clears every column after it.
  await pick("Clients");
  expect(writes.at(-1)?.next).toEqual({ ...EMPTY_SELECTION, org: CASTELLANO });
});

it("the first screen is honest: nothing is picked, so nothing past Organizations is shown", async () => {
  await mount(EMPTY_SELECTION);
  // VERIFIER-22 #1: the later columns previewed the first organization's types and one read
  // "No scopes under the selected types yet." with nothing selected.
  const labels = rows().map((b) => b.textContent);
  expect(labels).toEqual(["Castellano & Reyes, LLP", "Titanium"]);
  expect(labels).not.toContain("Clients");
  expect(host.textContent).toContain("Pick an organization");
  expect(host.textContent).not.toMatch(/selected/i);
  expect(host.textContent).not.toContain("· items");

  // One step down, the same: the organization is picked, its types show, and the scope and
  // items columns wait for a type rather than previewing the first one's scopes.
  await pick("Castellano & Reyes, LLP");
  const next = rows().map((b) => b.textContent);
  expect(next).toEqual(expect.arrayContaining(["Clients", "Matters"]));
  expect(next).not.toContain("Golden State Indemnity Co.");
  expect(host.textContent).toContain("Pick a scope type");
});

it("a truncated row carries its full name", async () => {
  await mount({ ...EMPTY_SELECTION, org: CASTELLANO, scopeType: CLIENTS });
  const meridian = rows().find((b) => b.textContent === "Meridian Risk Services");
  expect(meridian?.getAttribute("title")).toBe("Meridian Risk Services");
});

it("a scope type with no scopes says so and previews nothing past it", async () => {
  await mount({ ...EMPTY_SELECTION, org: CASTELLANO, scopeType: MATTERS });
  expect(host.textContent).toContain("No matters yet.");
  expect(compareProps).toHaveLength(0);
});

it("?scope= alone back-fills the organization, type and scope columns from the tree", async () => {
  await mount({ ...EMPTY_SELECTION, scope: MERIDIAN });
  expect(svc.getScopeHome).not.toHaveBeenCalled();
  expect(writes[0]).toEqual({
    next: { org: CASTELLANO, scopeType: CLIENTS, scope: MERIDIAN, item: null },
    replace: true,
  });
  expect(pressed()).toEqual(["Castellano & Reyes, LLP", "Clients", "Meridian Risk Services"]);
  // Every compare asked was the back-filled scope under its own organization and type.
  expect(compareProps.length).toBeGreaterThan(0);
  for (const props of compareProps) {
    expect(props.selection).toEqual({
      organization_id: CASTELLANO,
      scope_type_id: CLIENTS,
      scope_id: MERIDIAN,
      context_item_id: null,
    });
  }
});

it("a scope outside the tree back-fills from the scope row; one not shared says so", async () => {
  const OUTSIDE = "5e4d3c2b-1a09-4f8e-9d7c-6b5a4f3e2d1c";
  svc.getScopeHome.mockResolvedValueOnce({ ok: true, data: { scope: null } });
  await mount({ ...EMPTY_SELECTION, scope: OUTSIDE });
  expect(svc.getScopeHome).toHaveBeenCalledWith(OUTSIDE);
  expect(host.textContent).toContain("This scope was not found, or it has not been shared with you");
  expect(compareProps).toHaveLength(0);
});
