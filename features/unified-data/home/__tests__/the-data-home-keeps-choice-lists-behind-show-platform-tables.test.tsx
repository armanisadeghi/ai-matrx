/**
 * THE DATA HOME KEEPS A CHOICE COLUMN'S LISTS BEHIND "SHOW PLATFORM TABLES" — PER PERSON (lane 10, item 7).
 *
 * THE BREAK. Every choice column keeps its choices in a List ("Status choices"), and
 * `custom.data_home` answers each one beside the person's real tables (`kind: "list"`,
 * `kept_by_the_app: true` — live 2026-10-02: the admin seat's first page was 18 "… choices" rows).
 * A physical-therapy clinic with five choice columns saw five lists it never made, mixed into its
 * tables. The one rule (`isKeptTable` from `@ai-matrx/records-ui`) now keeps them out by default;
 * "Show platform tables" in Filters brings them in, and the choice is the person's own preference
 * (`userPreferences.lists.dataHomeShowPlatformTables`, synced), so it holds on the next visit.
 *
 * Forced through the REAL page: the real DataHomeList, the real corpus, the real row builder, the
 * real list shell and the real Redux store. Only the door (`custom.data_home` over a fake data
 * seam, answering what the live door answers) and Next's router are doubles.
 *
 * RED on the old code: every "… choices" list is drawn by default, and the switch is component
 * state that no store holds.
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

const CLINIC = { id: "7a3c1e52-4b8d-4f0a-9c21-5e6d7f8a9b01", name: "Cedar Ridge Physical Therapy" };
const ME = "0d5b2f8e-6a1c-4e3b-8f7d-9c2a1b3e4f50";

function table(id: string, name: string, kind: string, platformOwned: boolean): DataHomeTableRow {
  return {
    table_id: id,
    table_name: name,
    organization_id: CLINIC.id,
    organization_name: CLINIC.name,
    member: true,
    visibility: "internal",
    updated_at: "2026-10-01T16:20:00.000Z",
    mine: true,
    shared_with_me: false,
    kept_by_the_app: platformOwned,
    kind,
    team: false,
    system: false,
    created_by: ME,
    created_by_name: "Dana Whitfield",
  };
}

/** What the clinic made on purpose — two tables and one List of its own. */
const MADE_ON_PURPOSE = [
  table("5f1a2b3c-0001-4d5e-8f60-718293a4b5c1", "Patient Visits", "table", false),
  table("5f1a2b3c-0002-4d5e-8f60-718293a4b5c2", "Home Exercise Plans", "table", false),
  table("5f1a2b3c-0003-4d5e-8f60-718293a4b5c3", "Loaner Equipment", "list", false),
];
/** The Lists five choice columns keep their choices in (Patient Visits and Home Exercise Plans own them). */
const CHOICE_LISTS = [
  table("9e8d7c6b-0001-4a5b-9c0d-1e2f3a4b5c61", "Status choices", "list", true),
  table("9e8d7c6b-0002-4a5b-9c0d-1e2f3a4b5c62", "Visit type choices", "list", true),
  table("9e8d7c6b-0003-4a5b-9c0d-1e2f3a4b5c63", "Insurance plan choices", "list", true),
  table("9e8d7c6b-0004-4a5b-9c0d-1e2f3a4b5c64", "Body region choices", "list", true),
  table("9e8d7c6b-0005-4a5b-9c0d-1e2f3a4b5c65", "Referral source choices", "list", true),
];

/** The live door answers the value sets whether or not platform tables were asked for. */
function clinicDoor(): RecordsDataSource {
  return {
    rpc: async (fn: string) => {
      if (fn === "data_home") {
        return { data: { tables: [...MADE_ON_PURPOSE, ...CHOICE_LISTS], items: [], changed_by: [] }, error: null };
      }
      return { data: [], error: null };
    },
  } as unknown as RecordsDataSource;
}

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

async function settle() {
  for (let i = 0; i < 10; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
  }
}

async function mount(store: ReturnType<typeof makeStore>) {
  await act(async () => {
    root.render(
      <Provider store={store}>
        <TooltipProvider>
          <DataHomeList dataSource={clinicDoor()} />
        </TooltipProvider>
      </Provider>,
    );
  });
  await settle();
}

const shown = (name: string) => (host.textContent ?? "").includes(name);
const NAMES = (rows: readonly DataHomeTableRow[]) => rows.map((t) => t.table_name);
/** The names of `rows` the page draws right now. */
const drawn = (rows: readonly DataHomeTableRow[]) => NAMES(rows).filter(shown);

async function pressShowPlatformTables() {
  const filters = [...document.body.querySelectorAll("button")].find((b) => /Filters/.test(b.textContent ?? ""));
  expect(filters).toBeDefined();
  await act(async () => {
    filters!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  const box = document.body.querySelector('[role="checkbox"][aria-label="Show platform tables"]');
  expect(box).not.toBeNull();
  await act(async () => {
    box!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await settle();
}

describe("the data home and a choice column's lists", () => {
  it("lists none of the five choice lists by default, and every table the clinic made", async () => {
    await mount(makeStore());
    expect(drawn(CHOICE_LISTS)).toEqual([]);
    expect(drawn(MADE_ON_PURPOSE)).toEqual(NAMES(MADE_ON_PURPOSE));
  });

  it("lists all five after Show platform tables, and still every table the clinic made", async () => {
    await mount(makeStore());
    await pressShowPlatformTables();
    expect(drawn(CHOICE_LISTS)).toEqual(NAMES(CHOICE_LISTS));
    expect(drawn(MADE_ON_PURPOSE)).toEqual(NAMES(MADE_ON_PURPOSE));
  });

  it("keeps the choice as the person's own synced preference, so the next visit opens with it", async () => {
    const store = makeStore();
    await mount(store);
    await pressShowPlatformTables();
    expect(store.getState().userPreferences.lists.dataHomeShowPlatformTables).toBe(true);

    // The next visit: a fresh page over the same person's preferences, nothing pressed.
    act(() => root.unmount());
    root = createRoot(host);
    await mount(store);
    expect(drawn(CHOICE_LISTS)).toEqual(NAMES(CHOICE_LISTS));
  });
});
