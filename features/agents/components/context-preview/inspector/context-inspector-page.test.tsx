/**
 * The page shape (lane CONTEXT-INSPECTOR-GUIDED). Fails on the old page, which
 * was a grid of free-text boxes ("Scope type slug", "Scope slug", "Context-item
 * key", "Scope id", "Agent id") plus Tier / Serializer variation / Clearance
 * selects and a Render button, none of which knew about the others.
 *
 * The page now renders ONE ordered row of four pickers, reads the selection from
 * the address and writes it back through the URL-state door — and an old
 * `?scope=<id>` link is filled in from the scope.
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
jest.mock("@/features/organizations/hooks", () => ({
  useUserOrganizations: () => ({
    organizations: [{ id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b", name: "AI Matrx" }],
    loading: false,
    error: null,
  }),
}));
jest.mock("@/features/agents/components/context-preview/ContextCompareView", () => ({
  ContextCompareView: () => <div data-compare-mock />,
}));

import { replaceAddressWithoutNavigating } from "@/lib/url-state/addressWithoutNavigating";
import ContextInspectorPage from "@/app/(admin)/administration/scopes-context/context-inspector/page";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("is one ordered row of pickers — no slug boxes, no tier, no Render button", async () => {
  search = "";
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => root.render(<ContextInspectorPage />));
  const steps = [...host.querySelectorAll("[data-inspector-step]")].map((el) =>
    el.getAttribute("data-inspector-step"),
  );
  expect(steps).toEqual(["org", "scopeType", "scope", "item"]);
  expect(host.querySelector("input, textarea")).toBeNull();
  expect(host.textContent).not.toMatch(/Render context|Serializer variation|Tier A|Scope type slug/);
  await act(async () => root.unmount());
});

it("an old ?scope= link fills in its organization and type through the URL-state door", async () => {
  search = "scope=2ba5cb52-9530-4682-a12c-3ededff23c2c";
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => root.render(<ContextInspectorPage />));
  await act(async () => undefined);
  expect(replaceAddressWithoutNavigating).toHaveBeenCalledWith(
    "/administration/scopes-context/context-inspector?org=5dc930e9-bd65-44a1-8369-af773f6e1a5b&scopeType=5155b79c-4c54-4694-b644-2e21ea6833b7&scope=2ba5cb52-9530-4682-a12c-3ededff23c2c",
  );
  await act(async () => root.unmount());
});
