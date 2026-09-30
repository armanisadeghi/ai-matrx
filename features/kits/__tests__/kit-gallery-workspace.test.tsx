/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { OrganizationState } from "@/features/organizations/useOrganizationRequired";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let orgState: OrganizationState = "required";
const fetchKits = jest.fn();

jest.mock("@/features/organizations/useOrganizationRequired", () => ({
  useOrganizationRequired: () => ({
    organizationId: orgState === "ready" ? "org-1" : null,
    organizationState: orgState,
    retry: jest.fn(),
  }),
}));
jest.mock("@/features/organizations/components/OrganizationRequiredNotice", () => ({
  OrganizationContextNotice: ({ state, title }: { state: string; title?: string }) =>
    state === "ready" ? null : <div data-testid="org-notice">{`${state}: ${title ?? ""}`}</div>,
}));
jest.mock("@/features/organizations/hooks", () => ({
  useUserOrganizations: () => ({ organizations: [] }),
}));
jest.mock("@/features/overlays/openers/saveKitDialog", () => ({
  useOpenSaveKitDialog: () => jest.fn(),
}));
jest.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));
jest.mock("../service", () => ({ fetchAccessibleKits: (...args: unknown[]) => fetchKits(...args) }));
jest.mock("@/features/shell/components/header/PageHeader", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("@/features/shell/components/header/variants/variants/HeaderStructured", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("../components/KitCard", () => ({ KitCard: () => null }));

import { KitGallery } from "../components/KitGallery";

describe("KitGallery lists by access, never by the selected organization", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    fetchKits.mockReset();
    fetchKits.mockResolvedValue({ kits: [], error: null });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("with NO organization selected, still reads every kit the person can reach", async () => {
    orgState = "required";
    await act(async () => {
      root.render(<KitGallery kits={[]} error={null} platformOrganizationId="sys-org" />);
    });
    expect(host.querySelector('[data-testid="org-notice"]')).toBeNull();
    expect(fetchKits).toHaveBeenCalledWith(expect.anything(), "sys-org");
    expect(host.textContent).toContain("None yet.");
  });

  it("with an organization selected, the read is the same — the selection never narrows it", async () => {
    orgState = "ready";
    await act(async () => {
      root.render(<KitGallery kits={[]} error={null} platformOrganizationId="sys-org" />);
    });
    expect(fetchKits).toHaveBeenCalledTimes(1);
    expect(fetchKits).toHaveBeenCalledWith(expect.anything(), "sys-org");
    expect(host.textContent).toContain("None yet.");
  });
});
