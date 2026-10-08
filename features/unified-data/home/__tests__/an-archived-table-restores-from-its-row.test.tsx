/**
 * TABLE-ACTIONS item 10 — AN ARCHIVED TABLE IN THE DATA HOME'S ARCHIVED FILTER OFFERS RESTORE,
 * AND RESTORE IS THE STORE'S PAGED RESTORE (custom.table_restore, looped until done — one
 * record_restore call timed out on a big table) IN THE TABLE'S OWN ORGANIZATION.
 * Breaks named:
 * - the archived row gets the live table's action list (Archive table again, no Restore) → red.
 * - Restore asks the wrong organization, or restores the wrong id → red.
 * - Restore stops after the first pass, before the store says done → red.
 * - a failed restore reads as done (no error surfaces, the list is told it changed) → red.
 * - a statement timeout shows Postgres's sentence in the toast → red.
 * - a live table row grows a Restore → red.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { ItemMenuCommand, ItemMenuConfig } from "@ai-matrx/chat/ui/item-types";
import type { EntityListController } from "@/lib/entity-list/config";
import { archivedTableRow, type DataHomeRow } from "../dataHomeRows";
import { ORGS, row } from "./fixtures";

// The store, at the one seam the restore uses: `custom.table_restore` through the data source.
const rpc = jest.fn();
jest.mock("@ai-matrx/records/core", () => ({ createRecordsClient: jest.fn() }));
jest.mock("@ai-matrx/records/react", () => ({
  RecordsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useRecordsClient: () => ({
    config: { organizationId: null, dataSource: { rpc: (...a: unknown[]) => rpc(...a) } },
    myLevels: async () => ({ ok: true, data: [] }),
  }),
}));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }));
jest.mock("@/features/unified-data/actions/useTableFavorite", () => ({ useStarToggle: () => ({ toggle: jest.fn() }) }));

// eslint-disable-next-line import/first
import { useDataHomeRowMenus } from "../useDataHomeRowMenus";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const retiredIntake = archivedTableRow({
  id: "b3f1c2d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
  document: { name: "Retired Referral Intake" },
  archived_at: "2026-09-20T10:00:00.000Z",
  archived_by_name: "Dana Reyes",
  organization_id: ORGS.harbor.id,
  organization_name: ORGS.harbor.name,
});

let host: HTMLDivElement;
let root: Root;
let menuFor: ((row: DataHomeRow) => () => ItemMenuConfig) | null = null;
const onChanged = jest.fn();

function Probe() {
  const menus = useDataHomeRowMenus({ starred: new Set(), onOpened: () => undefined, onChanged, onHide: () => undefined, onUnhide: () => undefined });
  const result = menus.useRowActions({ rows: [] } as unknown as EntityListController<DataHomeRow>);
  menuFor = result.actions.menuFor as unknown as typeof menuFor;
  return null;
}

beforeEach(async () => {
  rpc.mockReset();
  onChanged.mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<Probe />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const entries = (config: ItemMenuConfig) => config.sections.flatMap((s) => s.items);
const restoreOf = (config: ItemMenuConfig) => entries(config).find((e) => e.id === "restore") as ItemMenuCommand | undefined;

it("an archived table's menu is Open and Restore, never the live list", () => {
  const config = menuFor!(retiredIntake)();
  expect(entries(config).map((e) => e.id)).toEqual(["open", "open-tab", "restore"]);
});

const TABLE = "b3f1c2d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const pass = (done: boolean) => ({
  data: { table_id: TABLE, table_name: "Retired Referral Intake", restored: done ? 4 : 18, structure_restored: done ? 0 : 7,
          built_on_restored: done ? 5 : 0, remaining: done ? 0 : 4, built_on_remaining: done ? 0 : 5, left: 0,
          table_restored: true, done, message: "" },
  error: null,
});

it("Restore restores that table in its own organization, pass after pass until done, then re-reads the list", async () => {
  rpc.mockResolvedValueOnce(pass(false)).mockResolvedValueOnce(pass(true));
  await restoreOf(menuFor!(retiredIntake)())!.onSelect();
  expect(rpc.mock.calls).toEqual([
    ["table_restore", { p_organization_id: ORGS.harbor.id, p_table_id: TABLE, p_chunk: 20 }, { schema: "custom" }],
    ["table_restore", { p_organization_id: ORGS.harbor.id, p_table_id: TABLE, p_chunk: 20 }, { schema: "custom" }],
  ]);
  expect(onChanged).toHaveBeenCalledTimes(1);
});

it("a refused restore throws the store's words and changes nothing", async () => {
  rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "You need Admin access to restore this table." } });
  await expect(restoreOf(menuFor!(retiredIntake)())!.onSelect()).rejects.toThrow("You need Admin access to restore this table.");
  expect(onChanged).not.toHaveBeenCalled();
});

it("a timed-out restore is said in a person's words", async () => {
  rpc.mockResolvedValue({ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } });
  await expect(restoreOf(menuFor!(retiredIntake)())!.onSelect()).rejects.toThrow("The restore took too long. Try again in a moment.");
});

it("a live table row has no Restore", () => {
  const live = row({ name: "Referral Intake Queue", tableId: "c4a2d3e5-6f70-4b8c-9dae-1f2a3b4c5d6e" });
  expect(restoreOf(menuFor!(live)())).toBeUndefined();
});
