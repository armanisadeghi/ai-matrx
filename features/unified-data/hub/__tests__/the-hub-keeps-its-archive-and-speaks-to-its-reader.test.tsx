// features/unified-data/hub/__tests__/the-hub-keeps-its-archive-and-speaks-to-its-reader.test.tsx
//
// UI-FIX-19 (VERIFIER-19 #4 and #8), through the REAL OrganizationHub.
//
// THE USE CASE. The Birchwood owner (admin@admin.com, owner of admin's Workspace, which shows each
// MEMBER only what is shared with them) opens her organization's hub. Her archive holds Rooms and
// its choice list, Status choices, archived separately. She presses "Bring it back" on Rooms and
// the store refuses: the Status column takes its choices from "Status choices", which is still
// archived.
//
// WHAT MAKES IT FAIL (RED on the hub before UI-FIX-19):
//   #4  the refusal emptied the archive list and printed "The archive did not answer, so nothing
//       was read" although the archive had answered; the Status choices row she needs vanished.
//   #8  the owner's Tables heading read "This organization shows each member only what is shared
//       with them" beside a count that was every table. That sentence is for a member.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROOMS = "8c62d552-a893-4338-ac05-a266b2178712";
const STATUS_CHOICES = "e73f875c-0000-4000-8000-000000000001";
const REFUSAL =
  'This could not be brought back as it was archived: "Status" is refused on its own (the list field Status takes its choices from "Status choices", which is archived - bring "Status choices" back first, then bring this back), so nothing was brought back.';

const listArchived = jest.fn(async () => ({
  ok: true as const,
  data: {
    rows: [
      { id: ROOMS, document: { name: "Rooms" }, archivedAt: "2026-09-25T03:49:40Z", archivedByName: "admin" },
      { id: STATUS_CHOICES, document: { name: "Status choices" }, archivedAt: "2026-09-25T03:50:01Z", archivedByName: "admin" },
    ],
    total: 2,
  },
}));
const recordRestore = jest.fn(async () => ({
  ok: false as const,
  error: { code: "check_violation", message: REFUSAL, hint: null, details: null },
}));

// Every hook answers the SAME object on every render, as the real ones do — a fresh object per
// render would re-run the hub's effects forever.
const ROUTER = { replace: jest.fn(), refresh: jest.fn(), push: jest.fn() };
const PARAMS = new URLSearchParams();
jest.mock("next/navigation", () => ({
  useRouter: () => ROUTER,
  useSearchParams: () => PARAMS,
  usePathname: () => "/data-v2",
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
const CLIENT = { listArchived, recordRestore };
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
jest.mock("@/lib/scoped-config/effectiveKnobs", () => ({
  useEffectiveKnob: () => "shared_only",
}));
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => "87a6e699-3622-4869-8843-d0867456c0dd",
}));
let role: string | null = "owner";
jest.mock("@/features/organizations/hooks", () => ({
  useUserRole: () => ({ role, loading: false }),
}));
jest.mock("../OrganizationScope", () => ({
  OrganizationScopeStrip: () => null,
  AllOrganizationsTables: () => null,
}));
jest.mock("../doors", () => ({
  tableKernelId: async () => ({ ok: true, data: "kernel" }),
  tableFacts: async () => ({ ok: true, data: [] }),
}));
jest.mock("../capabilities", () => {
  const actual = jest.requireActual("../capabilities");
  return {
    ...actual,
    // Only Tables: the other capabilities read doors this suite is not about.
    HUB_CAPABILITIES: actual.HUB_CAPABILITIES.filter((c: { id: string }) => c.id === "tables"),
    attachChangedBy: async () => undefined,
  };
});

// eslint-disable-next-line import/first
import { OrganizationHub } from "../OrganizationHub";

let container: HTMLDivElement;
let root: Root;

async function flush() {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

async function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<OrganizationHub organizationId="884d1ce8-0000-4000-8000-000000000000" dataSource={{} as never} />);
  });
  await flush();
}

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("UI-FIX-19 · a refused Bring it back keeps the archive", () => {
  it("keeps every archived row and says the store's refusal, with its fix, on the refused row", async () => {
    role = "owner";
    await mount();
    // Found by what a person sees, so the suite judges the old hub by the same eyes.
    const rowOf = (name: string) =>
      Array.from(container.querySelectorAll("li")).find((li) => li.querySelector("span")?.textContent === name);
    const button = Array.from(rowOf("Rooms")?.querySelectorAll("button") ?? []).find((b) => b.textContent === "Bring it back");
    expect(button).toBeDefined();
    await act(async () => {
      button!.click();
    });
    await flush();

    expect(container.textContent ?? "").not.toMatch(/The archive did not answer/);
    // The list stays — the Status choices row she has to bring back first is still there.
    expect(rowOf("Status choices")).toBeDefined();
    // The refusal sits on Rooms' own row, in the store's words, naming the fix.
    expect(rowOf("Rooms")?.textContent).toMatch(/bring "Status choices" back first/);
  });
});

describe("UI-FIX-19 · the Tables sentence speaks to its reader", () => {
  it("tells the owner the tables she can open, never that she sees only what is shared", async () => {
    role = "owner";
    await mount();
    const heading = container.querySelector('[data-hub-listing-toggle="tables"]')?.textContent ?? "";
    expect(heading).toMatch(/The tables you can open in this organization/);
    expect(heading).not.toMatch(/only what is shared/);
  });

  it("tells a member who is not an owner that she sees only what is shared with her", async () => {
    role = "member";
    await mount();
    const heading = container.querySelector('[data-hub-listing-toggle="tables"]')?.textContent ?? "";
    expect(heading).toMatch(/only what is shared with them/);
  });
});
