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
jest.mock("../service", () => ({ fetchKits: (...args: unknown[]) => fetchKits(...args) }));
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

describe("KitGallery with no active workspace (RC-B12 r13)", () => {
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

  it("shows the workspace picker, never an endless 'Looking for kits…'", async () => {
    orgState = "required";
    await act(async () => {
      root.render(<KitGallery kits={[]} error={null} />);
    });
    const text = host.textContent ?? "";
    expect(text).not.toContain("Looking for kits");
    expect(host.querySelector('[data-testid="org-notice"]')?.textContent).toContain("required: Pick a workspace");
    expect(fetchKits).not.toHaveBeenCalled();
  });

  it("with a workspace, reads that workspace's kits", async () => {
    orgState = "ready";
    await act(async () => {
      root.render(<KitGallery kits={[]} error={null} />);
    });
    expect(fetchKits).toHaveBeenCalledWith(expect.anything(), "org-1");
    expect(host.querySelector('[data-testid="org-notice"]')).toBeNull();
    expect(host.textContent).toContain("None yet.");
  });
});
