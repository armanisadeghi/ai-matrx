/**
 * Remount safety — work items: note, chat, agent form, file.
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
import { expectRemountSafe, richEditorIn, richSelectionOf, runCycle, selectInRich, settle, showNoteView, showSplitView, typeInto, typeIntoRich } from "./remount-safety/harness";
import { installBrowserGaps } from "./remount-safety/browser-gaps";
import { CHAT_REPLY, CONVERSATION_ID, FILE_ID, NOTE_ID, NOTE_TEXT, seedChat, seedFile, seedNote } from "./remount-safety/fixtures-work";
import { remountType } from "./remount-safety/cases";

installBrowserGaps();

const type = (key: string) => {
  const t = BOARD_ITEM_TYPES.find((x) => x.key === key);
  if (!t) throw new Error(`no board item type ${key}`);
  return t;
};

// The person writes the second paragraph in Write (the rich editor), then looks at it in
// Split; the stored copy is the markdown of both paragraphs.
const SECOND_PARAGRAPH = "Replace the smoke detector batteries before the walkthrough.";
const TYPED = `${NOTE_TEXT}\n\n${SECOND_PARAGRAPH}`;
const CARET: [number, number] = [TYPED.indexOf("smoke"), TYPED.indexOf("smoke") + "smoke detector".length];
const WRITE_WORDS = "batteries before";
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
// Typed in Write, then kept in Split (the quick textarea beside the live preview).
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
        const rich = richEditorIn(tile.container);
        if (!rich) throw new Error("the note's Write editor never rendered");
        await typeIntoRich(rich, ["", SECOND_PARAGRAPH]);
        await settle(3500);
        // The person selects words in Write, then looks at the note in Split and back.
        selectInRich(rich, WRITE_WORDS);
        await showSplitView(tile);
        const ta = tile.container.querySelector("textarea");
        if (!ta) throw new Error("the note's Split view never rendered its textarea");
        act(() => ta.setSelectionRange(CARET[0], CARET[1]));
        // ...and leaves the tile on Write, with both carets kept.
        await showNoteView(tile, "Write");
      },
      kept: async (tile) => {
        // Write first (the tile shows what the person left), then Split for the textarea's own probes.
        const write = richSelectionOf(tile.container);
        await showSplitView(tile);
        const ta = tile.container.querySelector("textarea")!;
        const caret = [ta.selectionStart, ta.selectionEnd];
        const stored = () => tile.store.getState().notes.notes[NOTE_ID]?.content;
        const shown = ta.value;
        const afterUndo = undoRoundTrip(ta, stored);
        // The round trip is this probe's, not the person's: leave the caret
        // where the person left it for the next step of the cycle.
        act(() => ta.setSelectionRange(caret[0] ?? 0, caret[1] ?? 0));
        await showNoteView(tile, "Write");
        return { shown, stored: stored(), caret, afterUndo, write };
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
    // The selection the person left in the Write editor (the rich one), not just the Split textarea's.
    // (Positions shift when the editor rebuilds its document from the saved text, so the selection is judged by the words it covers.)
    "write caret": (r) => {
      const covered = (kept: unknown) => (kept as { write?: { text?: string } } | undefined)?.write?.text;
      expect({ wake: covered(r.keptAfterWake), remount: covered(r.keptAfterRemount) }).toEqual({
        wake: WRITE_WORDS,
        remount: WRITE_WORDS,
      });
    },
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

// Break: the agent-form tile relaunches or re-resumes its run on wake, loses the
// shaped reply, or moves off the saved run. Its record is the run's conversation.
remountType(
  "agent-form",
  () =>
    runCycle(type("agent-form"), { kind: "entity", entity: "agent-form", id: CONVERSATION_ID }, {
      title: "Rent increase notice for Unit 4B",
      prepare: seedChat,
      loadMs: 1000,
      kept: (tile) => ({
        reply: (tile.container.textContent ?? "").includes(CHAT_REPLY),
        saved: tile.source(),
      }),
    }),
  (r) =>
    expectRemountSafe(
      r,
      { reply: true, saved: { kind: "entity", entity: "agent-form", id: CONVERSATION_ID } },
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
