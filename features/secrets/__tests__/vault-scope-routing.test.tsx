/**
 * THE VAULT SCOPE ROUTING GUARD.
 *
 * `VaultWorkspace` is the SUT; `fetchVaultItems` is the boundary beneath it
 * (the real `useVault` runs). The forcing output is the SCOPE the workspace
 * asks the vault service for after each tab click — nothing else in the
 * fixture can produce it.
 *
 * Two breaks this must catch forever:
 *  1. The personal scopes following the active organization. "Mine" and
 *     "Shared with me" are the person's own credentials; they must load with
 *     NO organization selected at all.
 *  2. The Organization tab picking a membership nobody chose. Until
 *     d30f8934e0 it fell back to `availableOrganizations[0]`, so a person who
 *     had selected their second organization was shown — and could write to —
 *     the first one's credentials. The fixture gives two memberships and
 *     selects the SECOND, so a first-membership fallback lands on the wrong
 *     id observably; with nothing selected the tab must refuse out loud and
 *     change no scope.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { normalizeWireItem } from "../types";
import type { VaultItem, VaultScope } from "../types";

const fetchVaultItems = jest.fn();
const toastError = jest.fn();
let selectedOrganizationId: string | null = null;

jest.mock("../vault-service", () => ({
  fetchVaultItems: (...args: unknown[]) => fetchVaultItems(...args),
  fetchCredentialDefinitions: jest.fn(async () => []),
  fetchVaultGrants: jest.fn(async () => []),
  fetchVaultAudit: jest.fn(async () => []),
  addVaultAttachment: jest.fn(),
  addVaultField: jest.fn(),
  addVaultGrant: jest.fn(),
  assignVaultItem: jest.fn(),
  createVaultItem: jest.fn(),
  deleteVaultAttachment: jest.fn(),
  deleteVaultField: jest.fn(),
  deleteVaultItem: jest.fn(),
  downloadVaultAttachment: jest.fn(),
  forkVaultItem: jest.fn(),
  giveVaultItemOwnership: jest.fn(),
  importVaultEnv: jest.fn(),
  removeVaultGrant: jest.fn(),
  replaceVaultAttachment: jest.fn(),
  rotateVaultItem: jest.fn(),
  setVaultAccessMode: jest.fn(),
  transferVaultItem: jest.fn(),
  updateVaultAttachment: jest.fn(),
  updateVaultFieldMetadata: jest.fn(),
  updateVaultFieldValue: jest.fn(),
  updateVaultGrant: jest.fn(),
  updateVaultItem: jest.fn(),
}));

jest.mock("@/lib/toast", () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
  },
}));

jest.mock("@/lib/redux/hooks", () => ({
  // The workspace reads exactly one selector, `selectOrganizationId`; running
  // it against the shape the real appContext slice holds keeps the selector
  // itself real.
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ appContext: { organization_id: selectedOrganizationId } }),
}));

jest.mock("@/features/organizations/hooks", () => ({
  useUserOrganizations: () => ({
    organizations: [
      { id: "org-first", name: "First Org", isPersonal: false, role: "member" },
      {
        id: "org-selected",
        name: "Selected Org",
        isPersonal: false,
        role: "member",
      },
      { id: "org-personal", name: "Personal", isPersonal: true, role: "owner" },
    ],
    loading: false,
  }),
}));

jest.mock("@/hooks/use-media-query", () => ({
  useMediaQuery: () => true,
}));

import { VaultWorkspace } from "../components/VaultWorkspace";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/** One captured-shape row per scope, so the rendered list proves WHICH scope
 *  answered — not merely that something answered. */
const ROWS: Record<string, VaultItem[]> = {
  mine: [row("mine-row", "My Personal Login")],
  shared: [row("shared-row", "A Login Shared With Me")],
  "organization:org-first": [row("first-row", "First Org Login")],
  "organization:org-selected": [row("selected-row", "Selected Org Login")],
};

/** Built through the production normalizer, so the row carries every field the
 *  real read path materializes — never a hand-shaped partial. */
function row(id: string, displayName: string): VaultItem {
  return normalizeWireItem({
    id,
    display_name: displayName,
    definition_key: "website_login",
    definition_version: 1,
    status: "active",
    source: "manual",
    access_mode: "private",
    user_id: "user-1",
    organization_id: null,
    provider_key: null,
    description: null,
    tags: [],
    lifecycle: {},
    login_urls: ["https://example.com/login"],
    uri_match_mode: "domain",
    notes: null,
    non_secret_fields: [],
    browser_fill_enabled: true,
    fields: [],
    attachments: [],
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
  });
}

function scopeKey(scope: VaultScope): string {
  return scope.kind === "organization"
    ? `organization:${scope.organizationId}`
    : scope.kind;
}

// jsdom ships no matchMedia; the context menu's `useIsMobile` calls it during
// render. Desktop is the surface this guard is about.
if (typeof window.matchMedia !== "function") {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

let container: HTMLDivElement;
let root: Root;

async function mount(): Promise<void> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <VaultWorkspace principal={{ type: "user" }} presentation="full" />,
    );
  });
}

async function unmount(): Promise<void> {
  await act(async () => {
    root.unmount();
  });
  container.remove();
}

function clickScope(label: string): Promise<void> {
  const button = Array.from(container.querySelectorAll("button")).find((b) =>
    (b.textContent ?? "").includes(label),
  );
  if (!button) throw new Error(`No vault scope control labelled "${label}"`);
  return act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function requestedScopes(): string[] {
  return fetchVaultItems.mock.calls.map(([scope]: [VaultScope]) =>
    scopeKey(scope),
  );
}

describe("VaultWorkspace scope routing", () => {
  beforeEach(() => {
    fetchVaultItems.mockReset();
    toastError.mockReset();
    fetchVaultItems.mockImplementation(async (scope: VaultScope) => {
      const key = scopeKey(scope);
      if (!(key in ROWS)) throw new Error(`Unexpected vault scope: ${key}`);
      return ROWS[key];
    });
    selectedOrganizationId = null;
  });

  afterEach(async () => {
    await unmount();
  });

  it("loads the person's own credentials with no organization selected", async () => {
    selectedOrganizationId = null;
    await mount();

    expect(requestedScopes()).toEqual(["mine"]);
    expect(container.textContent).toContain("My Personal Login");

    await clickScope("Shared with me");
    expect(requestedScopes()).toEqual(["mine", "shared"]);
    expect(container.textContent).toContain("A Login Shared With Me");
    expect(container.textContent).not.toContain("My Personal Login");
  });

  it("refuses the Organization scope out loud when nothing is selected", async () => {
    selectedOrganizationId = null;
    await mount();

    await clickScope("Organization");

    // No second read, and the list still holds the person's own credentials —
    // the silent fallback to `availableOrganizations[0]` would have asked for
    // `organization:org-first` here.
    expect(requestedScopes()).toEqual(["mine"]);
    expect(container.textContent).toContain("My Personal Login");
    expect(container.textContent).not.toContain("First Org Login");
    expect(toastError).toHaveBeenCalledTimes(1);
    const [message] = toastError.mock.calls[0] as [string];
    expect(message).toMatch(/organization/i);
    expect(message).toMatch(/choose|select|pick/i);
  });

  it("loads the SELECTED organization's credentials, never the first membership", async () => {
    selectedOrganizationId = "org-selected";
    await mount();

    await clickScope("Organization");

    expect(requestedScopes()).toEqual(["mine", "organization:org-selected"]);
    expect(container.textContent).toContain("Selected Org Login");
    expect(container.textContent).not.toContain("First Org Login");
    expect(toastError).not.toHaveBeenCalled();
  });
});
