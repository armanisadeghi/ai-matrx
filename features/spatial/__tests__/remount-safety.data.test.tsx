/**
 * Remount safety — the document, the data table and the data record.
 *
 * SUT: each type's `Body` from `items/catalog.ts`, mounted as the board mounts
 * a tile (`remount-safety/harness.tsx`), over the real store and the recording
 * service boundary.
 *
 * The document's editor engine (Univer) paints on canvas and cannot boot in
 * jsdom: it stands in at `createUniver` (`remount-safety/univer-standin.ts`),
 * and the case asserts on the store layer — the document model and what it
 * hands a new editor. Everything above that door is real.
 */

jest.mock("@/utils/supabase/client", () => {
  const { createFakeSupabase } = jest.requireActual("./remount-safety/fake-backend");
  const client = createFakeSupabase();
  return { createClient: () => client, supabase: client };
});
jest.mock("next/navigation", () => jest.requireActual("./remount-safety/next-navigation"));
jest.mock("@univerjs/presets", () => jest.requireActual("./remount-safety/univer-standin").univerModules.presets());
jest.mock("@univerjs/core", () => jest.requireActual("./remount-safety/univer-standin").univerModules.core());
jest.mock("@univerjs/themes", () => jest.requireActual("./remount-safety/univer-standin").univerModules.themes());
jest.mock("@univerjs/preset-docs-core", () => jest.requireActual("./remount-safety/univer-standin").univerModules.docsPreset());
jest.mock("@univerjs/preset-docs-core/locales/en-US", () => jest.requireActual("./remount-safety/univer-standin").univerModules.locale());
jest.mock("@univerjs/preset-docs-core/lib/index.css", () => ({}));
jest.mock("@univerjs/preset-sheets-core", () => jest.requireActual("./remount-safety/univer-standin").univerModules.sheetsPreset());
jest.mock("@univerjs/preset-sheets-core/locales/en-US", () => jest.requireActual("./remount-safety/univer-standin").univerModules.locale());
jest.mock("@univerjs/engine-render", () => jest.requireActual("./remount-safety/univer-standin").univerModules.engineRender());

jest.mock("@ai-matrx/records-ui", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const R = require("react") as typeof import("react");
  const actual = jest.requireActual("@ai-matrx/records-ui");
  const { recordsEngine, RENT_ROLL, UNIT_4B_ROW } = jest.requireActual("./remount-safety/fixtures-feature");
  const counted = (key: "gridMounts" | "peekMounts", text: string) =>
    function StandIn() {
      // Counted once per real mount — a wake re-runs effects but keeps state.
      R.useState(() => {
        recordsEngine[key] += 1;
        return true;
      });
      return R.createElement("div", { "data-records-engine": key }, text);
    };
  return {
    ...actual,
    RecordsMount: ({ children }: { children: import("react").ReactNode }) => R.createElement(R.Fragment, null, children),
    TablePage: counted("gridMounts", `${RENT_ROLL.name} grid`),
    Peek: counted("peekMounts", `${UNIT_4B_ROW.unit} · ${UNIT_4B_ROW.tenant}`),
    useRecordRights: () => ({ data: { canEdit: true }, loading: false, error: null }),
  };
});
jest.mock("@ai-matrx/records/react", () => {
  const actual = jest.requireActual("@ai-matrx/records/react");
  const { RENT_ROLL, UNIT_4B_ROW } = jest.requireActual("./remount-safety/fixtures-feature");
  const answer = (data: unknown) => ({ data, loading: false, error: null, reload: () => undefined });
  return {
    ...actual,
    // The store client's one call a tile makes directly; it goes through the recorded backend.
    useRecordsClient: () => ({
      rowActions: async (args: unknown) => {
        const { supabase } = jest.requireMock("@/utils/supabase/client");
        const { data } = await supabase.schema("custom").rpc("row_actions", args);
        return { ok: true, data: { actions: data ?? [] } };
      },
    }),
    useTable: () => answer(RENT_ROLL),
    useFields: () => answer([{ key: "unit", label: "Unit" }, { key: "rent", label: "Rent" }, { key: "tenant", label: "Tenant" }]),
    useRecords: () => answer({ rows: [UNIT_4B_ROW] }),
    useRecord: () => answer(UNIT_4B_ROW),
    useRecordRights: () => answer({ canEdit: true }),
    useRecordChangeRevision: () => 0,
  };
});

import { BOARD_ITEM_TYPES } from "../items/catalog";
import { expectRemountSafe, runCycle } from "./remount-safety/harness";
import { installBrowserGaps } from "./remount-safety/browser-gaps";
import {
  DATA_RECORD_ID,
  DOCUMENT_ID,
  DOCUMENT_TEXT,
  TABLE_ID,
  recordsEngine,
  seedDataTable,
  seedDocument,
} from "./remount-safety/fixtures-feature";
import { liveUniverDocument, univerInstances } from "./remount-safety/univer-standin";
import { remountType } from "./remount-safety/cases";

installBrowserGaps();

const type = (key: string) => {
  const t = BOARD_ITEM_TYPES.find((x) => x.key === key);
  if (!t) throw new Error(`no board item type ${key}`);
  return t;
};

// Break: the document tile rebuilds its editor from the server's snapshot on
// wake/remount (losing the words typed since the last save) or re-reads it.
const ADDED = " A late fee of $75 applies after the 5th.";
remountType(
  "udt_document",
  () =>
    runCycle(type("udt_document"), { kind: "entity", entity: "udt_document", id: DOCUMENT_ID }, {
      title: "Unit 4B lease — 2027",
      prepare: seedDocument,
      loadMs: 1200,
      // The document model saves 2.5 s after the last edit.
      saveDelayMs: 3000,
      act: async () => {
        const doc = liveUniverDocument();
        if (!doc) throw new Error(`the document editor never mounted (instances: ${univerInstances().length})`);
        doc.type(ADDED);
      },
      kept: () => liveUniverDocument()?.text().replace(/\r\n$/, ""),
    }),
  (r) => expectRemountSafe(r, `${DOCUMENT_TEXT}${ADDED}`, [/^workbench\.udt_documents$/, /^workbench\.udt_document_snapshots$/]),
);

// Break: the table tile's gates (where the table lives, whether the store is
// on, whether it is shared) forget their answers on wake — "Opening the
// table…", the grid unmounted, every door asked again.
const ownTableDoors = [/^where_id_opens$/, /^unified_data_store_on$/, /^tables_shared_with_me$/];
remountType(
  "data-table",
  () =>
    runCycle(type("data-table"), { kind: "entity", entity: "data-table", id: TABLE_ID }, {
      title: "Rent roll",
      prepare: () => {
        seedDataTable();
        recordsEngine.gridMounts = 0;
      },
      loadMs: 800,
      kept: (tile) => ({
        grid: tile.container.querySelector('[data-records-engine="gridMounts"]') !== null,
        opening: (tile.container.textContent ?? "").includes("Opening the table"),
        mounts: recordsEngine.gridMounts,
      }),
    }),
  // One mount for the first open; a wake keeps it (still 1); a remount mounts it once more (2).
  (r) => {
    expect(r.keptAfterWake).toEqual({ grid: true, opening: false, mounts: 1 });
    expect(r.keptAfterRemount).toEqual({ grid: true, opening: false, mounts: 2 });
    expectRemountSafe({ ...r, keptAfterWake: null, keptAfterRemount: null }, null, ownTableDoors);
  },
);

remountType(
  "record",
  () =>
    runCycle(type("record"), { kind: "record", tableId: TABLE_ID, recordId: DATA_RECORD_ID }, {
      title: "Unit 4B",
      prepare: () => {
        seedDataTable();
        recordsEngine.peekMounts = 0;
      },
      loadMs: 800,
      kept: (tile) => ({
        peek: (tile.container.textContent ?? "").includes("Unit 4B · Priya Raman"),
        mounts: recordsEngine.peekMounts,
      }),
    }),
  (r) => {
    expect(r.keptAfterWake).toEqual({ peek: true, mounts: 1 });
    expect(r.keptAfterRemount).toEqual({ peek: true, mounts: 2 });
    expectRemountSafe({ ...r, keptAfterWake: null, keptAfterRemount: null }, null, ownTableDoors);
  },
);
