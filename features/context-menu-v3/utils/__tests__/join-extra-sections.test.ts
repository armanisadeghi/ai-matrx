/**
 * ONE MENU ON A NOTE'S CONTENT CARRIES THE EDITOR'S ROWS AND THE TAB'S ROWS — each id once.
 *
 * Live 2026-09-30 on /notes: the editor's "Save" and the tab's "Save" both joined the menu, the
 * model named both `x:save`, and the Alchemy registry refused the second
 * (`DuplicateActionError: Action "cm:x:save" is yielded twice`). The join keeps the first owner's row.
 */
import { joinExtraSections } from "../join-extra-sections";
import { createNotesEditorExtraSections } from "@/features/notes/agent-context/notesEditorExtraSections";
import { noteActionsSection } from "@/features/notes/components/note-actions/noteActionSet";
import type { ContextMenuExtraItem, ContextMenuExtraSection } from "../../types";

const noop = () => {};

function editorSections(noteActionsFromTab: boolean): ContextMenuExtraSection[] {
  return createNotesEditorExtraSections({
    noteActionsFromTab,
    isDirty: true,
    onSave: noop,
    onDuplicate: noop,
    onExport: noop,
    onShareLink: noop,
    onShareClipboard: noop,
    onMoveToFolder: noop,
    onMoveDialog: noop,
    onCloseTab: noop,
    onCloseOtherTabs: noop,
    onCloseAllTabs: noop,
    onDelete: noop,
  });
}

/** The rows NoteTabItem registers for the note's content (record-menu-registry). */
const tabRecordSections: ContextMenuExtraSection[] = [
  noteActionsSection({ duplicate: noop, moveToFolder: noop, exportMarkdown: noop, share: noop, moveToTrash: noop }),
  {
    id: "note-buffer",
    anchor: "after-compare",
    items: [
      { kind: "item", id: "save", label: "Save", onSelect: noop },
      { kind: "item", id: "copy-content", label: "Copy note text", onSelect: noop },
    ],
  },
];

function rowIds(sections: ContextMenuExtraSection[] | undefined): string[] {
  return (sections ?? []).flatMap((s) => s.items.filter((i) => i.kind !== "separator").map((i) => i.id));
}

function duplicates(ids: string[]): string[] {
  return ids.filter((id, i) => ids.indexOf(id) !== i);
}

it("the editor's rows and the tab's rows join with every row id once", () => {
  for (const fromTab of [true, false]) {
    const joined = joinExtraSections(editorSections(fromTab), tabRecordSections);
    expect(duplicates(rowIds(joined))).toEqual([]);
    expect(rowIds(joined)).toContain("save");
  }
});

it("with the tab carrying the note's rows, the editor section repeats none of them", () => {
  const editorIds = rowIds(editorSections(true));
  const tabIds = rowIds(tabRecordSections);
  expect(editorIds.filter((id) => tabIds.includes(id))).toEqual([]);
});

it("the first owner's row stands; a section left empty is not drawn; separators stay tidy", () => {
  const first: ContextMenuExtraSection[] = [
    { id: "a", items: [{ kind: "item", id: "save", label: "Save", onSelect: noop }] },
  ];
  const later: ContextMenuExtraSection[] = [
    { id: "b", items: [{ kind: "item", id: "save", label: "Save again", onSelect: noop }] },
    {
      id: "c",
      items: [
        { kind: "item", id: "save", label: "Save", onSelect: noop },
        { kind: "separator", id: "sep" },
        { kind: "item", id: "close", label: "Close", onSelect: noop },
      ] as ContextMenuExtraItem[],
    },
  ];
  const joined = joinExtraSections(first, later)!;
  expect(joined.map((s) => s.id)).toEqual(["a", "c"]);
  expect(joined[0].items[0]).toMatchObject({ label: "Save" });
  expect(joined[1].items.map((i) => i.id)).toEqual(["close"]);
});

it("one source is returned as is — its own duplicate stays for the registry to refuse", () => {
  const only: ContextMenuExtraSection[] = [
    { id: "a", items: [{ kind: "item", id: "x", label: "X", onSelect: noop }, { kind: "item", id: "x", label: "X", onSelect: noop }] },
  ];
  expect(joinExtraSections(only, undefined)).toBe(only);
  expect(joinExtraSections(undefined, null)).toBeUndefined();
});
