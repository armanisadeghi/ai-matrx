/**
 * The guided inspector (lane CONTEXT-INSPECTOR-GUIDED): each step loads from
 * the previous choice only, the compare re-resolves at every depth with the
 * selection the steps describe, and a `?scope=` link back-fills its
 * organization and type from the scope itself.
 *
 * Mocked: the scopes chokepoint, the person's organizations and the compare
 * (whose own request/response suite is ContextCompareView.test.tsx). The
 * inspector and its selection logic are the real code.
 */
import React, { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

jest.mock("@/features/scopes/service/scopesService", () => ({
  scopesService: {
    listScopeTypesForOrganization: jest.fn(),
    listScopesOfType: jest.fn(),
    getScopeHome: jest.fn(),
    listContextItems: jest.fn(),
    listContextValues: jest.fn(),
  },
}));
jest.mock("@/features/organizations/hooks", () => ({
  useUserOrganizations: () => ({
    organizations: [
      { id: "7cd12da2-2213-4378-8fba-a9e2dc4ea657", name: "Castellano & Reyes, LLP" },
      { id: "f9cb3e35-2a65-4f2a-8525-088d6551071c", name: "Titanium" },
    ],
    loading: false,
    error: null,
  }),
}));
const compareProps: Array<Record<string, unknown>> = [];
jest.mock("../ContextCompareView", () => ({
  ContextCompareView: (props: Record<string, unknown>) => {
    compareProps.push(props);
    return <div data-compare-mock={JSON.stringify(props.scopeIds)} />;
  },
}));

import { scopesService } from "@/features/scopes/service/scopesService";
import { ContextInspector } from "./ContextInspector";
import { EMPTY_SELECTION, type InspectorSelection } from "./selection";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const svc = scopesService as unknown as Record<string, jest.Mock>;
const CASTELLANO = "7cd12da2-2213-4378-8fba-a9e2dc4ea657";
const CLIENTS = "0b6f1c1e-6a1f-4c55-9d7e-1f2a3b4c5d6e";
const MATTERS = "2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f";
const MERIDIAN = "3f0e2d1c-4b5a-4968-8776-5a4b3c2d1e0f";
const GOLDEN_STATE = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const PHONE = "9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d";
const INDUSTRY = "8b7c6d5e-4f3a-4b2c-9d1e-0f9a8b7c6d5e";

let setSelection: (s: InspectorSelection) => void = () => undefined;
const writes: Array<{ next: InspectorSelection; replace: boolean }> = [];

function Harness({ initial }: { initial: InspectorSelection }) {
  const [selection, set] = useState(initial);
  useEffect(() => {
    setSelection = set;
  }, []);
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
const trigger = (step: string) =>
  host.querySelector(`[data-inspector-step="${step}"] button`) as HTMLButtonElement | null;

beforeEach(() => {
  compareProps.length = 0;
  writes.length = 0;
  jest.clearAllMocks();
  svc.listScopeTypesForOrganization.mockResolvedValue({
    ok: true,
    data: {
      types: [
        { id: CLIENTS, label_plural: "Clients", label_singular: "Client" },
        { id: MATTERS, label_plural: "Matters", label_singular: "Matter" },
      ],
    },
  });
  svc.listScopesOfType.mockImplementation(async (_org: string, type: string) => ({
    ok: true,
    data: {
      scopes:
        type === CLIENTS
          ? [
              { id: GOLDEN_STATE, name: "Golden State Indemnity Co." },
              { id: MERIDIAN, name: "Meridian Risk Services" },
            ]
          : [],
    },
  }));
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

it("each step loads from the previous choice only, and the preview narrows at every step", async () => {
  await mount(EMPTY_SELECTION);
  // Nothing chosen: later steps say what they wait for, and nothing is loaded or previewed.
  expect(trigger("scopeType")?.disabled).toBe(true);
  expect(trigger("scopeType")?.textContent).toContain("Choose an organization first");
  expect(svc.listScopeTypesForOrganization).not.toHaveBeenCalled();
  expect(compareProps).toHaveLength(0);

  // 1. Organization → its scope types; preview: the organization with nothing selected.
  await act(async () => setSelection({ ...EMPTY_SELECTION, org: CASTELLANO }));
  await act(async () => undefined);
  expect(svc.listScopeTypesForOrganization).toHaveBeenCalledWith(CASTELLANO);
  expect(svc.listScopesOfType).not.toHaveBeenCalled();
  expect(lastCompare()).toMatchObject({ scopeIds: [], organizationId: CASTELLANO });
  expect(trigger("scope")?.textContent).toContain("Choose a scope type first");

  // 2. Scope type → that type's scopes; preview: every scope of the type.
  await act(async () => setSelection({ ...EMPTY_SELECTION, org: CASTELLANO, scopeType: CLIENTS }));
  await act(async () => undefined);
  expect(svc.listScopesOfType).toHaveBeenCalledWith(CASTELLANO, CLIENTS);
  expect(svc.listContextItems).not.toHaveBeenCalled();
  expect(lastCompare()).toMatchObject({ scopeIds: [GOLDEN_STATE, MERIDIAN], organizationId: CASTELLANO });

  // 3. Scope → that scope's items and values; preview: that one scope.
  await act(async () =>
    setSelection({ org: CASTELLANO, scopeType: CLIENTS, scope: MERIDIAN, item: null }),
  );
  await act(async () => undefined);
  expect(svc.listContextItems).toHaveBeenCalledWith(CLIENTS);
  expect(svc.listContextValues).toHaveBeenCalledWith(MERIDIAN);
  expect(lastCompare()).toMatchObject({ scopeIds: [MERIDIAN], focus: undefined });

  // 4. Context item → the value, read-only, and the preview narrowed to the item.
  await act(async () =>
    setSelection({ org: CASTELLANO, scopeType: CLIENTS, scope: MERIDIAN, item: PHONE }),
  );
  await act(async () => undefined);
  expect(host.querySelector("[data-inspector-value]")?.getAttribute("data-inspector-value")).toBe(
    "(619) 555-0177",
  );
  expect(lastCompare()).toMatchObject({
    scopeIds: [MERIDIAN],
    focus: { itemId: PHONE, key: "contact_phone", label: "Contact Phone" },
  });
  // There is no free-text box anywhere: every step is a choice.
  expect(host.querySelector("input, textarea")).toBeNull();
});

it("a scope type with no scopes says so and previews nothing past it", async () => {
  await mount({ ...EMPTY_SELECTION, org: CASTELLANO, scopeType: MATTERS });
  expect(trigger("scope")?.textContent).toContain("This scope type has no scopes yet");
  expect(trigger("scope")?.disabled).toBe(true);
  expect(compareProps).toHaveLength(0);
});

it("?scope= alone back-fills the organization and type from the scope itself", async () => {
  svc.getScopeHome.mockResolvedValue({
    ok: true,
    data: {
      scope: {
        id: MERIDIAN,
        name: "Meridian Risk Services",
        organization_id: CASTELLANO,
        scope_type_id: CLIENTS,
      },
    },
  });
  await mount({ ...EMPTY_SELECTION, scope: MERIDIAN });
  await act(async () => undefined);
  expect(svc.getScopeHome).toHaveBeenCalledWith(MERIDIAN);
  expect(writes[0]).toEqual({
    next: { org: CASTELLANO, scopeType: CLIENTS, scope: MERIDIAN, item: null },
    replace: true,
  });
  expect(lastCompare()).toMatchObject({ scopeIds: [MERIDIAN], organizationId: CASTELLANO });
  expect(trigger("org")?.textContent).toContain("Castellano & Reyes, LLP");
});

it("a scope that is not shared with you says so in words", async () => {
  svc.getScopeHome.mockResolvedValue({ ok: true, data: { scope: null } });
  await mount({ ...EMPTY_SELECTION, scope: MERIDIAN });
  await act(async () => undefined);
  expect(host.textContent).toContain("This scope was not found, or it has not been shared with you");
  expect(compareProps).toHaveLength(0);
});
