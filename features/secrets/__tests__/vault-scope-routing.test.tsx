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
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";

import { normalizeWireItem } from "../types";
import type { VaultItem, VaultScope } from "../types";

const fetchVaultItems = jest.fn();
const toastError = jest.fn();
let selectedOrganizationId: string | null = null;
let desktopWorkspace = true;

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
    selector({ appContext: { organization_id: selectedOrganizationId }, userAuth: { id: selectedActorId } }),
}));

let selectedActorId = "user-1";
const getBulk = jest.fn(async (..._args: unknown[]) => ({ ok: true, data: { items: [] } }));
const setFavorite = jest.fn(async (..._args: unknown[]) => ({ ok: true, data: null }));
const touch = jest.fn(async (..._args: unknown[]) => ({ ok: true, data: null }));
jest.mock("@/features/scopes/service/favoritesService", () => ({
  favoritesService: {
    getBulk: (...args: unknown[]) => getBulk(...args),
    setFavorite: (...args: unknown[]) => setFavorite(...args),
    touch: (...args: unknown[]) => touch(...args),
  },
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
  useMediaQuery: () => desktopWorkspace,
}));

import { VaultWorkspace } from "../components/VaultWorkspace";
import { VaultRouteWorkspaceStateProvider, VaultRouteWorkspaceStateBoundary } from "../components/VaultRouteWorkspaceState";

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
function row(
  id: string,
  displayName: string,
  createdAt = "2026-09-01T00:00:00.000Z",
  updatedAt = createdAt,
): VaultItem {
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
    created_at: createdAt,
    updated_at: updatedAt,
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

if (typeof HTMLElement.prototype.scrollIntoView !== "function") {
  HTMLElement.prototype.scrollIntoView = () => undefined;
}

let container: HTMLDivElement;
let root: Root;

async function mount(
  props: Partial<ComponentProps<typeof VaultWorkspace>> = {},
): Promise<void> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <VaultRouteWorkspaceStateProvider><VaultWorkspace principal={{ type: "user" }} presentation="full" {...props} /></VaultRouteWorkspaceStateProvider>,
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

async function chooseRenderedSort(label: string): Promise<void> {
  const sortTrigger = container.querySelector<HTMLButtonElement>(
    '[aria-label="Sort credentials"]',
  );
  if (!sortTrigger) throw new Error("Missing sort control");
  await act(async () => sortTrigger.click());
  const option = Array.from(document.querySelectorAll<HTMLElement>("[role=option]")).find(
    (candidate) => candidate.textContent === label,
  );
  if (!option) throw new Error(`Missing ${label} sort option`);
  await act(async () => option.click());
}

function renderedItemIds(): Array<string | null> {
  return Array.from(container.querySelectorAll("[data-vault-item-id]")).map((node) =>
    node.getAttribute("data-vault-item-id"),
  );
}

describe("VaultWorkspace scope routing", () => {
  beforeEach(() => {
    fetchVaultItems.mockReset();
    toastError.mockReset();
    getBulk.mockClear();
    setFavorite.mockClear();
    touch.mockClear();
    fetchVaultItems.mockImplementation(async (scope: VaultScope) => {
      const key = scopeKey(scope);
      if (!(key in ROWS)) throw new Error(`Unexpected vault scope: ${key}`);
      return ROWS[key];
    });
    selectedOrganizationId = null;
    selectedActorId = "user-1";
    desktopWorkspace = true;
    ROWS.mine = [row("mine-row", "My Personal Login")];
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

  it("filters and sorts rendered full controls without changing canonical selection routing", async () => {
    ROWS.mine = [
      row("z", "Zulu Login", "2026-09-02T00:00:00.000Z", "2026-09-01T00:00:00.000Z"),
      row("a", "Alpha Login", "2026-09-01T00:00:00.000Z", "2026-09-03T00:00:00.000Z"),
    ];
    const onSelectedItemIdChange = jest.fn();
    await mount({ selectedItemId: null, onSelectedItemIdChange });

    const search = container.querySelector<HTMLInputElement>(
      'input[aria-label="Search credentials"]',
    );
    if (!search) throw new Error("Missing Vault search control");
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      if (!setValue) throw new Error("Missing input value setter");
      setValue.call(search, "alpha");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.textContent).toContain("Alpha Login");
    expect(container.textContent).not.toContain("Zulu Login");

    const clear = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Clear search"]',
    );
    if (!clear) throw new Error("Missing clear search control");
    await act(async () => clear.click());
    expect(container.textContent).toContain("Zulu Login");

    await chooseRenderedSort("Newest added");
    expect(renderedItemIds()).toEqual(["z", "a"]);
    await chooseRenderedSort("Recently updated");
    expect(renderedItemIds()).toEqual(["a", "z"]);
    await chooseRenderedSort("Name A–Z");
    expect(renderedItemIds()).toEqual(["a", "z"]);
    await chooseRenderedSort("Name Z–A");
    expect(renderedItemIds()).toEqual(["z", "a"]);

    const alpha = container.querySelector<HTMLButtonElement>('[aria-label="Open Alpha Login"]');
    if (!alpha) throw new Error("Missing credential row");
    await act(async () => alpha.click());
    expect(onSelectedItemIdChange).toHaveBeenCalledWith("a");
  });

  it("keeps the full narrow dialog branch searchable", async () => {
    desktopWorkspace = false;
    ROWS.mine = [row("narrow-z", "Zulu Login"), row("narrow-a", "Alpha Login")];
    await mount({ presentation: "full" });
    const search = container.querySelector<HTMLInputElement>('input[aria-label="Search credentials"]');
    if (!search) throw new Error("Missing narrow search control");
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setValue) throw new Error("Missing input value setter");
    await act(async () => {
      setValue.call(search, "no results");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.textContent).toContain("No credentials match");
    const clear = container.querySelector<HTMLButtonElement>('button[aria-label="Clear search"]');
    if (!clear) throw new Error("Missing narrow clear search control");
    await act(async () => clear.click());
    await chooseRenderedSort("Name Z–A");
    expect(renderedItemIds()).toEqual(["narrow-z", "narrow-a"]);
  });

  it("keeps compact cards on the same metadata controls", async () => {
    ROWS.mine = [row("compact-z", "Zulu Login"), row("compact-a", "Alpha Login")];
    await mount({ presentation: "compact" });
    const search = container.querySelector<HTMLInputElement>('input[aria-label="Search credentials"]');
    if (!search) throw new Error("Missing compact search control");
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setValue) throw new Error("Missing input value setter");
    await act(async () => {
      setValue.call(search, "alpha");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(renderedItemIds()).toEqual(["compact-a"]);
    const clear = container.querySelector<HTMLButtonElement>('button[aria-label="Clear search"]');
    if (!clear) throw new Error("Missing compact clear search control");
    await act(async () => clear.click());
    await chooseRenderedSort("Name Z–A");
    expect(renderedItemIds()).toEqual(["compact-z", "compact-a"]);
  });

  it("does not touch a default full-pane item or when its star is clicked", async () => {
    await mount();
    await act(async () => { await Promise.resolve(); });
    expect(touch).not.toHaveBeenCalled();
    const star = container.querySelector<HTMLButtonElement>('[aria-label="Add My Personal Login to favorites"]');
    if (!star) throw new Error("Missing favorite control");
    await act(async () => star.click());
    expect(setFavorite).toHaveBeenCalledWith("credential_item", "mine-row", true);
    expect(touch).not.toHaveBeenCalled();
  });

  it("keeps compact stars separate from opening a credential", async () => {
    await mount({ presentation: "compact" });
    await act(async () => { await Promise.resolve(); });
    const star = container.querySelector<HTMLButtonElement>('[aria-label="Add My Personal Login to favorites"]');
    if (!star) throw new Error("Missing compact favorite control");
    await act(async () => star.click());
    expect(setFavorite).toHaveBeenCalledWith("credential_item", "mine-row", true);
    expect(touch).not.toHaveBeenCalled();
  });

  it("keeps route-local search and sort when the item route remounts the workspace", async () => {
    await mount();
    const search = container.querySelector<HTMLInputElement>('input[aria-label="Search credentials"]');
    if (!search) throw new Error("Missing Vault search control");
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setValue) throw new Error("Missing input value setter");
    await act(async () => { setValue.call(search, "personal"); search.dispatchEvent(new Event("input", { bubbles: true })); });
    await chooseRenderedSort("Recently viewed");
    await act(async () => {
      root.render(<VaultRouteWorkspaceStateProvider><VaultWorkspace key="item-route" principal={{ type: "user" }} presentation="full" selectedItemId="mine-row" /></VaultRouteWorkspaceStateProvider>);
    });
    expect(container.querySelector<HTMLInputElement>('input[aria-label="Search credentials"]')?.value).toBe("personal");
    expect(container.querySelector('[aria-label="Sort credentials"]')?.textContent).toContain("Recently viewed");
  });

  it("keeps the chosen Vault scope when the item route remounts", async () => {
    selectedOrganizationId = "org-selected";
    await mount();
    await clickScope("Organization");
    await act(async () => {
      root.render(<VaultRouteWorkspaceStateProvider><VaultWorkspace key="organization-item-route" principal={{ type: "user" }} presentation="full" selectedItemId="selected-row" /></VaultRouteWorkspaceStateProvider>);
    });
    expect(requestedScopes().at(-1)).toBe("organization:org-selected");
    expect(container.textContent).toContain("Selected Org Login");
  });

  it("keeps the Favorites filter when the item route remounts", async () => {
    await mount();
    await clickScope("Favorites");
    expect(container.textContent).toContain("No credentials match");
    await act(async () => {
      root.render(<VaultRouteWorkspaceStateProvider><VaultWorkspace key="favorite-item-route" principal={{ type: "user" }} presentation="full" selectedItemId="mine-row" /></VaultRouteWorkspaceStateProvider>);
    });
    const favoriteButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Favorites"));
    expect(favoriteButton?.getAttribute("aria-current")).toBe("page");
    expect(container.textContent).toContain("No credentials match");
  });

  it.each(["actor", "organization"])("resets route view state on %s change", async (changed) => {
    await mount();
    const renderBoundary = () => <VaultRouteWorkspaceStateBoundary><VaultWorkspace principal={{ type: "user" }} presentation="full" /></VaultRouteWorkspaceStateBoundary>;
    await act(async () => root.render(renderBoundary()));
    await clickScope("Favorites");
    await chooseRenderedSort("Recently viewed");
    if (changed === "actor") selectedActorId = "user-2";
    else selectedOrganizationId = "org-selected";
    await act(async () => root.render(renderBoundary()));
    const favoriteButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Favorites"));
    expect(favoriteButton?.getAttribute("aria-current")).toBeNull();
    expect(container.querySelector('[aria-label="Sort credentials"]')?.textContent).toContain("Newest added");
    expect(container.textContent).toContain("My Personal Login");
  });

});
