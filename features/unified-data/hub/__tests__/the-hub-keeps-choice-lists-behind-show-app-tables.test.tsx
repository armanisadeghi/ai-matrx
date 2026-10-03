/**
 * THE OLD DATA HOME (the hub) KEEPS A CHOICE COLUMN'S LISTS BEHIND "SHOW APP TABLES" — PER PERSON
 * (lane 10 item 7, chair ruling 2026-10-02). The twin of the list-shell home's guard
 * (`features/unified-data/home/__tests__/the-data-home-keeps-choice-lists-behind-show-app-tables`).
 *
 * THE BREAK. `custom.data_home` answers every choice column's List (`kind: "list"`,
 * `kept_by_the_app: true`) beside the person's tables, and the hub listed them all. A
 * physical-therapy clinic with five choice columns saw five Lists it never made. The package's
 * `isValueSet` now leaves them out until "Show app tables" (on the hub's one bar) is on, and that
 * switch is the person's synced preference (`lists.dataHomeShowAppTables`), the same one the
 * other home reads. A table or List a person made is listed either way.
 *
 * Forced through the real hub, the real HubListing and the real Redux store; the door and the
 * router are doubles. RED on the old hub: the five Lists are drawn by default and no switch exists.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const CLINIC = { id: "7a3c1e52-4b8d-4f0a-9c21-5e6d7f8a9b01", name: "Cedar Ridge Physical Therapy" };

function table(id: string, name: string, kind: string, keptByTheApp: boolean, updatedAt: string) {
  return {
    table_id: id,
    table_name: name,
    organization_id: CLINIC.id,
    organization_name: CLINIC.name,
    member: true,
    visibility: "internal",
    updated_at: updatedAt,
    mine: true,
    shared_with_me: false,
    kept_by_the_app: keptByTheApp,
    kind,
    team: false,
    system: false,
    created_by: "0d5b2f8e-6a1c-4e3b-8f7d-9c2a1b3e4f50",
    created_by_name: "Dana Whitfield",
  };
}

/** What the clinic made on purpose — two tables and one List of its own. */
const MADE_ON_PURPOSE = [
  table("5f1a2b3c-0001-4d5e-8f60-718293a4b5c1", "Patient Visits", "table", false, "2026-10-01T16:20:00Z"),
  table("5f1a2b3c-0002-4d5e-8f60-718293a4b5c2", "Home Exercise Plans", "table", false, "2026-10-01T15:10:00Z"),
  table("5f1a2b3c-0003-4d5e-8f60-718293a4b5c3", "Loaner Equipment", "list", false, "2026-09-30T11:00:00Z"),
];
/** The Lists five choice columns keep their choices in. */
const CHOICE_LISTS = [
  table("9e8d7c6b-0001-4a5b-9c0d-1e2f3a4b5c61", "Status choices", "list", true, "2026-10-01T16:21:00Z"),
  table("9e8d7c6b-0002-4a5b-9c0d-1e2f3a4b5c62", "Visit type choices", "list", true, "2026-10-01T16:22:00Z"),
  table("9e8d7c6b-0003-4a5b-9c0d-1e2f3a4b5c63", "Insurance plan choices", "list", true, "2026-10-01T16:23:00Z"),
  table("9e8d7c6b-0004-4a5b-9c0d-1e2f3a4b5c64", "Body region choices", "list", true, "2026-10-01T15:11:00Z"),
  table("9e8d7c6b-0005-4a5b-9c0d-1e2f3a4b5c65", "Referral source choices", "list", true, "2026-10-01T15:12:00Z"),
];

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => undefined, refresh: () => undefined, push: () => undefined, prefetch: () => undefined }),
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/data-v2",
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
const CLIENT = { listArchived: async () => ({ ok: true, data: { rows: [], total: 0 } }), recordRestore: async () => ({ ok: true }) };
jest.mock("@ai-matrx/records/react", () => ({ useRecordsClient: () => CLIENT }));
jest.mock("@ai-matrx/records-ui", () => {
  const actual = jest.requireActual("@ai-matrx/records-ui");
  return {
    ...actual,
    ArchivedDisclosure: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    ArchivedPortals: () => null,
  };
});
jest.mock("@/lib/scoped-config/effectiveKnobs.client", () => ({ useEffectiveKnob: () => undefined }));
const ROLE = { role: "owner", loading: false };
const MEMBERSHIPS = { organizations: [{ id: CLINIC.id, name: CLINIC.name }], loading: false };
jest.mock("@/features/organizations/hooks", () => ({ useUserRole: () => ROLE, useUserOrganizations: () => MEMBERSHIPS }));
jest.mock("@/features/organizations/components/OrganizationPickerPopover", () => ({ OrganizationPickerPopover: () => null }));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));
jest.mock("../doors", () => ({
  ...jest.requireActual("../doors"),
  tableKernelId: async () => ({ ok: true, data: "kernel" }),
  tableFacts: async () => ({ ok: true, data: [] }),
  dataHomeChangedBy: async () => ({ ok: true, data: [] }),
  // The live door answers the Lists whether or not app tables were asked for.
  dataHome: async () => ({ ok: true, data: { tables: [...MADE_ON_PURPOSE, ...CHOICE_LISTS], items: [], changed_by: [] } }),
}));
jest.mock("../capabilities", () => {
  const actual = jest.requireActual("../capabilities");
  return {
    ...actual,
    HUB_CAPABILITIES: actual.HUB_CAPABILITIES.filter((c: { id: string }) => c.id === "tables"),
    attachChangedBy: async () => undefined,
  };
});

// eslint-disable-next-line import/first
import { makeStore } from "@/lib/redux/store";
// eslint-disable-next-line import/first
import { OrganizationHub } from "../OrganizationHub";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

async function mount(store: ReturnType<typeof makeStore>) {
  await act(async () => {
    root.render(
      <Provider store={store}>
        <OrganizationHub organizationId={null} dataSource={{} as never} organizationName={null} organizationFilter="all" />
      </Provider>,
    );
  });
  for (let i = 0; i < 10; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

/** The titles the Tables listing draws, in order. */
const listed = () =>
  [...host.querySelectorAll('[data-hub-listing="tables"] li[data-hub-row]')].map((li) => li.querySelector("a")?.textContent ?? "");
const NAMES = (rows: ReadonlyArray<{ table_name: string }>) => rows.map((t) => t.table_name);
const drawn = (rows: ReadonlyArray<{ table_name: string }>) => NAMES(rows).filter((n) => listed().includes(n));

async function pressShowAppTables() {
  const box = host.querySelector('[role="checkbox"][aria-label="Show app tables"]');
  expect(box).not.toBeNull();
  await act(async () => {
    box!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe("the hub and a choice column's lists", () => {
  it("lists none of the five choice lists by default, and every table and List the clinic made", async () => {
    await mount(makeStore());
    expect(drawn(MADE_ON_PURPOSE)).toEqual(NAMES(MADE_ON_PURPOSE));
    expect(drawn(CHOICE_LISTS)).toEqual([]);
  });

  it("lists all five after Show app tables, and still every table and List the clinic made", async () => {
    await mount(makeStore());
    await pressShowAppTables();
    expect(drawn(CHOICE_LISTS)).toEqual(NAMES(CHOICE_LISTS));
    expect(drawn(MADE_ON_PURPOSE)).toEqual(NAMES(MADE_ON_PURPOSE));
  });

  it("keeps the choice as the person's synced preference — the one the other home reads", async () => {
    const store = makeStore();
    await mount(store);
    await pressShowAppTables();
    expect(store.getState().userPreferences.lists.dataHomeShowAppTables).toBe(true);
    act(() => root.unmount());
    root = createRoot(host);
    await mount(store);
    expect(drawn(CHOICE_LISTS)).toEqual(NAMES(CHOICE_LISTS));
  });
});
