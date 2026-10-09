/**
 * The scope tagger never narrows by the ACTIVE organization (active-org-is-never-a-list-filter law).
 *
 * Controlled (filter) mode with no `organizationId` offers the scope types of EVERY organization the
 * person belongs to, the org as a label. With an `organizationId` it offers that org's types only.
 * The component reads no active-organization selector at all: the harness provides none, so a
 * regression that reaches for `selectActiveOrganizationId` (and its org narrowing) fails here.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

type Scope = { id: string; name: string };
type ScopeType = {
  id: string;
  organization_id: string;
  label_singular: string;
  label_plural: string;
  icon: string;
  color: string;
  scopes: Scope[];
};
const typeOf = (id: string, org: string, label: string, scopes: Scope[]): ScopeType => ({
  id,
  organization_id: org,
  label_singular: label,
  label_plural: `${label}s`,
  icon: "Folder",
  color: "#888",
  scopes,
});
const ORG_A = typeOf("t-a", "org-a", "Client", [{ id: "s-a", name: "Acme Dental" }]);
const ORG_B = typeOf("t-b", "org-b", "Client", [{ id: "s-b", name: "Harbor Dental" }]);

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
}));
// The chat package reads these hooks through its own module (P3): one double covers both.
jest.mock("@ai-matrx/chat/store/hooks", () => jest.requireMock("@/lib/redux/hooks"));
jest.mock("@/features/scopes/redux/selectors/tree", () => ({
  selectTreeStatus: () => "ready",
  selectAllScopeTypesFlat: () => [ORG_A, ORG_B],
  selectOrganizations: () => ({ "org-a": { id: "org-a", name: "Org A" }, "org-b": { id: "org-b", name: "Org B" } }),
  makeSelectScopeTypesForOrg: () => (_: unknown, orgId: string | null) =>
    orgId === "org-a" ? [ORG_A] : orgId === "org-b" ? [ORG_B] : [],
}));
jest.mock("@/features/scopes/hooks/useScopeTree", () => ({ useScopeTree: () => ({ error: null, refresh: jest.fn() }) }));
jest.mock("@/features/scopes/hooks/useEntityScopes", () => ({
  useEntityScopes: () => ({ scopeIds: [], setScopes: jest.fn(async () => ({ ok: true })) }),
}));
jest.mock("@/features/organizations/resource-catalogue", () => ({ getEntry: () => null, moduleKey: () => "" }));
jest.mock("@/features/organizations/orgModuleSettings", () => ({ getOrgModuleSetting: jest.fn() }));
jest.mock("@ai-matrx/design-system", () => ({ ...jest.requireActual("@ai-matrx/design-system"), ReadFailure: () => null }));
jest.mock("@/lib/toast", () => ({ toast: { error: jest.fn() } }));
jest.mock("@ai-matrx/icons", () => ({ DynamicIcon: () => null }));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

test("controlled with no organization offers every organization's scopes, the org as a label", async () => {
  const { EntityScopeTagger } = await import("../EntityScopeTagger");
  await act(async () => {
    root.render(<EntityScopeTagger value={[]} onChange={() => undefined} variant="sidebar" showHeader={false} />);
  });
  const text = container.textContent ?? "";
  expect(text).toContain("Acme Dental");
  expect(text).toContain("Harbor Dental");
  // Two orgs share the type name "Client": the org rides as a label so they can be told apart.
  expect(text).toContain("Org A");
  expect(text).toContain("Org B");
});

test("controlled with an organization offers that organization's scopes only", async () => {
  const { EntityScopeTagger } = await import("../EntityScopeTagger");
  await act(async () => {
    root.render(
      <EntityScopeTagger value={[]} onChange={() => undefined} organizationId="org-a" variant="sidebar" showHeader={false} />,
    );
  });
  const text = container.textContent ?? "";
  expect(text).toContain("Acme Dental");
  expect(text).not.toContain("Harbor Dental");
});

test("uncontrolled with no organization refuses honestly instead of borrowing the active one", async () => {
  const { EntityScopeTagger } = await import("../EntityScopeTagger");
  await act(async () => {
    root.render(<EntityScopeTagger entityType="note" entityId="n1" organizationId={null} />);
  });
  const text = container.textContent ?? "";
  expect(text).toContain("no organization yet");
  expect(text).not.toContain("Acme Dental");
});
