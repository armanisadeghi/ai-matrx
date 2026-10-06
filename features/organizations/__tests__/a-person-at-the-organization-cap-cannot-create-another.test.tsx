/**
 * A PERSON AT THE ORGANIZATION CAP CANNOT CREATE ANOTHER (Arman, 2026-10-03).
 *
 * The cap is a knob (`organizations.max_memberships_per_person`, default 5)
 * lifted by the plan capability `platform.organizations`; it is enforced in
 * the interface only. This pins:
 *   1. the arithmetic — knob default, plan lift (most generous wins), the
 *      at-cap / over-cap verdicts, and "unknown cap never refuses";
 *   2. both create doors — the create-organization dialog and the tools-grid
 *      creation window — show the refusal instead of a form at the cap, and
 *      the form below it.
 */

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let CAP = { count: 3, cap: 5 as number | null, atCap: false, overCap: false, ready: true };
jest.mock("@/features/organizations/limits/useOrganizationCap", () => ({
  useOrganizationCap: () => CAP,
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
jest.mock("@/features/organizations/service", () => ({ createOrganization: jest.fn() }));
jest.mock("@/features/organizations/hooks", () => ({
  useSlugAvailability: () => ({ available: true, checking: false }),
}));
jest.mock("@/components/official/ImageAssetUploader", () => ({ ImageAssetUploader: () => null }));
jest.mock("@/components/official/ProTextarea", () => ({ ProTextarea: () => <textarea /> }));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));
jest.mock("@/lib/toast", () => ({ toast: { error: jest.fn(), success: jest.fn(), info: jest.fn() } }));
jest.mock("@/features/agent-context/hooks/useHierarchy", () => ({
  useCreateOrganization: () => ({ mutateAsync: jest.fn() }),
  useCreateProject: () => ({ mutateAsync: jest.fn() }),
  useCreateTask: () => ({ mutateAsync: jest.fn() }),
}));
jest.mock("@/lib/redux/hooks", () => ({ useAppDispatch: () => jest.fn() }));
jest.mock("@/features/window-panels/WindowPanel", () => ({
  WindowPanel: ({ children, footerRight }: { children: React.ReactNode; footerRight: React.ReactNode }) => (
    <div>
      {children}
      {footerRight}
    </div>
  ),
}));
jest.mock("@/features/context-menu-v3/NonEditableContextMenu", () => ({
  NonEditableContextMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import {
  organizationCapVerdict,
  resolveOrganizationCap,
} from "@/features/organizations/limits/organizationCap";
import { CreateOrgModal } from "@/features/organizations/components/CreateOrgModal";
import HierarchyCreationWindow from "@/features/window-panels/windows/context-scopes/HierarchyCreationWindow";

const REFUSAL = "Organization limit reached";

function render(ui: React.ReactElement): () => void {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(ui);
  });
  return () => {
    act(() => root.unmount());
    host.remove();
  };
}

describe("the organization cap arithmetic", () => {
  it("is the knob default when no plan lifts it", () => {
    expect(resolveOrganizationCap(5, [])).toBe(5);
    expect(resolveOrganizationCap(5, [null, 3])).toBe(5);
  });

  it("is lifted by the most generous plan among the person's organizations", () => {
    expect(resolveOrganizationCap(5, [10, null, 25])).toBe(25);
  });

  it("is unknown until the knob resolves, and an unknown cap never refuses", () => {
    expect(resolveOrganizationCap(undefined, [25])).toBeNull();
    expect(organizationCapVerdict(400, null)).toMatchObject({ atCap: false, overCap: false });
  });

  it("refuses at the cap and reminds only above it", () => {
    expect(organizationCapVerdict(4, 5)).toMatchObject({ atCap: false, overCap: false });
    expect(organizationCapVerdict(5, 5)).toMatchObject({ atCap: true, overCap: false });
    expect(organizationCapVerdict(6, 5)).toMatchObject({ atCap: true, overCap: true });
  });
});

describe("every create-organization door honours the cap", () => {
  afterEach(() => {
    CAP = { count: 3, cap: 5, atCap: false, overCap: false, ready: true };
  });

  it("the create dialog shows its form below the cap", () => {
    const cleanup = render(<CreateOrgModal isOpen onClose={() => undefined} />);
    expect(document.body.textContent).toContain("Organization Name");
    expect(document.body.textContent).not.toContain(REFUSAL);
    cleanup();
  });

  it("the create dialog refuses at the cap, with no form", () => {
    CAP = { count: 5, cap: 5, atCap: true, overCap: false, ready: true };
    const cleanup = render(<CreateOrgModal isOpen onClose={() => undefined} />);
    expect(document.body.textContent).toContain(REFUSAL);
    expect(document.body.textContent).not.toContain("Organization Name");
    cleanup();
  });

  it("the tools-grid creation window refuses at the cap", () => {
    CAP = { count: 7, cap: 5, atCap: true, overCap: true, ready: true };
    const cleanup = render(
      <HierarchyCreationWindow isOpen onClose={() => undefined} data={{ entityType: "organization" }} />,
    );
    expect(document.body.textContent).toContain(REFUSAL);
    expect(document.body.querySelector("input")).toBeNull();
    cleanup();
  });

  it("the tools-grid creation window still creates projects at the cap", () => {
    CAP = { count: 7, cap: 5, atCap: true, overCap: true, ready: true };
    const cleanup = render(
      <HierarchyCreationWindow
        isOpen
        onClose={() => undefined}
        data={{ entityType: "project", presetContext: { organization_id: "org-1" } }}
      />,
    );
    expect(document.body.textContent).not.toContain(REFUSAL);
    expect(document.body.querySelector("input")).not.toBeNull();
    cleanup();
  });
});
