/**
 * TABLE-ACTIONS item 10 — AN ARCHIVED TABLE IN THE DATA HOME'S ARCHIVED FILTER OFFERS RESTORE,
 * AND RESTORE IS THE STORE'S ONE RESTORE IN THE TABLE'S OWN ORGANIZATION.
 * Breaks named:
 * - the archived row gets the live table's action list (Archive table again, no Restore) → red.
 * - Restore asks the wrong organization, or restores the wrong id → red.
 * - a failed restore reads as done (no error surfaces, the list is told it changed) → red.
 * - a live table row grows a Restore → red.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { ItemMenuCommand, ItemMenuConfig } from "@/components/official/item/types";
import type { EntityListController } from "@/lib/entity-list/config";
import { archivedTableRow, type DataHomeRow } from "../dataHomeRows";
import { ORGS, row } from "./fixtures";

const recordRestore = jest.fn();
const createRecordsClient = jest.fn((config: { organizationId: string | null }) => ({ config, recordRestore }));
jest.mock("@ai-matrx/records/core", () => ({ createRecordsClient: (c: never) => createRecordsClient(c) }));
jest.mock("@ai-matrx/records/react", () => ({
  RecordsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useRecordsClient: () => ({ config: { organizationId: null }, myLevels: async () => ({ ok: true, data: [] }) }),
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
  const menus = useDataHomeRowMenus({ starred: new Set(), onOpened: () => undefined, onChanged });
  const result = menus.useRowActions({ rows: [] } as unknown as EntityListController<DataHomeRow>);
  menuFor = result.actions.menuFor as unknown as typeof menuFor;
  return null;
}

beforeEach(async () => {
  recordRestore.mockReset();
  createRecordsClient.mockClear();
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

it("Restore restores that table in its own organization, then re-reads the list", async () => {
  recordRestore.mockResolvedValue({ ok: true, data: undefined });
  await restoreOf(menuFor!(retiredIntake)())!.onSelect();
  expect(createRecordsClient.mock.calls.map((c) => c[0].organizationId)).toEqual([ORGS.harbor.id]);
  expect(recordRestore).toHaveBeenCalledWith({ record_id: "b3f1c2d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d" });
  expect(onChanged).toHaveBeenCalledTimes(1);
});

it("a refused restore throws the store's words and changes nothing", async () => {
  recordRestore.mockResolvedValue({ ok: false, error: { code: "refused_by_rule", message: "You need Admin access to restore this table." } });
  await expect(restoreOf(menuFor!(retiredIntake)())!.onSelect()).rejects.toThrow("You need Admin access to restore this table.");
  expect(onChanged).not.toHaveBeenCalled();
});

it("a live table row has no Restore", () => {
  const live = row({ name: "Referral Intake Queue", tableId: "c4a2d3e5-6f70-4b8c-9dae-1f2a3b4c5d6e" });
  expect(restoreOf(menuFor!(live)())).toBeUndefined();
});
