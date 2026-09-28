// features/unified-data/hub/__tests__/the-data-home-opens-on-everything.test.tsx
//
// THE USE CASE (lane DATA-HOME-1, Arman 2026-09-27 21:20 PT). The owner of Harbor Dental Group
// also keeps the books for Rincon Plumbing Co; Ojai Valley Home Services shared its "Backflow test
// schedule" with her. She opens the data home (/data-v2) while working in Rincon Plumbing and
// presses Mine — it read 0 of everything, because the home showed ONE organization and she made
// her tables in Harbor Dental. The ruling:
//
//   1. the home opens on EVERYTHING she can see, across all her organizations, each row naming
//      its organization — and which filter it opens on is a Feature Knob (default All);
//   2. the filter row offers exactly All · Mine · My Orgs · Shared · Public, each decided by the
//      store's facts, and an empty filter says why in one sentence;
//   3. choosing a filter is a navigation (router.push), so the browser's Back returns.
//
// RED on the hub before the lane: the filter row was Everything + the four visibility lanes, the
// Tables listing was the active organization's only (Harbor Dental's tables absent, Mine empty),
// and "All my organizations" rewrote the address in place (no push, no way back).
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ME = "87a6e699-3622-4869-8843-d0867456c0dd";
const HARBOR = "11f4e747-0000-4000-8000-000000000001";
const RINCON = "884d1ce8-0000-4000-8000-000000000002";
const OJAI = "5b0e2a11-0000-4000-8000-000000000003";

const ROWS = [
  {
    table_id: "a1000000-0000-4000-8000-000000000001",
    table_name: "Patient recall list",
    organization_id: HARBOR,
    organization_name: "Harbor Dental Group",
    member: true,
    visibility: "internal",
    updated_at: "2026-09-26T17:05:00Z",
    mine: true,
    shared_with_me: false,
    kept_by_the_app: false,
    kind: "table",
  },
  {
    table_id: "a1000000-0000-4000-8000-000000000002",
    table_name: "Service calls",
    organization_id: RINCON,
    organization_name: "Rincon Plumbing Co",
    member: true,
    visibility: "internal",
    updated_at: "2026-09-27T15:40:00Z",
    mine: false,
    shared_with_me: false,
    kept_by_the_app: false,
    kind: "table",
  },
  {
    table_id: "a1000000-0000-4000-8000-000000000003",
    table_name: "Backflow test schedule",
    organization_id: OJAI,
    organization_name: "Ojai Valley Home Services",
    member: false,
    visibility: "internal",
    updated_at: "2026-09-25T09:12:00Z",
    mine: false,
    shared_with_me: true,
    kept_by_the_app: false,
    kind: "table",
  },
  {
    // The choices behind Service calls' Status column: kept by the app, and listed all the same.
    table_id: "a1000000-0000-4000-8000-000000000004",
    table_name: "Status choices",
    organization_id: RINCON,
    organization_name: "Rincon Plumbing Co",
    member: true,
    visibility: "internal",
    updated_at: "2026-09-27T15:41:00Z",
    mine: false,
    shared_with_me: false,
    kept_by_the_app: true,
    kind: "list",
  },
];

/** Which organization each call to the door named (null = every organization). */
const doorAskedFor: Array<string | null> = [];
const pagesAskedFor: Array<string | null> = [];

/** Everything beside the tables, as custom.data_home_items answers (DATA-HOME-2 tails). */
const PAGES = [
  {
    kind: "form",
    organization_id: HARBOR,
    organization_name: "Harbor Dental Group",
    item_id: "f1000000-0000-4000-8000-000000000001",
    table_id: "a1000000-0000-4000-8000-000000000001",
    table_name: "Patient recall list",
    item_row: { form_id: "f1000000-0000-4000-8000-000000000001", table_id: "a1000000-0000-4000-8000-000000000001", title: "New patient intake", state: "open", responses: 12, held: 0, published_at: "2026-09-20T10:00:00Z" },
  },
  {
    kind: "form",
    organization_id: OJAI,
    organization_name: "Ojai Valley Home Services",
    item_id: "f1000000-0000-4000-8000-000000000002",
    table_id: "a1000000-0000-4000-8000-000000000003",
    table_name: "Backflow test schedule",
    item_row: { form_id: "f1000000-0000-4000-8000-000000000002", table_id: "a1000000-0000-4000-8000-000000000003", title: "Backflow test request", state: "open", responses: 3, held: 1, published_at: "2026-09-22T10:00:00Z" },
  },
  {
    kind: "booking",
    organization_id: RINCON,
    organization_name: "Rincon Plumbing Co",
    item_id: "f1000000-0000-4000-8000-000000000003",
    table_id: "a1000000-0000-4000-8000-000000000002",
    table_name: "Service calls",
    item_row: { form_id: "f1000000-0000-4000-8000-000000000003", table_id: "a1000000-0000-4000-8000-000000000002", title: "Book a drain inspection", state: "open", slot_minutes: 60, booked: 4, upcoming: 2, published_at: "2026-09-21T10:00:00Z" },
  },
  // THE OTHER SIX LISTINGS, each with one row in Harbor Dental (not the organization mounted).
  {
    kind: "portal",
    organization_id: HARBOR,
    organization_name: "Harbor Dental Group",
    item_id: "p1000000-0000-4000-8000-000000000001",
    table_id: "a1000000-0000-4000-8000-000000000001",
    table_name: "Patient recall list",
    item_row: { portal_id: "p1000000-0000-4000-8000-000000000001", title: "Patient portal", client_table_id: "a1000000-0000-4000-8000-000000000001", is_active: true, tables: 1, invited: 8, signed_in: 3, shows: [{ table_id: "a1000000-0000-4000-8000-000000000001", name: "Patient recall list" }] },
  },
  {
    kind: "dashboard",
    organization_id: HARBOR,
    organization_name: "Harbor Dental Group",
    item_id: "d1000000-0000-4000-8000-000000000001",
    table_id: "a1000000-0000-4000-8000-000000000001",
    table_name: "Patient recall list",
    item_row: { dashboard_id: "d1000000-0000-4000-8000-000000000001", table_id: "a1000000-0000-4000-8000-000000000001", name: "Recalls due this month", block_count: 3 },
  },
  {
    kind: "digest",
    organization_id: HARBOR,
    organization_name: "Harbor Dental Group",
    item_id: "r1000000-0000-4000-8000-000000000001",
    table_id: "a1000000-0000-4000-8000-000000000001",
    table_name: "Patient recall list",
    item_row: { rule_id: "r1000000-0000-4000-8000-000000000001", name: "Monday recall digest", table_id: "a1000000-0000-4000-8000-000000000001", muted: false, cadence: "weekly", channel: "email", mine: true },
  },
  {
    kind: "checklist",
    organization_id: HARBOR,
    organization_name: "Harbor Dental Group",
    item_id: "c1000000-0000-4000-8000-000000000001",
    table_id: "a1000000-0000-4000-8000-000000000001",
    table_name: "Patient recall list",
    item_row: { template_id: "c1000000-0000-4000-8000-000000000001", name: "New hygienist onboarding", about_table_id: "a1000000-0000-4000-8000-000000000001", about_table: "Patient recall list", steps: 6, open_runs: 1, total_runs: 2, updated_at: "2026-09-24T10:00:00Z" },
  },
  {
    kind: "automation",
    organization_id: HARBOR,
    organization_name: "Harbor Dental Group",
    item_id: "a1000000-0000-4000-8000-000000000001",
    table_id: "a1000000-0000-4000-8000-000000000001",
    table_name: "Patient recall list",
    item_row: { table_id: "a1000000-0000-4000-8000-000000000001", table_name: "Patient recall list", stage_label: "Recall stage", stages: 4, rules: 2, broken: null, updated_at: "2026-09-23T10:00:00Z" },
  },
  {
    kind: "share",
    organization_id: HARBOR,
    organization_name: "Harbor Dental Group",
    item_id: "s1000000-0000-4000-8000-000000000001",
    table_id: "a1000000-0000-4000-8000-000000000001",
    table_name: "Patient recall list",
    item_row: { invitation_id: "s1000000-0000-4000-8000-000000000001", table_id: "a1000000-0000-4000-8000-000000000001", table_name: "Patient recall list", email: "billing@harborortho.example.org", level_label: "Can view", joined: true, expired: false, invited_at: "2026-09-19T10:00:00Z", say: null },
  },
];
const listArchived = jest.fn(async () => ({ ok: true as const, data: { rows: [], total: 0 } }));
const ROUTER = { replace: jest.fn(), refresh: jest.fn(), push: jest.fn() };
let PARAMS = new URLSearchParams();
jest.mock("next/navigation", () => ({
  useRouter: () => ROUTER,
  useSearchParams: () => PARAMS,
  usePathname: () => "/data-v2",
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
// The working organization's own forms and booking doors, as the store answers them for Rincon
// Plumbing (the organization mounted below). The data home must not read ONLY these any more.
const CLIENT = {
  listArchived,
  recordRestore: jest.fn(),
  forms: async () => ({ ok: true as const, data: [] }),
  bookings: async () => ({
    ok: true as const,
    data: PAGES.filter((p) => p.kind === "booking" && p.organization_id === RINCON).map((p) => p.page_row),
  }),
};
const TABLES = { data: [], loading: false, error: null };
jest.mock("@ai-matrx/records/react", () => ({
  useRecordsClient: () => CLIENT,
  useTables: () => TABLES,
}));
jest.mock("@ai-matrx/records-ui", () => {
  const actual = jest.requireActual("@ai-matrx/records-ui");
  return {
    ...actual,
    ArchivedDisclosure: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    ArchivedPortals: () => null,
    TablesHome: () => null,
  };
});
jest.mock("@/lib/knobs/unifiedDataCampaign", () => ({
  UNIFIED_DATA_CAMPAIGN: { check: async () => ({ state: "on" }) },
}));
/** The knob answers per key: the two default knobs are what the test sets; nothing else is set. */
let defaultScopeKnob: unknown = undefined;
let defaultKindKnob: unknown = undefined;
let defaultOrderKnob: unknown = undefined;
jest.mock("@/lib/scoped-config/effectiveKnobs", () => ({
  useEffectiveKnob: (_org: string, _user: string, ref: { key: string }) =>
    ref.key === "data_home_default_scope"
      ? defaultScopeKnob
      : ref.key === "data_home_default_kind"
        ? defaultKindKnob
        : ref.key === "data_home_default_order"
          ? defaultOrderKnob
          : undefined,
}));
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => ME,
}));
jest.mock("@/features/organizations/hooks", () => ({
  useUserRole: () => ({ role: "owner", loading: false }),
}));
jest.mock("@/features/organizations/components/OrganizationPickerPopover", () => ({
  OrganizationPickerPopover: () => null,
}));
// The hub before this lane mounted these; mocked so the RED run reaches its assertions.
jest.mock("../OrganizationScope", () => ({
  OrganizationScopeStrip: ({ onShowAll }: { onShowAll: () => void }) => (
    <button type="button" data-old-show-all onClick={onShowAll}>
      All my organizations
    </button>
  ),
  AllOrganizationsTables: () => null,
}));
jest.mock("../doors", () => ({
  tableKernelId: async () => ({ ok: true, data: "kernel" }),
  tableFacts: async () => ({ ok: true, data: [] }),
  // THE DOOR, AS PRODUCTION ANSWERS IT (datahome2 suite B): named one organization, only its rows.
  dataHomeTables: async (_ds: unknown, organizationId?: string | null) => {
    doorAskedFor.push(organizationId ?? null);
    return { ok: true, data: organizationId ? ROWS.filter((r) => r.organization_id === organizationId) : ROWS };
  },
  tablesICanOpen: async () => ({ ok: true, data: ROWS }),
  dataHomeItems: async (_ds: unknown, organizationId?: string | null) => {
    pagesAskedFor.push(organizationId ?? null);
    return { ok: true, data: organizationId ? PAGES.filter((p) => p.organization_id === organizationId) : PAGES };
  },
}));
jest.mock("../capabilities", () => {
  const actual = jest.requireActual("../capabilities");
  return {
    ...actual,
    HUB_CAPABILITIES: actual.HUB_CAPABILITIES.filter((c: { id: string }) =>
      ["tables", "forms", "bookings", "portals", "dashboards", "digests", "checklists", "automations", "shared-outside"].includes(c.id),
    ),
    attachChangedBy: async () => undefined,
  };
});

const HUB_UNDER_TEST = process.env.HUB_UNDER_TEST ?? "../OrganizationHub";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { OrganizationHub } = require(HUB_UNDER_TEST) as typeof import("../OrganizationHub");

let container: HTMLDivElement;
let root: Root;

async function mount(
  query = "",
  org?: { filter: string; onChoose?: (next: string) => void },
) {
  PARAMS = new URLSearchParams(query);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const bound = org && org.filter !== "all" ? org.filter : RINCON;
  const boundName = bound === HARBOR ? "Harbor Dental Group" : "Rincon Plumbing Co";
  await act(async () => {
    root.render(
      <OrganizationHub
        organizationId={bound}
        dataSource={{} as never}
        organizationName={boundName}
        {...(org
          ? {
              organizationFilter: org.filter,
              organizationChoices: [
                { id: HARBOR, name: "Harbor Dental Group" },
                { id: RINCON, name: "Rincon Plumbing Co" },
              ],
              onChooseOrganization: org.onChoose ?? (() => undefined),
            }
          : {})}
      />,
    );
  });
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
  // The Tables listing opens by default; its rows are what the filters narrow.
}

function tableRows(): Array<{ title: string; organization: string; kind: string }> {
  return [...container.querySelectorAll('[data-hub-listing="tables"] li[data-hub-row]')].map((li) => ({
    title: li.querySelector("a")?.textContent ?? "",
    organization: li.querySelector("[data-hub-row-organization]")?.textContent ?? "",
    kind: li.querySelector("[data-hub-row-kind]")?.textContent ?? "",
  }));
}

function listingText(): string {
  return container.querySelector('[data-hub-listing="tables"]')?.textContent ?? "";
}

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  ROUTER.push.mockClear();
  ROUTER.replace.mockClear();
  defaultScopeKnob = undefined;
  defaultKindKnob = undefined;
  defaultOrderKnob = undefined;
  doorAskedFor.length = 0;
  pagesAskedFor.length = 0;
});

describe("the data home · default is everything", () => {
  it("opens on All — every organization's tables and every kind, most recently updated first, under organization headers", async () => {
    await mount();
    expect(container.querySelector('[data-hub-scope-choice="all"]')?.getAttribute("aria-selected")).toBe("true");
    // Rincon changed last (Status choices 15:41, Service calls 15:40), then Harbor (26 Sep), then Ojai (25 Sep).
    const groups = [...container.querySelectorAll('[data-hub-listing="tables"] [data-hub-organization-group]')].map(
      (g) => g.getAttribute("data-hub-organization-group"),
    );
    expect(groups).toEqual(["Rincon Plumbing Co", "Harbor Dental Group", "Ojai Valley Home Services"]);
    expect(tableRows()).toEqual([
      { title: "Status choices", organization: "Rincon Plumbing Co", kind: "List" },
      { title: "Service calls", organization: "Rincon Plumbing Co", kind: "Table" },
      { title: "Patient recall list", organization: "Harbor Dental Group", kind: "Table" },
      { title: "Backflow test schedule", organization: "Ojai Valley Home Services", kind: "Table" },
    ]);
  });

  it("collapses an organization from its header, like a group on the table page", async () => {
    await mount();
    const toggle = container.querySelector(
      '[data-hub-organization-group="Rincon Plumbing Co"] [data-matrx-table-group-row] button',
    ) as HTMLButtonElement;
    await act(async () => toggle.click());
    expect(tableRows().map((r) => r.title)).toEqual(["Patient recall list", "Backflow test schedule"]);
  });

  it("orders A to Z when the order knob says name", async () => {
    defaultOrderKnob = "name";
    await mount("scope=orgs");
    expect(tableRows().map((r) => r.title)).toEqual(["Patient recall list", "Service calls", "Status choices"]);
  });

  it("does not group under a filter other than All", async () => {
    await mount("scope=orgs");
    expect(container.querySelector("[data-hub-organization-group]")).toBeNull();
  });

  it("opens on the filter the knob names when the address names none", async () => {
    defaultScopeKnob = "mine";
    await mount();
    expect(container.querySelector('[data-hub-scope-choice="mine"]')?.getAttribute("aria-selected")).toBe("true");
    expect(tableRows().map((r) => r.title)).toEqual(["Patient recall list"]);
  });
});

describe("the data home · exactly five filters, each the store's fact", () => {
  it("offers All · Mine · My Orgs · Shared · Public and nothing else", async () => {
    await mount();
    const choices = [...container.querySelectorAll("[data-hub-scope-choice]")].map((b) => b.textContent);
    expect(choices).toEqual(["All", "Mine", "My Orgs", "Shared", "Public"]);
  });

  it.each([
    ["mine", ["Patient recall list"]],
    ["orgs", ["Status choices", "Service calls", "Patient recall list"]],
    ["shared", ["Backflow test schedule"]],
  ])("?scope=%s lists exactly what the store says", async (scope, titles) => {
    await mount(`scope=${scope}`);
    expect(tableRows().map((r) => r.title)).toEqual(titles);
  });

  it("an empty filter says why in one plain sentence", async () => {
    await mount("scope=public");
    expect(tableRows()).toEqual([]);
    expect(listingText()).toMatch(/No tables under Public\. None of these that you can open is public\./);
  });
});

describe("the data home · Back returns", () => {
  it("choosing a filter pushes a history entry, never rewrites the address in place", async () => {
    await mount();
    await act(async () => {
      (container.querySelector('[data-hub-scope-choice="mine"]') as HTMLButtonElement | null)?.click();
    });
    expect(ROUTER.push).toHaveBeenCalledWith("/data-v2?scope=mine", { scroll: false });
    expect(ROUTER.replace).not.toHaveBeenCalled();
  });
});

describe("the data home · hides nothing, and a Kind filter narrows it", () => {
  it("offers All kinds and every kind a row carries, the person's own tables first", async () => {
    await mount();
    const kind = container.querySelector("[data-hub-kind]") as HTMLSelectElement | null;
    expect(kind?.value).toBe("all");
    expect([...(kind?.options ?? [])].map((o) => o.textContent)).toEqual(["All kinds", "Tables", "Lists"]);
  });

  it("?kind=list lists only the lists, and the five filters still apply", async () => {
    await mount("kind=list");
    expect(tableRows().map((r) => r.title)).toEqual(["Status choices"]);
  });

  it("an empty kind under a filter says so in one sentence", async () => {
    await mount("kind=list&scope=mine");
    expect(tableRows()).toEqual([]);
    expect(listingText()).toMatch(/No lists under Mine in any of your organizations\./);
  });

  it("opens on the kind the knob names", async () => {
    defaultKindKnob = "list";
    await mount();
    expect((container.querySelector("[data-hub-kind]") as HTMLSelectElement | null)?.value).toBe("list");
    expect(tableRows().map((r) => r.title)).toEqual(["Status choices"]);
  });

  it("choosing a kind pushes a history entry", async () => {
    await mount();
    const kind = container.querySelector("[data-hub-kind]") as HTMLSelectElement;
    await act(async () => {
      kind.value = "list";
      kind.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(ROUTER.push).toHaveBeenCalledWith("/data-v2?kind=list", { scroll: false });
  });
});

// ── LANE DATA-HOME-2 (Arman, 2026-09-28 ~14:00 PT): "with titanium selected in the organization
// filter, the home still lists every organization." RED on the DATA-HOME-1 hub: the bar's only
// organization control was the active-organization picker, there was no organization dropdown, and
// the door was asked for every organization whatever was chosen.
describe("the data home · the organization dropdown", () => {
  it("sits at the END of the bar, after All · Mine · My Orgs · Shared · Public, and starts on All Orgs", async () => {
    await mount();
    const bar = container.querySelector("[data-hub-scope]") as HTMLElement;
    const controls = [...bar.querySelectorAll("[data-hub-scope-choice], [data-hub-kind], [data-hub-organization]")].map(
      (el) => el.getAttribute("data-hub-scope-choice") ?? (el.hasAttribute("data-hub-kind") ? "kind" : "organization"),
    );
    expect(controls).toEqual(["all", "mine", "orgs", "shared", "public", "kind", "organization"]);
    const select = bar.querySelector("[data-hub-organization]") as HTMLSelectElement;
    expect(select.value).toBe("all");
    expect(select.options[0]?.textContent).toBe("All Orgs");
  });

  it.each([
    ["all", ["Patient recall list"]],
    ["mine", ["Patient recall list"]],
    ["orgs", ["Patient recall list"]],
    ["shared", []],
    ["public", []],
  ])("under ?scope=%s with Harbor Dental chosen, only Harbor Dental's tables — the door is told", async (scope, titles) => {
    await mount(`scope=${scope}`, { filter: HARBOR });
    expect(doorAskedFor).toContain(HARBOR);
    expect(doorAskedFor).not.toContain(null);
    expect(tableRows().map((r) => r.title)).toEqual(titles);
    expect(tableRows().every((r) => r.organization === "Harbor Dental Group")).toBe(true);
    // The heading says the one organization, never "every organization you belong to".
    const heading = container.querySelector('[data-hub-listing-toggle="tables"]')?.textContent ?? "";
    expect(heading).toMatch(/Every table you can open in Harbor Dental Group/);
    expect(heading).not.toMatch(/every organization you belong to/);
  });

  it("under a Kind, the chosen organization still holds", async () => {
    await mount("kind=list", { filter: HARBOR });
    expect(tableRows()).toEqual([]);
    expect(listingText()).toMatch(/No lists in Harbor Dental Group\./);
  });

  it("an empty lane names the chosen organization, never 'any of your organizations'", async () => {
    await mount("scope=shared", { filter: HARBOR });
    expect(listingText()).toMatch(/No tables under Shared\. Nobody has shared any of Harbor Dental Group's with you yet\./);
    expect(listingText()).not.toMatch(/any of your organizations/);
  });

  it("All Orgs asks the doors for every organization, and the bar no longer names one organization's forms", async () => {
    await mount("", { filter: "all" });
    expect(doorAskedFor).toEqual([null]);
    expect(pagesAskedFor).toEqual([null]);
    expect(tableRows()).toHaveLength(4);
    expect(container.querySelector("[data-hub-forms-from]")).toBeNull();
    expect(container.querySelector("[data-hub-scope]")?.textContent).not.toMatch(/Forms and pages/);
  });

  it("picking an organization hands the pick to the page", async () => {
    const onChoose = jest.fn();
    await mount("", { filter: "all", onChoose });
    const select = container.querySelector("[data-hub-organization]") as HTMLSelectElement;
    await act(async () => {
      select.value = HARBOR;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onChoose).toHaveBeenCalledWith(HARBOR);
  });
});

// ── DATA-HOME-2 TAIL (chair, 2026-09-28): under All Orgs the forms and booking pages still listed
// only the working organization, with a sentence saying so. RED on the first DATA-HOME-2 hub: the
// Forms and Bookings listings read custom.forms / custom.bookings for the working organization only.
function listingRows(id: string): Array<{ title: string; organization: string }> {
  return [...container.querySelectorAll(`[data-hub-listing="${id}"] li[data-hub-row]`)].map((li) => ({
    title: li.querySelector("a")?.textContent ?? "",
    organization: li.querySelector("[data-hub-row-organization]")?.textContent ?? "",
  }));
}

async function openListing(id: string) {
  const toggle = container.querySelector(`[data-hub-listing-toggle="${id}"]`) as HTMLButtonElement | null;
  if (toggle && toggle.getAttribute("aria-expanded") !== "true") {
    await act(async () => toggle.click());
  }
}

describe("the data home · forms and booking pages follow the organization dropdown", () => {
  it("All Orgs lists every organization's forms and booking pages, each naming its organization", async () => {
    await mount("", { filter: "all" });
    await openListing("forms");
    await openListing("bookings");
    expect(listingRows("forms").map((r) => [r.title, r.organization]).sort()).toEqual([
      ["Backflow test request", "Ojai Valley Home Services"],
      ["New patient intake", "Harbor Dental Group"],
    ]);
    expect(listingRows("bookings")).toEqual([{ title: "Book a drain inspection", organization: "Rincon Plumbing Co" }]);
  });

  it("a picked organization narrows all three lists together, and the doors are told", async () => {
    await mount("", { filter: HARBOR });
    await openListing("forms");
    await openListing("bookings");
    expect(pagesAskedFor).toEqual([HARBOR]);
    expect(tableRows().every((r) => r.organization === "Harbor Dental Group")).toBe(true);
    expect(listingRows("forms")).toEqual([{ title: "New patient intake", organization: "Harbor Dental Group" }]);
    expect(listingRows("bookings")).toEqual([]);
  });

  it("the five lanes read a page's Table: Mine lists the form on her own table, Shared the one on a table shared with her", async () => {
    await mount("scope=mine", { filter: "all" });
    await openListing("forms");
    expect(listingRows("forms").map((r) => r.title)).toEqual(["New patient intake"]);
    await act(async () => root.unmount());
    container.remove();
    await mount("scope=shared", { filter: "all" });
    await openListing("forms");
    expect(listingRows("forms").map((r) => r.title)).toEqual(["Backflow test request"]);
  });
});

// ── DATA-HOME-2, FINISH THE CLASS (chair, 2026-09-28): portals, dashboards, digests, checklists,
// automations and outside shares still read the working organization only ("Only <org>'s." on each
// heading). RED on the tail-1 hub: each of these listings read the mounted organization's own door.
describe("the data home · every listing follows the organization dropdown", () => {
  const OTHER_LISTINGS: Array<[string, string]> = [
    ["portals", "Patient portal"],
    ["dashboards", "Recalls due this month"],
    ["digests", "Monday recall digest"],
    ["checklists", "New hygienist onboarding"],
    ["automations", "Patient recall list"],
    ["shared-outside", "billing@harborortho.example.org"],
  ];

  it.each(OTHER_LISTINGS)("All Orgs: %s lists Harbor Dental's row, labelled, while working in Rincon Plumbing", async (listing, title) => {
    await mount("", { filter: "all" });
    await openListing(listing);
    expect(listingRows(listing)).toEqual([{ title, organization: "Harbor Dental Group" }]);
    expect(container.querySelector("[data-hub-listing-one-organization]")).toBeNull();
    expect(container.querySelector(`[data-hub-listing-toggle="${listing}"]`)?.textContent ?? "").not.toMatch(/Only /);
  });

  it.each(OTHER_LISTINGS)("Rincon Plumbing picked: %s narrows with the tables (Harbor Dental's row gone)", async (listing) => {
    await mount("", { filter: RINCON });
    await openListing(listing);
    expect(pagesAskedFor).toEqual([RINCON]);
    expect(listingRows(listing)).toEqual([]);
  });
});
