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
import { CHAT_REPLY, CONVERSATION_ID, FILE_ID, NOTE_ID, NOTE_TEXT, seedChat, seedFile, seedNote } from "./remount-safety/fixtures-work";
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

// Break: the chat tile relaunches or re-resumes its conversation on wake,
// re-reads the transcript into local state, or loses the unsent draft.
const DRAFT = "Also add the Portland relocation-assistance paragraph";
remountType(
  "chat",
  () =>
    runCycle(type("chat"), { kind: "entity", entity: "chat", id: CONVERSATION_ID }, {
      title: "Rent increase notice for Unit 4B",
      prepare: seedChat,
      loadMs: 1000,
      act: async (tile) => {
        await typeInto(tile.container.querySelector("textarea")!, DRAFT);
      },
      kept: (tile) => ({
        draft: tile.container.querySelector("textarea")?.value,
        reply: (tile.container.textContent ?? "").includes(CHAT_REPLY),
        saved: tile.source(),
      }),
    }),
  (r) =>
    expectRemountSafe(
      r,
      { draft: DRAFT, reply: true, saved: { kind: "entity", entity: "chat", id: CONVERSATION_ID } },
      [/^chat\.conversation$/, /^chat\.message$/, /^get_cx_conversation_bundle$/],
    ),
);

// Break: the file tile re-reads the file's record or re-downloads its preview
// bytes on wake/remount instead of keeping them by file id.
remountType(
  "file",
  () =>
    runCycle(type("file"), { kind: "entity", entity: "file", id: FILE_ID }, {
      title: "unit-4b-pet-addendum.md",
      prepare: seedFile,
      loadMs: 800,
      kept: (tile) => ({
        preview: (tile.container.textContent ?? "").includes("Pet deposit $300, refundable at move-out."),
        saved: tile.source(),
      }),
    }),
  (r) =>
    expectRemountSafe(r, { preview: true, saved: { kind: "entity", entity: "file", id: FILE_ID } }, [
      /^files\.files$/,
      new RegExp(`/files/${FILE_ID}(\\?|/download)`),
    ]),
);

function pick(value: unknown, ...keys: string[]): Record<string, unknown> {
  const v = (value ?? {}) as Record<string, unknown>;
  return Object.fromEntries(keys.map((k) => [k, v[k]]));
}
