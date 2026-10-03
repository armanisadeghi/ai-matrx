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

import { BOARD_ITEM_TYPES } from "../items/catalog";
import { expectRemountSafe, runCycle } from "./remount-safety/harness";
import { installBrowserGaps } from "./remount-safety/browser-gaps";
import { DOCUMENT_ID, DOCUMENT_TEXT, seedDocument } from "./remount-safety/fixtures-feature";
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
