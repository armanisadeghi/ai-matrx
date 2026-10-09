/**
 * THE DATA HOME PUTS FOUNDATION TABLES FIRST, MARKS THEM, AND FILTERS BY THEM (lane 10 FD).
 *
 * A Table can be marked Foundation — part of the business's day-one data (Arman, 2026-09-25: "the data
 * that you set up on day one because you are going to build your business on it"). Cedar Ridge Physical
 * Therapy marks Patients, Therapists and Services; its other tables are what it stores later. The door
 * (`custom.data_home`) says `foundation` on each table row.
 *
 * Forced through the REAL page — the real DataHomeList, corpus, row builder, list shell and Redux store;
 * only the door and Next's router are doubles. Four clauses:
 *   1. the badge is drawn on exactly the foundation tables;
 *   2. in the default sort the foundation tables come before every other table, though others were
 *      changed more recently;
 *   3. the Filters panel's Foundation filter (beside Kind, Organization, Access) narrows the list to them;
 *   4. a person with no foundation table is offered no Foundation filter.
 * RED before lane 10 FD: no badge, the newest table first, no Foundation filter.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import type { RecordsDataSource } from "@ai-matrx/records";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

jest.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/data",
  useRouter: () => ({ push: () => undefined, replace: () => undefined, prefetch: () => undefined, refresh: () => undefined }),
}));
jest.mock("next/link", () => {
  const Link = ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  );
  return { __esModule: true, default: Link };
});
jest.mock("@/lib/toast", () => ({
  toast: { error: () => undefined, success: () => undefined },
  toastErrorAlreadyCaptured: () => undefined,
}));
const recordsClient = {};
jest.mock("@ai-matrx/records/react", () => ({ useRecordsClient: () => recordsClient }));
jest.mock("@/lib/scoped-config/effectiveKnobs.client", () => ({ useEffectiveKnob: () => undefined }));
const noOrganizations = { organizations: [], loading: false };
jest.mock("@/features/organizations/hooks", () => ({ useUserOrganizations: () => noOrganizations }));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));

// eslint-disable-next-line import/first
import { makeStore } from "@/lib/redux/store";
// eslint-disable-next-line import/first
import { TooltipProvider } from "@/components/ui/tooltip";
// eslint-disable-next-line import/first
import { DataHomeList } from "../DataHomeList";
// eslint-disable-next-line import/first
import type { DataHomeTableRow } from "@/features/unified-data/hub/doors";
// eslint-disable-next-line import/first
import { setOrganization } from "@/lib/redux/slices/appContextSlice";

const CLINIC = { id: "0a54df90-eab8-4d07-ab29-81a45fb41e04", name: "Cedar Ridge Physical Therapy" };
const ME = "87a6e699-3622-4869-8843-d0867456c0dd";

function table(id: string, name: string, updatedAt: string, foundation: boolean): DataHomeTableRow {
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
    platform_owned: false,
    kind: "table",
    team: false,
    system: false,
    created_by: ME,
    created_by_name: "Dana Whitfield",
    foundation,
  };
}

/** Day-one data: changed weeks ago. */
const FOUNDATION = [
  table("8d418147-0001-4542-be85-79bd21c633a1", "Patients", "2026-09-02T15:00:00.000Z", true),
  table("8d418147-0002-4542-be85-79bd21c633a2", "Therapists", "2026-09-01T15:00:00.000Z", true),
  table("8d418147-0003-4542-be85-79bd21c633a3", "Services", "2026-08-30T15:00:00.000Z", true),
];
/** What the clinic stores later: changed today. */
const LATER = [
  table("8d418147-0004-4542-be85-79bd21c633a4", "Visit Notes", "2026-10-02T16:40:00.000Z", false),
  table("8d418147-0005-4542-be85-79bd21c633a5", "Home Exercise Plans", "2026-10-02T15:10:00.000Z", false),
];

function clinicDoor(tables: DataHomeTableRow[]): RecordsDataSource {
  return {
    rpc: async (fn: string) => {
      if (fn === "data_home") return { data: { tables, items: [], changed_by: [] }, error: null };
      return { data: [], error: null };
    },
  } as unknown as RecordsDataSource;
}

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  // Every test opens a fresh address: a filter one test chose lives in the URL, and must not leak.
  window.history.replaceState(null, "", "/data");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

async function settle() {
  for (let i = 0; i < 10; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
  }
}

async function mount(tables: DataHomeTableRow[], store = makeStore()) {
  await act(async () => {
    root.render(
      <Provider store={store}>
        <TooltipProvider>
          <DataHomeList dataSource={clinicDoor(tables)} />
        </TooltipProvider>
      </Provider>,
    );
  });
  await settle();
}

const NAMES = (rows: readonly DataHomeTableRow[]) => rows.map((t) => t.table_name);
/** The table names in the order the page draws them (each name is its own link text). */
function drawnOrder(): string[] {
  const all = [...FOUNDATION, ...LATER].map((t) => t.table_name);
  const seen: string[] = [];
  for (const el of host.querySelectorAll("[data-data-home-name]")) {
    const name = el.getAttribute("data-data-home-name");
    if (name && all.includes(name) && !seen.includes(name)) seen.push(name);
  }
  return seen;
}
/** The names whose row carries the Foundation badge. */
function badged(): string[] {
  return [...host.querySelectorAll("[data-data-home-foundation]")]
    .map((b) => b.closest("[data-data-home-name]")?.getAttribute("data-data-home-name") ?? "?")
    .sort();
}

async function openFilters() {
  const filters = [...document.body.querySelectorAll("button")].find((b) => /Filters/.test(b.textContent ?? ""));
  expect(filters).toBeDefined();
  await act(async () => {
    filters!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}
const foundationChip = () =>
  [...document.body.querySelectorAll("button")].find((b) => /^Foundation \(\d+\)$/.test(b.getAttribute("title") ?? ""));

describe("the data home and the Foundation mark", () => {
  it("draws the badge on exactly the foundation tables", async () => {
    await mount([...LATER, ...FOUNDATION]);
    expect(badged()).toEqual(NAMES(FOUNDATION).sort());
  });

  it("lists the foundation tables first in the default sort, newest first within each group", async () => {
    await mount([...LATER, ...FOUNDATION]);
    expect(drawnOrder()).toEqual([...NAMES(FOUNDATION), ...NAMES(LATER)]);
  });

  it("the Foundation filter in the Filters panel narrows the list to the foundation tables", async () => {
    await mount([...LATER, ...FOUNDATION]);
    await openFilters();
    const chip = foundationChip();
    expect(chip).toBeDefined();
    await act(async () => {
      chip!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await settle();
    expect(drawnOrder()).toEqual(NAMES(FOUNDATION));
  });

  it("offers no Foundation filter to a person with no foundation table", async () => {
    await mount(LATER);
    await openFilters();
    expect(foundationChip()).toBeUndefined();
    expect(badged()).toEqual([]);
  });
});

// THE FILTER IS NEVER THE ACTIVE ORGANIZATION (common-docs/policies/active-org-is-never-a-list-filter.md).
// Two organizations each mark their own day-one tables. With Cedar Ridge Physical Therapy ACTIVE, the
// Foundation filter keeps the foundation tables of BOTH — the active organization is only where new
// things are saved. (`__activeOrg` is the stand-in the verifier's plant reads; the real one is Redux.)
describe("the Foundation filter across organizations", () => {
  const DENTAL = { id: "23c2ac41-8044-49ed-9af9-35761370e5c0", name: "Cedar Ridge Dental" };
  const dental = (id: string, name: string, foundation: boolean): DataHomeTableRow => ({
    ...table(id, name, "2026-09-03T15:00:00.000Z", foundation),
    organization_id: DENTAL.id,
    organization_name: DENTAL.name,
  });
  const DENTAL_TABLES = [
    dental("9a1b2c3d-0001-4e5f-8a9b-0c1d2e3f4a51", "Dental Patients", true),
    dental("9a1b2c3d-0002-4e5f-8a9b-0c1d2e3f4a52", "Hygiene Recalls", false),
  ];
  afterEach(() => {
    delete (globalThis as { __activeOrg?: string }).__activeOrg;
  });

  it("with one organization active, keeps the foundation tables of every organization", async () => {
    const store = makeStore();
    store.dispatch(setOrganization({ id: CLINIC.id, name: CLINIC.name }));
    (globalThis as { __activeOrg?: string }).__activeOrg = CLINIC.id;
    await mount([...LATER, ...FOUNDATION, ...DENTAL_TABLES], store);
    await openFilters();
    const chip = foundationChip();
    expect(chip?.getAttribute("title")).toBe("Foundation (4)");
    await act(async () => {
      chip!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await settle();
    const want = [...NAMES(FOUNDATION), "Dental Patients"].sort();
    const drawnNames = () => [...new Set([...host.querySelectorAll("[data-data-home-name]")].map((el) => el.getAttribute("data-data-home-name")))].sort();
    // The active organization's own reads land after the first paint; give the list its settle.
    for (let i = 0; i < 20 && JSON.stringify(drawnNames()) !== JSON.stringify(want); i += 1) await settle();
    expect(drawnNames()).toEqual(want);
  });
});
