// features/unified-data/hub/__tests__/the-way-to-make-a-table-comes-first.test.tsx
//
// THE USE CASE (lane HANDOVER, 2026-09-27). The owner of Cedar Ridge Physical Therapy, a new
// organization, opens /data-v2 to make her first table. The Tables section says "No tables yet".
// The ONLY way to make one, New table, was drawn at the very bottom of the hub, under nine more
// listings, the inbox and the archive: below the first screen at 1600x900 and four screens down on
// a phone. RED on the hub before the lane: the making row came after every listing.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const listArchived = jest.fn(async () => ({ ok: true as const, data: { rows: [], total: 0 } }));
const recordRestore = jest.fn();

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
    TablesHome: () => <div data-making-a-table>New table</div>,
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
jest.mock("@/features/organizations/components/OrganizationPickerPopover", () => ({
  OrganizationPickerPopover: () => null,
}));
jest.mock("../doors", () => ({
  tableKernelId: async () => ({ ok: true, data: "kernel" }),
  tableFacts: async () => ({ ok: true, data: [] }),
  dataHomeTables: async () => ({ ok: true, data: [] }),
  dataHomeItems: async () => ({ ok: true, data: [] }),
  dataHomeChangedBy: async () => ({ ok: true, data: [] }),
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

const HUB_UNDER_TEST = process.env.HUB_UNDER_TEST ?? "../OrganizationHub";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { OrganizationHub } = require(HUB_UNDER_TEST) as typeof import("../OrganizationHub");

let container: HTMLDivElement;
let root: Root;

async function flush() {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

it("puts New table before every listing, where an owner with no tables looks first", async () => {
  role = "owner";
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<OrganizationHub organizationId="884d1ce8-0000-4000-8000-000000000000" dataSource={{} as never} />);
  });
  await flush();
  const making = container.querySelector("[data-making-a-table]");
  const firstListing = container.querySelector("[data-hub-listing]");
  expect(making).not.toBeNull();
  expect(firstListing).not.toBeNull();
  // DOCUMENT_POSITION_FOLLOWING: the listing comes after the making row.
  expect(making!.compareDocumentPosition(firstListing!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
