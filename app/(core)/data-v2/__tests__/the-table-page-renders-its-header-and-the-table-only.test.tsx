/**
 * @jest-environment jsdom
 *
 * THE TABLE ROUTE RENDERS ITS HEADER AND THE TABLE, AND NOTHING ELSE (lane TABLE-PAGE-CHROME).
 *
 * The owner, 2026-09-25, on his Coding Accounts table: six rows sat above the data — the header,
 * an organization notice (twice), the page's own action row, a sort sentence, a toolbar, the
 * column headers. This route is a MOUNT: the app's header (back, the title switcher, the table
 * page's own Share and menu handed over by records-ui `TablePage.header`) and records-ui's
 * `TablePage`. The organization is said by the shell's indicator (declared here, lit there), never
 * by a notice row in the body.
 *
 * RED on the prior route: `RecordOrganizationSwitchOffer` drew "This table is in … Switch to …" in
 * the body above the table, the header was HeaderStructured with an organization line and no back
 * button, and `TablePage` was handed no header.
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TABLE = "c1aabdc0-4d94-42d4-9ddc-91b68ef9c0a7";
const ITS_ORG = "3e790542-fdaf-40b2-8bf3-658bf94fe67f";
const ACTIVE_ORG = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";

const declared: unknown[] = [];
let tablePageProps: Record<string, unknown> | null = null;

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("react").createElement("a", { href }, children),
}));
jest.mock("@ai-matrx/records-ui", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const R = require("react") as typeof import("react");
  return {
    RecordsMount: ({ children }: { children: React.ReactNode }) => R.createElement(R.Fragment, null, children),
    TablePage: (props: Record<string, unknown>) => {
      tablePageProps = props;
      const header = props.header as ((c: { actions: React.ReactNode; tableName: string | null }) => React.ReactNode) | undefined;
      return R.createElement(
        R.Fragment,
        null,
        header ? header({ actions: R.createElement("button", { "data-table-menu": "" }, "menu"), tableName: "Coding Accounts" }) : null,
        R.createElement("div", { "data-testid": "table-page" }),
      );
    },
    WhereItLives: () => R.createElement("span", { "data-testid": "where-it-lives" }),
    personActor: () => ({ actor: "user" }),
    recordsDataSource: () => ({}),
  };
});
jest.mock("@ai-matrx/records/react", () => ({ useTable: () => ({ data: { name: "Coding Accounts" }, error: null, loading: false }) }));
jest.mock("@ai-matrx/design-system", () => ({ Button: () => null }));
jest.mock("@ai-matrx/agents/mandates", () => ({ MANDATE_KEYS: { data__page_guidance: "data.page_guidance" } }));
jest.mock("@/features/agents/hooks/useAgentLauncher", () => ({ useAgentLauncher: () => ({ launchMandate: jest.fn() }) }));
jest.mock("@/features/access-gate/components/AccessGate", () => ({ AccessGate: () => null }));
jest.mock("@/features/sharing/components/TableTransferOffer", () => ({ TableTransferOffer: () => null }));
jest.mock("@/features/sharing/components/RecordStoreShareSurface", () => ({ recordStoreShare: () => null }));
jest.mock("@/features/sharing/outside/PendingTableInvitation", () => ({ PendingTableInvitation: () => null, usePendingTableInvitation: () => null }));
jest.mock("@/features/unified-data/record-chat/RecordScopedChat", () => ({ RecordScopedChat: () => null }));
jest.mock("@/features/shell/components/header/RouteHeader", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const R = require("react") as typeof import("react");
  return {
    __esModule: true,
    default: ({ left, right, fallback }: { left?: React.ReactNode; right?: React.ReactNode; fallback?: boolean }) =>
      R.createElement("header", { "data-route-header": fallback ? "fallback" : "page" }, left, right),
  };
});
// The prior route's header pieces, so the RED run on the prior bytes fails on what it drew, not on
// a missing layout API.
jest.mock("@/features/shell/components/header/PageHeader", () => ({
  __esModule: true,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  default: ({ children, fallback }: { children: React.ReactNode; fallback?: boolean }) => require("react").createElement("header", { "data-route-header": fallback ? "fallback" : "page" }, children),
}));
jest.mock("@/features/shell/components/header/variants/variants/HeaderStructured", () => ({
  __esModule: true,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  default: ({ title, context }: { title: string; context?: React.ReactNode }) => require("react").createElement("div", null, title, context),
}));
jest.mock("@ai-matrx/tap-target/buttons", () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ChevronLeftTapButton: ({ ariaLabel }: { ariaLabel: string }) => require("react").createElement("button", { "aria-label": ariaLabel, "data-back": "" }),
}));
jest.mock("@/features/unified-data/components/TableSwitcher", () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  TableSwitcher: ({ name }: { name: string }) => require("react").createElement("button", { "data-table-switcher": "" }, name),
}));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => "87a6e699-3622-4869-8843-d0867456c0dd", useAppDispatch: () => jest.fn() }));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({ selectUserId: () => null }));
jest.mock("@/features/organizations/service", () => ({ getOrganizationMembers: jest.fn() }));
jest.mock("@/features/organizations/components/OrganizationRequiredNotice", () => ({ OrganizationContextNotice: () => null }));
jest.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));
jest.mock("@/features/unified-data/hub/useSharedTable", () => ({ useSharedTable: () => ({ state: "none" }) }));
jest.mock("@/features/unified-data/objectOrganization", () => ({
  useObjectOrganization: () => ({ state: "found", organizationId: ITS_ORG, retry: jest.fn() }),
}));
jest.mock("@/features/shell/pageObjectOrganization", () => ({ useDeclarePageObjectOrganization: (d: unknown) => declared.push(d) }));
jest.mock("@/features/organizations/hooks", () => ({
  useUserOrganizations: () => ({ organizations: [{ id: ITS_ORG, name: "Arman's Org" }, { id: ACTIVE_ORG, name: "AI Matrx" }], loading: false }),
}));
jest.mock("@/features/unified-data/realtime/recordsRealtimePort", () => ({ createRecordsRealtimePort: () => undefined }));
jest.mock("@/lib/knobs/unifiedDataCampaign", () => ({ UNIFIED_DATA_CAMPAIGN: { check: jest.fn() } }));
jest.mock("@/lib/knobs/useUnifiedDataCampaignGate", () => ({ useUnifiedDataCampaign: () => ({ state: "on" }) }));
jest.mock("@/features/unified-data/components/UnifiedDataSwitchNotice", () => ({ UnifiedDataSwitchNotice: () => null }));
jest.mock("@/features/data-tables/components/SheetLayout", () => ({ SheetLayout: () => null }));
jest.mock("@/features/unified-data/row-agent-action/rowAgentAction", () => ({ runRowAgentAction: jest.fn() }));
jest.mock("@/lib/toast", () => ({ toast: { error: jest.fn() } }));
jest.mock("@/features/unified-data/row-change-agent/RowChangeAgentLink", () => ({
  ROW_CHANGE_AGENT_LABEL: "When a row changes, run an agent…",
  useRowChangeAgentOffer: () => ({ state: "absent" }),
}));
jest.mock("@/features/unified-data/recordsNotify", () => ({ RECORDS_NOTIFY: {} }));
jest.mock("@/lib/url-state/addressWithoutNavigating", () => ({ replaceAddressWithoutNavigating: jest.fn(), currentPathWithSearch: () => "" }));
jest.mock("@/features/unified-data/recordsFiles", () => ({ RECORDS_FILES: {} }));
jest.mock("@/components/agent-copy/page-capture/usePageCapture", () => ({ usePageCapture: () => undefined }));
jest.mock("@/components/agent-copy/page-capture/pageCapture", () => ({ tablePageCapture: () => ({}) }));
jest.mock("@/components/agent-copy/page-capture/PageCaptureButton", () => ({ PageCaptureButton: () => null }));
jest.mock("@/features/unified-data/page-capture/useTableCaptureContribution", () => ({ useTableCaptureContribution: () => undefined }));
jest.mock("@/features/unified-data/page-capture/shownViewCapture", () => ({ shownViewSelection: () => ({}) }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Route = require("../[tableId]/page").default as React.ComponentType<{ params: Promise<{ tableId: string }> }>;

let host: HTMLDivElement;
let root: Root;

async function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const params = Promise.resolve({ tableId: TABLE });
  await act(async () => {
    root.render(
      React.createElement(React.Suspense, { fallback: null }, React.createElement(Route, { params })),
    );
    await params;
  });
  await act(async () => new Promise((r) => setTimeout(r, 0)));
}

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  tablePageProps = null;
  declared.length = 0;
});

describe("the /data-v2 table route", () => {
  it("renders the header and the table page, and nothing else in the body", async () => {
    await mount();
    expect(host.querySelector("[data-testid='table-page']")).not.toBeNull();
    // No organization notice, no action row, no sentence: every element in the body is a header
    // (portalled into the shell in the app) or the table page itself.
    const body = host.querySelector("[data-testid='table-page']")!.parentElement!;
    const kinds = Array.from(body.children).map((el) =>
      el.matches("[data-route-header]") ? `header:${el.getAttribute("data-route-header")}` : el.matches("[data-testid='table-page']") ? "table" : el.outerHTML.slice(0, 60),
    );
    expect(kinds).toEqual(["header:fallback", "header:page", "table"]);
    expect(host.textContent).not.toContain("Switch to");
    expect(host.textContent).not.toContain("This table is in");
  });

  it("hands TablePage a header, and that header is the app's: back, the title switcher, the page's actions", async () => {
    await mount();
    expect(typeof tablePageProps?.header).toBe("function");
    expect(tablePageProps?.leading).toBeUndefined();
    const page = host.querySelector("[data-route-header='page']")!;
    expect(page.querySelector("[data-back]")).not.toBeNull();
    expect(page.querySelector("[data-table-switcher]")?.textContent).toBe("Coding Accounts");
    expect(page.querySelector("[data-table-menu]")).not.toBeNull();
  });

  it("declares the table's organization to the shell (lit there when it is not the active one), never showing it on the page", async () => {
    await mount();
    const last = declared.filter(Boolean).at(-1) as Record<string, unknown>;
    expect(last).toMatchObject({ organizationId: ITS_ORG, shownByPage: false, member: true });
  });
});
