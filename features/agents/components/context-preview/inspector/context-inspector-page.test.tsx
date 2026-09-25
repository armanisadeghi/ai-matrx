/**
 * The page shape (lane CONTEXT-INSPECTOR-GUIDED). Fails on the old page, which
 * was a grid of free-text boxes ("Scope type slug", "Scope slug", "Context-item
 * key", "Scope id", "Agent id") plus Tier / Serializer variation / Clearance
 * selects and a Render button, none of which knew about the others.
 *
 * The page renders the platform's Miller Columns (lane CONTEXT-INSPECTOR-3 —
 * never a hand-rolled row of pickers), reads the selection from the address
 * and writes it back through the URL-state door — and an old `?scope=<id>` link
 * is filled in from the person's scope tree (organization, type and scope
 * columns).
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

let search = "";
jest.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
}));
jest.mock("@/lib/url-state/addressWithoutNavigating", () => ({
  currentPathWithSearch: (s: string) => `/administration/scopes-context/context-inspector?${s}`,
  pushAddressWithoutNavigating: jest.fn(),
  replaceAddressWithoutNavigating: jest.fn(),
}));
const AI_MATRX = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";
const APPS = "5155b79c-4c54-4694-b644-2e21ea6833b7";
const MATRX_FRONTEND = "2ba5cb52-9530-4682-a12c-3ededff23c2c";
jest.mock("@/features/scopes/components/active-context/quick-pick/engine", () => {
  const actual = jest.requireActual("@/features/scopes/components/active-context/quick-pick/engine");
  const org = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";
  const type = "5155b79c-4c54-4694-b644-2e21ea6833b7";
  return {
    ...actual,
    useUniverse: () => ({
      orgs: [
        {
          id: org,
          name: "AI Matrx",
          scope_types: [
            {
              id: type,
              organization_id: org,
              label_singular: "App",
              label_plural: "Apps",
              icon: "app-window",
              color: "blue",
              max_assignments_per_entity: null,
              sort_order: 1,
              parent_type_id: null,
              default_variable_keys: [],
              scopes: [
                {
                  id: "2ba5cb52-9530-4682-a12c-3ededff23c2c",
                  scope_type_id: type,
                  organization_id: org,
                  name: "Matrx Frontend",
                  description: "",
                  parent_scope_id: null,
                  settings: {},
                },
              ],
            },
          ],
        },
      ],
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
  fetchTypeItems: jest.fn(async () => []),
  fetchAssignableProjects: jest.fn(async () => []),
  fetchAssignableTasks: jest.fn(async () => []),
}));
jest.mock("@/features/scopes/service/scopesService", () => ({
  scopesService: {
    listScopeTypesForOrganization: jest.fn(async () => ({ ok: true, data: { types: [] } })),
    listScopesOfType: jest.fn(async () => ({ ok: true, data: { scopes: [] } })),
    getScopeHome: jest.fn(async () => ({
      ok: true,
      data: {
        scope: {
          id: "2ba5cb52-9530-4682-a12c-3ededff23c2c",
          name: "Matrx Frontend",
          organization_id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
          scope_type_id: "5155b79c-4c54-4694-b644-2e21ea6833b7",
        },
      },
    })),
    listContextItems: jest.fn(async () => ({ ok: true, data: { items: [] } })),
    listContextValues: jest.fn(async () => ({ ok: true, data: { values: [] } })),
  },
}));
jest.mock("@/features/agents/components/context-preview/ContextCompareView", () => ({
  ContextCompareView: () => <div data-compare-mock />,
}));

import { replaceAddressWithoutNavigating } from "@/lib/url-state/addressWithoutNavigating";
import ContextInspectorPage from "@/app/(admin)/administration/scopes-context/context-inspector/page";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("is Miller Columns — no hand-rolled pickers, no slug boxes, no tier, no Render button", async () => {
  search = "";
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => root.render(<ContextInspectorPage />));
  expect(host.querySelector("[data-inspector-step]")).toBeNull();
  expect(host.querySelector('[role="combobox"]')).toBeNull();
  const columns = host.textContent ?? "";
  expect(columns).toContain("Organizations");
  expect(columns).toContain("Scope types");
  expect(columns).not.toMatch(/Projects|Tasks/);
  expect(host.querySelector("input, textarea")).toBeNull();
  expect(columns).not.toMatch(/Render context|Serializer variation|Tier A|Scope type slug/);
  await act(async () => root.unmount());
});

it("an old ?scope= link back-fills the organization, type and scope columns through the URL-state door", async () => {
  search = `scope=${MATRX_FRONTEND}`;
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => root.render(<ContextInspectorPage />));
  await act(async () => undefined);
  expect(replaceAddressWithoutNavigating).toHaveBeenCalledWith(
    `/administration/scopes-context/context-inspector?org=${AI_MATRX}&scopeType=${APPS}&scope=${MATRX_FRONTEND}`,
  );
  // The address is the selection: once it carries the back-fill, the three columns show it.
  search = `org=${AI_MATRX}&scopeType=${APPS}&scope=${MATRX_FRONTEND}`;
  await act(async () => root.render(<ContextInspectorPage />));
  const pressed = [...host.querySelectorAll('button[aria-pressed="true"]')].map((b) => b.textContent);
  expect(pressed).toEqual(["AI Matrx", "Apps", "Matrx Frontend"]);
  await act(async () => root.unmount());
});
