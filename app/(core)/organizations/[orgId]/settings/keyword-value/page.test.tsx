import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import OrgValueSettingsPage from "./page";
import { useResolvedOrganization } from "@/features/organizations/hooks";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let mockRouteOrg = "titanium";

jest.mock("next/navigation", () => ({
  useParams: () => ({ orgId: mockRouteOrg }),
}));

jest.mock("@/features/organizations/hooks", () => ({
  useResolvedOrganization: jest.fn(),
}));

jest.mock(
  "@/features/marketing/seo/value-system/settings/ValueSettingsEditor",
  () => ({
    ValueSettingsEditor: ({ scope, id }: { scope: string; id: string }) => (
      <div data-editor="value" data-scope={scope} data-organization-id={id} />
    ),
  }),
);

jest.mock(
  "@/features/marketing/seo/value-system/settings/AutonomyModesEditor",
  () => ({
    AutonomyModesEditor: ({ scope, id }: { scope: string; id: string }) => (
      <div
        data-editor="autonomy"
        data-scope={scope}
        data-organization-id={id}
      />
    ),
  }),
);

jest.mock(
  "@/features/organizations/components/OrganizationAccessGate",
  () => ({
    OrganizationAccessGate: ({ orgSlugOrId }: { orgSlugOrId: string }) => (
      <div data-access-gate={orgSlugOrId} />
    ),
  }),
);

const mockUseResolvedOrganization = jest.mocked(useResolvedOrganization);

describe("organization keyword-value route identity", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it.each([
    ["titanium", "f9cb3e35-2a65-4f2a-8525-088d6551071c"],
    ["all-green-recycling", "5dc930e9-bd65-44a1-8369-af773f6e1a5b"],
  ])("passes the resolved UUID for the %s route to both UUID-typed RPC editors", (routeOrg, resolvedId) => {
    mockRouteOrg = routeOrg;
    mockUseResolvedOrganization.mockReturnValue({
      organization: {
        id: resolvedId,
        name: routeOrg,
        abbreviation: routeOrg.slice(0, 2).toUpperCase(),
        slug: routeOrg,
        createdAt: "2026-09-12T00:00:00Z",
        updatedAt: "2026-09-12T00:00:00Z",
        isPersonal: false,
      },
      organizationId: resolvedId,
      role: "admin",
      isMember: true,
      loading: false,
      error: null,
      refresh: jest.fn(),
    });

    act(() => root.render(<OrgValueSettingsPage />));

    expect(mockUseResolvedOrganization).toHaveBeenCalledWith(routeOrg);
    const editors = container.querySelectorAll("[data-editor]");
    expect(editors).toHaveLength(2);
    for (const editor of editors) {
      expect(editor.getAttribute("data-scope")).toBe("org");
      expect(editor.getAttribute("data-organization-id")).toBe(resolvedId);
      expect(editor.getAttribute("data-organization-id")).not.toBe(routeOrg);
    }
  });
});
