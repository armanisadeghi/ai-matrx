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
import { redoNoteEdit } from "@/features/notes/redux/slice";
import { BOARD_ITEM_TYPES } from "../items/catalog";
import {
  expectRemountSafe,
  pressUndo,
  richEditorIn,
  richSelectionOf,
  richTextOf,
  runCycle,
  settle,
  selectInRich,
  setRichSelection,
  typeInto,
  typeIntoRich,
} from "./remount-safety/harness";
import { installBrowserGaps } from "./remount-safety/browser-gaps";
import { CHAT_REPLY, CONVERSATION_ID, FILE_ID, NOTE_ID, NOTE_TEXT, seedChat, seedFile, seedNote } from "./remount-safety/fixtures-work";
import { remountType } from "./remount-safety/cases";

installBrowserGaps();

const type = (key: string) => {
  const t = BOARD_ITEM_TYPES.find((x) => x.key === key);
  if (!t) throw new Error(`no board item type ${key}`);
  return t;
};

// The note opens in Write: the rich editor. The person adds a second paragraph
// at the end; the stored copy is the markdown of both paragraphs.
const SECOND_PARAGRAPH = "Replace the smoke detector batteries before the walkthrough.";
const TYPED = `${NOTE_TEXT}\n\n${SECOND_PARAGRAPH}`;
const TYPED_SHOWN = `${NOTE_TEXT}\n${SECOND_PARAGRAPH}`;
const SELECTED_WORDS = "smoke detector";
const NOTE_RECORD = [/^workbench\.notes$/];

const noteEditor = (tile: { container: Element }) => {
  const rich = richEditorIn(tile.container);
  if (!rich) throw new Error("the note's Write editor never rendered");
  return rich;
};

// Break: the note editor keeps the words in a view-local buffer that a remount
// rebuilds from the last saved copy, re-saves on mount, or re-reads the note.
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
        const rich = noteEditor(tile);
        await typeIntoRich(rich, ["", SECOND_PARAGRAPH]);
        selectInRich(rich, SELECTED_WORDS);
      },
      kept: async (tile) => {
        const rich = noteEditor(tile);
        const selection = richSelectionOf(rich);
        const stored = () => tile.store.getState().notes.notes[NOTE_ID]?.content;
        const shown = richTextOf(tile.container);
        pressUndo(rich);
        const afterUndo = stored();
        // The undo is this probe's, not the person's: the note's own history
        // steps forward again so the next step of the cycle starts from the
        // same note, and the selection goes back where the person left it.
        act(() => void tile.store.dispatch(redoNoteEdit({ id: NOTE_ID })));
        await settle(1500);
        setRichSelection(rich, selection.from, selection.to);
        return { shown, stored: stored(), selection, afterUndo };
      },
    }),
  (r) =>
    expectRemountSafe(
      { ...r, keptAfterWake: pick(r.keptAfterWake, "shown", "stored"), keptAfterRemount: pick(r.keptAfterRemount, "shown", "stored") },
      { shown: TYPED_SHOWN, stored: TYPED },
      NOTE_RECORD,
    ),
  {
    // The words the person left selected in the Write editor.
    "write-view selection": (r) =>
      expect({
        wake: pick(r.keptAfterWake, "selection"),
        remount: pick(r.keptAfterRemount, "selection"),
      }).toEqual({
        wake: { selection: expect.objectContaining({ text: SELECTED_WORDS }) },
        remount: { selection: expect.objectContaining({ text: SELECTED_WORDS }) },
      }),
    // ⌘Z after waking / remounting still undoes the typing (history is the note's).
    "write-view undo": (r) =>
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
