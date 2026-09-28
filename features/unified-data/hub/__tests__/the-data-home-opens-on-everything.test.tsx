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
const CLIENT = { listArchived, recordRestore: jest.fn() };
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
/** The knob answers per key: the default-scope knob is what the test sets; nothing else is set. */
let defaultScopeKnob: unknown = undefined;
jest.mock("@/lib/scoped-config/effectiveKnobs", () => ({
  useEffectiveKnob: (_org: string, _user: string, ref: { key: string }) =>
    ref.key === "data_home_default_scope" ? defaultScopeKnob : undefined,
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
  dataHomeTables: async () => ({ ok: true, data: ROWS }),
  tablesICanOpen: async () => ({ ok: true, data: ROWS }),
}));
jest.mock("../capabilities", () => {
  const actual = jest.requireActual("../capabilities");
  return {
    ...actual,
    HUB_CAPABILITIES: actual.HUB_CAPABILITIES.filter((c: { id: string }) => c.id === "tables"),
    attachChangedBy: async () => undefined,
  };
});

const HUB_UNDER_TEST = process.env.HUB_UNDER_TEST ?? "../OrganizationHub";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { OrganizationHub } = require(HUB_UNDER_TEST) as typeof import("../OrganizationHub");

let container: HTMLDivElement;
let root: Root;

async function mount(query = "") {
  PARAMS = new URLSearchParams(query);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<OrganizationHub organizationId={RINCON} dataSource={{} as never} organizationName="Rincon Plumbing Co" />);
  });
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
  // The Tables listing opens by default; its rows are what the filters narrow.
}

function tableRows(): Array<{ title: string; organization: string }> {
  return [...container.querySelectorAll('[data-hub-listing="tables"] li')].map((li) => ({
    title: li.querySelector("a")?.textContent ?? "",
    organization: li.querySelector("[data-hub-row-organization]")?.textContent ?? "",
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
});

describe("the data home · default is everything", () => {
  it("opens on All — every organization's tables, each naming its organization", async () => {
    await mount();
    expect(container.querySelector('[data-hub-scope-choice="all"]')?.getAttribute("aria-selected")).toBe("true");
    expect(tableRows()).toEqual([
      { title: "Patient recall list", organization: "Harbor Dental Group" },
      { title: "Service calls", organization: "Rincon Plumbing Co" },
      { title: "Backflow test schedule", organization: "Ojai Valley Home Services" },
    ]);
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
    ["orgs", ["Patient recall list", "Service calls"]],
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
