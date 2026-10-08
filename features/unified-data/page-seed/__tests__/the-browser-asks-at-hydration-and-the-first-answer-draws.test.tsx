/** @jest-environment jsdom */
// THE BROWSER NEVER WAITS FOR THE SERVER'S ROWS (lane SSR-ROWS-3, item 3).
//
// Dr. Patel opens "Visits". The server's reads are slow today (a 4 s store). Before this, the page
// sat behind the server's boundary until the cap (1.2 s) and only THEN asked for itself, so a miss
// cost the cap. Now the browser asks its own first reads the moment the page mounts, beside the
// server's boundary, and the page is drawn from whichever answer lands first. RED before: the
// browser's first read began only once the server's boundary resolved (4 s here).

import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Array<ReturnType<typeof createRoot>> = [];
async function render(element: React.ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(element));
}
const screen = {
  queryByTestId: (id: string) => document.querySelector(`[data-testid="${id}"]`),
  getByTestId: (id: string) => {
    const found = document.querySelector(`[data-testid="${id}"]`);
    if (!found) throw new Error(`no [data-testid="${id}"] in the document`);
    return found;
  },
};

const mockCalls: Array<{ what: string; at: number }> = [];
let mockOwnDelayMs = 300;

jest.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));
jest.mock("@/lib/boot/primaryContent", () => ({ holdPrimaryContent: () => () => {} }));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => "0a54df90-eab8-4d07-ab29-81a45fb41e04" }));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({ selectUserId: () => null }));
jest.mock("@ai-matrx/records-ui", () => ({
  TablePageSkeleton: () => <div data-testid="skeleton" />,
  RecordsSkeleton: () => <div data-testid="skeleton" />,
}));
jest.mock("../primeTablePage", () => ({ primeTablePage: () => {} }));
jest.mock("@/features/unified-data/table-page/UnifiedDataTablePage", () => ({
  UnifiedDataTablePage: () => <div data-testid="page" />,
}));
jest.mock("@/features/unified-data/table-page/UnifiedRecordPage", () => ({ UnifiedRecordPage: () => <div data-testid="record" /> }));
jest.mock("@ai-matrx/records/react", () => ({
  RecordsSeedProvider: ({ seed, children }: { seed: { from?: string } | null; children: React.ReactNode }) => (
    <div data-testid="seeded" data-from={seed?.from ?? "none"}>
      {children}
    </div>
  ),
}));
jest.mock("@/features/data-tables/records-ui-host/recordsUiHost", () => ({
  useRecordsDataSource: () => ({
    rpc: async (fn: string) => {
      mockCalls.push({ what: fn, at: Date.now() });
      return { data: { kind: "table", organization_id: "0a54df90-eab8-4d07-ab29-81a45fb41e04", path: null, live: true }, error: null };
    },
  }),
}));
jest.mock("@ai-matrx/records-ui/first-page", () => ({
  askTablePageSeed: () => {
    mockCalls.push({ what: "askTablePageSeed", at: Date.now() });
    return new Promise((resolve) =>
      setTimeout(() => resolve({ at: Date.now(), from: "browser", answers: [{ door: "table_page_bundle", args: {}, data: {} }] }), mockOwnDelayMs),
    );
  },
}));

import { forgetObjectOrganizations } from "../../objectOrganization";
import { PrimedRecordPage, PrimedTablePage } from "../PrimedTablePages";
import type { ServerRowsGate, TablePageSeed } from "../tablePageSeed.server";

const VISITS = "5a1e0000-0000-4000-8000-0000000000aa";
const ORG = "0a54df90-eab8-4d07-ab29-81a45fb41e04";

const later = <T,>(ms: number, value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));
const serverSeed = (): TablePageSeed => ({
  tableId: VISITS,
  where: { data: { kind: "table", organization_id: ORG }, error: null },
  organizationId: ORG,
  bundle: null,
  records: { at: Date.now(), answers: [], from: "server" } as unknown as TablePageSeed["records"],
});

beforeEach(() => {
  document.body.innerHTML = "";
  jest.useFakeTimers();
  mockCalls.length = 0;
  mockOwnDelayMs = 300;
  forgetObjectOrganizations();
});
afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()));
  jest.useRealTimers();
});

it("A 4 s STORE: the browser's own read starts within 100 ms of mounting and the rows land at the browser's time, not at the cap", async () => {
  const t0 = Date.now();
  const gate = later<ServerRowsGate>(4000, { on: true, capMs: 1200 });
  const seed = later<TablePageSeed | null>(4000, serverSeed());
  await render(<PrimedTablePage tableId={VISITS} gate={gate} seed={seed} />);
  await act(async () => {
    await jest.advanceTimersByTimeAsync(50);
  });
  const firstOwnRead = mockCalls.find((c) => c.what === "where_id_opens");
  expect(firstOwnRead).toBeDefined();
  expect(firstOwnRead!.at - t0).toBeLessThan(100);
  expect(screen.getByTestId("skeleton")).toBeTruthy();
  expect(screen.queryByTestId("page")).toBeNull();
  await act(async () => {
    await jest.advanceTimersByTimeAsync(300);
  });
  // ~350 ms: the browser's own answer drew the page — the cap (1200 ms) and the store (4 s) are far off.
  expect(Date.now() - t0).toBeLessThan(1200);
  expect(screen.getByTestId("page")).toBeTruthy();
  expect(screen.getByTestId("seeded").getAttribute("data-from")).toBe("browser");
  // the server's seed landing later is discarded: no second draw from it
  await act(async () => {
    await jest.advanceTimersByTimeAsync(4000);
  });
  expect(screen.getByTestId("seeded").getAttribute("data-from")).toBe("browser");
});

it("a server seed that lands first draws the page, and the browser's later answer changes nothing", async () => {
  mockOwnDelayMs = 2000;
  const gate = Promise.resolve<ServerRowsGate>({ on: true, capMs: 1200 });
  const seed = later<TablePageSeed | null>(200, serverSeed());
  await render(<PrimedTablePage tableId={VISITS} gate={gate} seed={seed} />);
  await act(async () => {
    await jest.advanceTimersByTimeAsync(250);
  });
  expect(screen.getByTestId("seeded").getAttribute("data-from")).toBe("server");
  await act(async () => {
    await jest.advanceTimersByTimeAsync(2500);
  });
  expect(screen.getByTestId("seeded").getAttribute("data-from")).toBe("server");
});

it("the server says no rows (knob off): the browser's own answer draws the page", async () => {
  const gate = Promise.resolve<ServerRowsGate>({ on: false, capMs: 1200 });
  const seed = Promise.resolve<TablePageSeed | null>(null);
  await render(<PrimedTablePage tableId={VISITS} gate={gate} seed={seed} />);
  await act(async () => {
    await jest.advanceTimersByTimeAsync(400);
  });
  expect(screen.getByTestId("seeded").getAttribute("data-from")).toBe("browser");
});

const RECORD = "01627457-8a65-42f5-8592-71cc626a77c9";

it("THE RECORD PAGE, a 4 s store: its own read starts within 100 ms and the record is drawn at the browser's time, not at the cap", async () => {
  const t0 = Date.now();
  const gate = later<ServerRowsGate>(4000, { on: true, capMs: 1200 });
  const seed = later<TablePageSeed | null>(4000, { ...serverSeed(), recordId: RECORD });
  await render(<PrimedRecordPage tableId={VISITS} recordId={RECORD} gate={gate} seed={seed} />);
  await act(async () => {
    await jest.advanceTimersByTimeAsync(50);
  });
  const firstOwnRead = mockCalls.find((c) => c.what === "where_id_opens");
  expect(firstOwnRead!.at - t0).toBeLessThan(100);
  expect(screen.queryByTestId("record")).toBeNull();
  await act(async () => {
    await jest.advanceTimersByTimeAsync(300);
  });
  expect(Date.now() - t0).toBeLessThan(1200);
  expect(screen.getByTestId("record")).toBeTruthy();
  expect(screen.getByTestId("seeded").getAttribute("data-from")).toBe("browser");
  await act(async () => {
    await jest.advanceTimersByTimeAsync(4000);
  });
  expect(screen.getByTestId("seeded").getAttribute("data-from")).toBe("browser");
});

it("THE RECORD PAGE: a server seed for this record that lands first draws it, and the browser's later answer changes nothing", async () => {
  mockOwnDelayMs = 2000;
  const gate = Promise.resolve<ServerRowsGate>({ on: true, capMs: 1200 });
  const seed = later<TablePageSeed | null>(200, { ...serverSeed(), recordId: RECORD });
  await render(<PrimedRecordPage tableId={VISITS} recordId={RECORD} gate={gate} seed={seed} />);
  await act(async () => {
    await jest.advanceTimersByTimeAsync(250);
  });
  expect(screen.getByTestId("seeded").getAttribute("data-from")).toBe("server");
  await act(async () => {
    await jest.advanceTimersByTimeAsync(2500);
  });
  expect(screen.getByTestId("seeded").getAttribute("data-from")).toBe("server");
});
