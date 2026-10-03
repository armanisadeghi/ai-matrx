/**
 * Remount safety — work items: note, chat, file.
 *
 * SUT: each type's `Body` (and surface `Host`) from `items/catalog.ts`,
 * mounted as the board mounts a tile (`remount-safety/harness.tsx`), over the
 * real store and the recording service boundary (`remount-safety/fake-backend.ts`).
 * The break each case catches is named in its body.
 */

jest.mock("@/utils/supabase/client", () => {
  const { createFakeSupabase } = jest.requireActual("./remount-safety/fake-backend");
  const client = createFakeSupabase();
  return { createClient: () => client, supabase: client };
});
jest.mock("next/navigation", () => jest.requireActual("./remount-safety/next-navigation"));

import { act } from "react";
import { BOARD_ITEM_TYPES } from "../items/catalog";
import { expectRemountSafe, runCycle, typeInto } from "./remount-safety/harness";
import { installBrowserGaps } from "./remount-safety/browser-gaps";
import { NOTE_ID, NOTE_TEXT, seedNote } from "./remount-safety/fixtures-work";
import { remountType } from "./remount-safety/cases";

installBrowserGaps();

const type = (key: string) => {
  const t = BOARD_ITEM_TYPES.find((x) => x.key === key);
  if (!t) throw new Error(`no board item type ${key}`);
  return t;
};

const TYPED = `${NOTE_TEXT}\nReplace the smoke detector batteries before the walkthrough.`;
const CARET: [number, number] = [TYPED.indexOf("smoke"), TYPED.indexOf("smoke") + "smoke detector".length];
const NOTE_RECORD = [/^workbench\.notes$/];

/** Undo once in the note's editor, read the stored text, redo. */
function undoRoundTrip(ta: HTMLTextAreaElement, read: () => unknown): unknown {
  const key = (shiftKey: boolean) =>
    new KeyboardEvent("keydown", { key: "z", code: "KeyZ", ctrlKey: true, metaKey: true, shiftKey, bubbles: true, cancelable: true });
  act(() => void ta.dispatchEvent(key(false)));
  const afterUndo = read();
  act(() => void ta.dispatchEvent(key(true)));
  return afterUndo;
}

// Break: the note editor keeps the words in a view-local buffer that a remount
// rebuilds from the last saved copy, re-saves on mount, or re-reads the note.
// The default view (Split: the quick textarea beside the live preview).
remountType(
  "note",
  () =>
    runCycle(type("note"), { kind: "entity", entity: "note", id: NOTE_ID }, {
      title: "Unit 4B turnover checklist",
      prepare: () => {
        seedNote();
      },
      loadMs: 800,
      saveDelayMs: 3500,
      act: async (tile) => {
        const ta = tile.container.querySelector("textarea")!;
        await typeInto(ta, TYPED);
        act(() => ta.setSelectionRange(CARET[0], CARET[1]));
      },
      kept: (tile) => {
        const ta = tile.container.querySelector("textarea")!;
        const caret = [ta.selectionStart, ta.selectionEnd];
        const stored = () => tile.store.getState().notes.notes[NOTE_ID]?.content;
        return { shown: ta.value, stored: stored(), caret, afterUndo: undoRoundTrip(ta, stored) };
      },
    }),
  (r) =>
    expectRemountSafe(
      { ...r, keptAfterWake: pick(r.keptAfterWake, "shown", "stored"), keptAfterRemount: pick(r.keptAfterRemount, "shown", "stored") },
      { shown: TYPED, stored: TYPED },
      NOTE_RECORD,
    ),
  {
    // The caret / selection the person left in the Split view's textarea.
    "split-view caret": (r) =>
      expect({ wake: pick(r.keptAfterWake, "caret"), remount: pick(r.keptAfterRemount, "caret") }).toEqual({
        wake: { caret: CARET },
        remount: { caret: CARET },
      }),
    // ⌘Z after waking / remounting still undoes the typing (history is the note's, in Redux).
    "split-view undo": (r) =>
      expect({ wake: pick(r.keptAfterWake, "afterUndo"), remount: pick(r.keptAfterRemount, "afterUndo") }).toEqual({
        wake: { afterUndo: NOTE_TEXT },
        remount: { afterUndo: NOTE_TEXT },
      }),
  },
);

function pick(value: unknown, ...keys: string[]): Record<string, unknown> {
  const v = (value ?? {}) as Record<string, unknown>;
  return Object.fromEntries(keys.map((k) => [k, v[k]]));
}
