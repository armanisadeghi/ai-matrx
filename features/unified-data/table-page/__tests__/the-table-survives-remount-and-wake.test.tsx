/**
 * @jest-environment jsdom
 *
 * THE TABLE SURVIVES A WAKE AND A REMOUNT (lane REMOUNT-SAFETY, owner's law 2026-10-02: every
 * screen survives hide/show/remount with no lost work and no repeated side effects).
 *
 * A record-store table — the /data page and the Board's Table and Record tiles — sits behind
 * three gates: where the table lives (`useObjectOrganization`), whether that organization's record
 * store is on (`useUnifiedDataCampaign`) and whether it is a share (`useSharedTable`). Each kept
 * its answer in component state and set it back to null at the top of its effect, so:
 *
 *   - a WAKE (React `<Activity>` hidden → visible, which is how a Board tile sleeps; every effect
 *     re-runs) dropped the page to "Opening the table…" and UNMOUNTED the grid — its scroll,
 *     selection, a half-typed cell and column state went with it — then asked every door again;
 *   - a REMOUNT (a tile removed and brought back with Undo) showed "Opening the table…" before the
 *     grid came back, and asked every door again.
 *
 * RED on the prior hooks: the wake unmounts the content (mounts 2, the draft is gone, "Opening"
 * is drawn) and the doors are asked again. GREEN: the content stays mounted, the draft stays, no
 * commit ever draws "Opening", and no door is asked twice.
 */
import * as React from "react";
import { Activity, act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TABLE = "c1aabdc0-4d94-42d4-9ddc-91b68ef9c0a7";
const ITS_ORG = "3e790542-fdaf-40b2-8bf3-658bf94fe67f";

const whereIdOpens = jest.fn(async () => ({
  data: { kind: "table", organization_id: ITS_ORG, path: `/data/${TABLE}`, live: true, resolved_id: TABLE },
  error: null,
}));
const sharedWithMe = jest.fn(async () => ({ ok: true as const, data: [] }));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock("@ai-matrx/records-ui", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const R = require("react") as typeof import("react");
  const dataSource = { rpc: (...args: unknown[]) => whereIdOpens(...(args as [])) };
  return {
    RecordsMount: ({ children }: { children: React.ReactNode }) => R.createElement(R.Fragment, null, children),
    TablePage: () => null,
    TablePageSkeleton: () => null,
    skeletonLayoutFor: () => "grid",
    WhereItLives: () => null,
    personActor: () => ({ actor: "user" }),
    recordsDataSource: () => dataSource,
  };
});
jest.mock("@ai-matrx/design-system", () => ({ Button: () => null }));
jest.mock("@/features/access-gate/components/AccessGate", () => ({ AccessGate: () => null }));
jest.mock("@/features/sharing/components/TableTransferOffer", () => ({ TableTransferOffer: () => null }));
jest.mock("@/features/sharing/outside/PendingTableInvitation", () => ({
  PendingTableInvitation: () => null,
  usePendingTableInvitation: () => null,
}));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => "87a6e699-3622-4869-8843-d0867456c0dd", useAppDispatch: () => jest.fn() }));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({ selectUserId: () => null }));
jest.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));
jest.mock("@/features/unified-data/hub/doors", () => ({ tablesSharedWithMe: (...args: unknown[]) => sharedWithMe(...(args as [])) }));
jest.mock("@/features/organizations/hooks", () => ({
  useUserOrganizations: () => ({ organizations: [{ id: ITS_ORG, name: "Cedar Ridge Physical Therapy" }], loading: false }),
}));
jest.mock("@ai-matrx/records/realtime", () => ({ createRecordsRealtimePort: () => undefined }));
jest.mock("@/features/data-tables/records-ui-host/recordsUiHost", () => {
  // The host's one data seam: the mocked records-ui seam, one per run (the real hook shares one).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const seam = () => require("@ai-matrx/records-ui").recordsDataSource();
  return {
    recordsUiHostFor: () => ({}),
    useRecordsUiPorts: () => ({}),
    useRecordsDataSource: seam,
    useAppRecordsConfig: (organizationId: string | null) => ({ dataSource: seam(), actor: null, organizationId }),
  };
});
jest.mock("@/features/data-tables/records-ui-host/mergedGridKnob", () => ({ useMergedGridKnob: () => true }));
jest.mock("@/lib/toast", () => ({ toast: { error: jest.fn(), loading: jest.fn(), success: jest.fn(), info: jest.fn() } }));
jest.mock("@/features/unified-data/row-change-agent/RowChangeAgentLink", () => ({
  ROW_CHANGE_AGENT_LABEL: "When a row changes, run an agent…",
  useRowChangeAgentOffer: () => ({ state: "absent" }),
}));
jest.mock("@/features/unified-data/grid-agent-context/RecordStoreTableSurface", () => ({
  RecordStoreTableSurface: ({ children }: { children: React.ReactNode }) => children,
  useGridContextChannel: () => ({}),
}));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));

import { NO_ADDRESS, UnifiedTableBody, useUnifiedTable } from "../UnifiedTable";

/** Stands in for the grid: it counts its mounts and holds a half-typed cell in its own state. */
let gridMounts = 0;
let setDraft: (text: string) => void = () => {};
function Grid() {
  // A state initializer runs on a real mount only (a wake re-runs effects, never initializers).
  const [draft, keepDraft] = useState(() => {
    gridMounts += 1;
    return "";
  });
  setDraft = keepDraft;
  return <div data-grid="">{draft}</div>;
}

let retryWhere: () => void = () => {};
function TableTile() {
  const mount = useUnifiedTable({ tableId: TABLE, address: NO_ADDRESS });
  retryWhere = mount.object.retry;
  return <UnifiedTableBody mount={mount} content={<Grid />} />;
}

/** Every commit's text, so a one-frame "Opening the table…" cannot hide between assertions. */
const commits: string[] = [];
function Board({ awake, onBoard }: { awake: boolean; onBoard: boolean }) {
  useEffect(() => {
    commits.push(document.body.textContent ?? "");
  });
  return onBoard ? (
    <Activity mode={awake ? "visible" : "hidden"}>
      <TableTile />
    </Activity>
  ) : null;
}

let host: HTMLDivElement;
let root: Root;
async function draw(props: { awake: boolean; onBoard: boolean }) {
  await act(async () => {
    root.render(<Board {...props} />);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("a wake keeps the grid mounted with its work, and asks no door again", async () => {
  await draw({ awake: true, onBoard: true });
  expect(host.querySelector("[data-grid]")).not.toBeNull();
  expect(gridMounts).toBe(1);
  const asked = { where: whereIdOpens.mock.calls.length, share: sharedWithMe.mock.calls.length };
  expect(asked).toEqual({ where: 1, share: 1 });

  act(() => setDraft("Cedar Ridge — follow-up Tuesday"));
  commits.length = 0;
  await draw({ awake: false, onBoard: true });
  await draw({ awake: true, onBoard: true });

  expect(commits.some((text) => text.includes("Opening the table"))).toBe(false);
  expect(gridMounts).toBe(1);
  expect(host.querySelector("[data-grid]")?.textContent).toBe("Cedar Ridge — follow-up Tuesday");
  expect(whereIdOpens.mock.calls.length).toBe(asked.where);
  expect(sharedWithMe.mock.calls.length).toBe(asked.share);
});

it("a remount (removed, then Undo) draws the grid on its first commit and asks no door again", async () => {
  const before = { where: whereIdOpens.mock.calls.length, share: sharedWithMe.mock.calls.length };
  commits.length = 0;
  await draw({ awake: true, onBoard: false });
  await act(async () => {
    root.render(<Board awake onBoard />);
  });
  // The very first commit after the tile comes back already holds the grid.
  expect(host.querySelector("[data-grid]")).not.toBeNull();
  expect(commits.some((text) => text.includes("Opening the table"))).toBe(false);
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  expect(whereIdOpens.mock.calls.length).toBe(before.where);
  expect(sharedWithMe.mock.calls.length).toBe(before.share);
});

it("asking again (Try again, a move) re-asks the door without unmounting the grid", async () => {
  const mounts = gridMounts;
  const before = whereIdOpens.mock.calls.length;
  commits.length = 0;
  await act(async () => {
    retryWhere();
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  expect(whereIdOpens.mock.calls.length).toBe(before + 1);
  expect(commits.some((text) => text.includes("Opening the table"))).toBe(false);
  expect(gridMounts).toBe(mounts);
});
