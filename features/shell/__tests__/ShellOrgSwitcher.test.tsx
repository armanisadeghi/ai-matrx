/**
 * THE ONE ORGANIZATION CONTROL — every organization state shows on it.
 *
 * Owner, 2026-09-30: the sidebar's organization slot is "the ONLY CANONICAL
 * org selector for the sidebar and header … any problems related to org needs
 * to show with this one". It replaced the header chip and the avatar menu's
 * Organization group, whose behavioural tests went with them; this file
 * carries their states forward onto the control that owns them now:
 *
 *   1. none chosen → asks "Choose organization", ringed — except on an
 *      /administration page (the admin seat never acts as itself) and on an
 *      object page that names its own organization;
 *   2. chosen → the organization's abbreviation (its logo when it has one);
 *   3. the memberships read failed → a red mark and a label that says so;
 *   4. the page's object lives in another of the person's organizations → a
 *      dot, and the picker opens with a one-click switch to it;
 *   5. an object in an organization she is not in → named, quietly.
 *
 * PROVEN FAILING BEFORE PASSING: drop `&& !adminSeat` from `asking` → case
 * "never asks on an admin page" RED; drop `loadFailed ||` from the mark →
 * case 3 RED; drop the `viewingIn` header → case 5 RED.
 */

import React, { act, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Org = { id: string; name: string; abbreviation: string; logo_url?: string | null };

let picker: {
  activeOrgId: string | null;
  activeOrgName: string | null;
  organizations: Org[];
  promptForOrg: boolean;
  loadFailed: boolean;
};
let objectOrganization: {
  organizationId: string;
  name: string | null;
  shownByPage: boolean;
  member?: boolean | null;
} | null = null;
let pathname = "/notes";
const dispatch = jest.fn();

jest.mock("next/navigation", () => ({ usePathname: () => pathname }));
jest.mock("@/lib/redux/hooks", () => ({ useAppDispatch: () => dispatch }));
jest.mock("@/lib/redux/thunks/activeOrgBootstrap", () => ({
  chooseActiveOrganization: (payload: { id: string; name: string }) => ({ type: "choose", payload }),
}));
jest.mock("@/features/organizations/hooks/useActiveOrganizationPicker", () => ({
  useActiveOrganizationPicker: () => picker,
}));
jest.mock("@/features/shell/pageObjectOrganization", () => ({
  usePageObjectOrganization: () => objectOrganization,
}));
// The picker opener is the canonical one; here it renders its header and trigger in place.
jest.mock("@/features/organizations/components/OrganizationPickerPopover", () => ({
  OrganizationPickerPopover: ({ trigger, header }: { trigger: ReactElement; header?: ReactNode }) => (
    <div>
      {trigger}
      <div data-testid="picker-header">{header}</div>
    </div>
  ),
}));
jest.mock("@ai-matrx/design-system", () => ({
  SelectChevron: () => null,
  OrganizationMark: ({ name, abbreviation, logoUrl }: { name: string; abbreviation?: string | null; logoUrl?: string | null }) =>
    logoUrl ? <span data-testid="org-logo">{name}</span> : <span data-slot="organization-mark">{abbreviation || name.slice(0, 1)}</span>,
}));
jest.mock("@/components/navigation/AppLink", () => ({
  __esModule: true,
  default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ShellOrgSwitcher } = require("../components/account-rail/ShellOrgSwitcher") as typeof import("../components/account-rail/ShellOrgSwitcher");

const ACME: Org = { id: "org-acme", name: "Acme Robotics", abbreviation: "ACR" };
const BETA: Org = { id: "org-beta", name: "Beta Labs", abbreviation: "BL" };

let host: HTMLElement;
let root: Root;

function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root.render(<ShellOrgSwitcher />);
  });
}

const trigger = () => host.querySelector<HTMLButtonElement>("[data-shell-org-switcher]")!;

beforeEach(() => {
  picker = { activeOrgId: null, activeOrgName: null, organizations: [ACME, BETA], promptForOrg: false, loadFailed: false };
  objectOrganization = null;
  pathname = "/notes";
});

afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = "";
  jest.clearAllMocks();
});

describe("ShellOrgSwitcher — every organization state shows on the one control", () => {
  it("asks for an organization, ringed, when boot answered with none", () => {
    picker = { ...picker, promptForOrg: true };
    mount();
    expect(trigger().textContent).toContain("Choose organization");
    expect(trigger().getAttribute("aria-label")).toBe("Choose an organization");
    expect(host.querySelector(".ring-primary")).not.toBeNull();
  });

  it("while the name is still loading, shows a skeleton - never the word Organization or 'no organization'", () => {
    picker = { ...picker, activeOrgId: null, activeOrgName: null, promptForOrg: false };
    mount();
    expect(trigger().querySelector("[data-org-name-skeleton]")).not.toBeNull();
    expect(trigger().textContent?.trim()).toBe("");
    expect(host.textContent).not.toMatch(/no organization/i);
    expect(host.textContent).not.toContain("Pick one below");
  });

  it("never asks on an admin page — the admin seat never acts as itself", () => {
    picker = { ...picker, promptForOrg: true };
    pathname = "/administration/users/usage";
    mount();
    expect(trigger().textContent).not.toContain("Choose organization");
    expect(host.querySelector(".ring-primary")).toBeNull();
  });

  it("names the chosen organization with its abbreviation", () => {
    picker = { ...picker, activeOrgId: ACME.id, activeOrgName: ACME.name };
    mount();
    expect(trigger().textContent).toContain("ACR");
    expect(trigger().textContent).toContain("Acme Robotics");
    expect(trigger().getAttribute("aria-label")).toBe("Organization: Acme Robotics. Change organization");
  });

  it("draws the organization's own logo when it has one", () => {
    picker = {
      ...picker,
      activeOrgId: ACME.id,
      activeOrgName: ACME.name,
      organizations: [{ ...ACME, logo_url: "https://example.test/acme.png" }, BETA],
    };
    mount();
    expect(host.querySelector('[data-testid="org-logo"]')).not.toBeNull();
    expect(trigger().textContent).not.toContain("ACR");
  });

  it("says so when the memberships could not be read", () => {
    picker = { ...picker, activeOrgId: ACME.id, activeOrgName: ACME.name, loadFailed: true };
    mount();
    expect(host.querySelector("[data-org-load-failed]")).not.toBeNull();
    expect(trigger().getAttribute("aria-label")).toContain("could not be loaded");
  });

  it("offers a one-click switch when the page's object lives in another of her organizations", () => {
    picker = { ...picker, activeOrgId: ACME.id, activeOrgName: ACME.name };
    objectOrganization = { organizationId: BETA.id, name: BETA.name, shownByPage: false, member: true };
    mount();
    expect(host.querySelector("[data-org-offer-dot]")).not.toBeNull();
    const offer = host.querySelector<HTMLButtonElement>("[data-page-object-organization]")!;
    expect(offer.textContent).toContain("Switch to Beta Labs");
    act(() => offer.click());
    expect(dispatch).toHaveBeenCalledWith({ type: "choose", payload: { id: BETA.id, name: BETA.name } });
  });

  it("names, quietly, an object in an organization she is not in", () => {
    picker = { ...picker, activeOrgId: ACME.id, activeOrgName: ACME.name };
    objectOrganization = { organizationId: "org-x", name: "Outside Co", shownByPage: false, member: false };
    mount();
    expect(host.querySelector("[data-org-offer-dot]")).toBeNull();
    expect(host.querySelector("[data-page-object-organization-viewing]")?.textContent).toContain("Outside Co");
  });

  it("an object page that names its own organization asks nothing", () => {
    picker = { ...picker, promptForOrg: true };
    objectOrganization = { organizationId: BETA.id, name: BETA.name, shownByPage: true, member: true };
    mount();
    expect(trigger().textContent).not.toContain("Choose organization");
    expect(host.querySelector("[data-page-object-organization]")).toBeNull();
  });
});
