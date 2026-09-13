import type { Note } from "./types";
import { enableMapSet } from "immer";
import {
  advancePreparedNoteSource,
  captureNoteEditSource,
  isPreparedEditableNoteSource,
} from "./richDocumentSource";
import { createBlankNoteRecord } from "./redux/notes.types";
import { setNoteField } from "./redux/slice";
import notesReducer from "./redux/slice";

enableMapSet();

const NOTE_ID = "33333333-3333-4333-8333-333333333333";
const ORG_ID = "11111111-1111-4111-8111-111111111111";

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: NOTE_ID,
    content: "acknowledged body",
    content_hash: null,
    created_at: "2026-09-12T00:00:00.000Z",
    created_by: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    deleted_at: null,
    file_path: null,
    folder_id: null,
    folder_name: null,
    label: "Note",
    last_device_id: null,
    metadata: {},
    organization_id: ORG_ID,
    position: 0,
    project_id: null,
    sync_version: 0,
    tags: [],
    task_id: null,
    updated_at: "2026-09-12T00:00:00.000Z",
    updated_by: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    version: 0,
    visibility: "personal",
    ...overrides,
  };
}

describe("prepared Notes rich-document sources", () => {
  it("preserves a dirty displayed body while retaining its earlier revision-zero base", () => {
    const source = captureNoteEditSource({
      acknowledgedNote: note(),
      displayedNote: note({ content: "dirty displayed body" }),
      actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      sourceId: "editor-a",
      snapshotId: "editor-a:dirty",
      actingSelection: "displayed",
    });

    expect(source.editBase).toEqual({
      noteId: NOTE_ID,
      organizationId: ORG_ID,
      version: 0,
      actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
    expect(source.acknowledgedPhysicalSnapshot.content).toBe("acknowledged body");
    expect(source.displayedPhysicalSnapshot.content).toBe("dirty displayed body");
    expect(isPreparedEditableNoteSource(source)).toBe(true);
  });

  it("advances only from a matching physical receipt", () => {
    const source = captureNoteEditSource({
      acknowledgedNote: note(),
      displayedNote: note({ content: "dirty displayed body" }),
      actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      sourceId: "editor-a",
      snapshotId: "editor-a:dirty",
    });
    const settled = advancePreparedNoteSource(source, {
      note: note({ content: "saved body", version: 1 }),
      databaseWrite: "saved",
      succeededFields: [],
      failedFields: [],
      safeCauses: {},
    });

    expect(settled.editBase.version).toBe(1);
    expect(settled.displayedPhysicalSnapshot.content).toBe("saved body");
    expect(() =>
      advancePreparedNoteSource(source, {
        note: note({ organization_id: "22222222-2222-4222-8222-222222222222", version: 1 }),
        databaseWrite: "saved",
        succeededFields: [],
        failedFields: [],
        safeCauses: {},
      }),
    ).toThrow(/does not match/i);
  });

  it("keeps the complete acknowledged snapshot apart from dirty fields and field history", () => {
    const record = createBlankNoteRecord(note());
    const dirty = notesReducer({
      notes: { [NOTE_ID]: record }, fetchedNoteIds: new Set(), contentLoadStatus: {}, listStatus: "idle", listError: null,
      conflictResolutionReceipts: {}, instances: {}, realtimeConnected: false, noteEditors: {}, noteScopeAssignments: [], noteScopesLoaded: false,
      activeNoteId: null, openTabs: [], _savingNoteIds: [],
    }, setNoteField({ id: NOTE_ID, field: "content", value: "later dirty text" }));
    expect(dirty.notes[NOTE_ID]._fieldHistory.content).toBe("acknowledged body");
    expect(dirty.notes[NOTE_ID]._acknowledgedPhysicalSnapshot?.content).toBe("acknowledged body");
    expect(dirty.notes[NOTE_ID]._acknowledgedPhysicalSnapshot).not.toBe(dirty.notes[NOTE_ID]);
  });
});

describe("prepared Notes source runtime admission", () => {
  it("refuses non-UUID identities and base/display pairing drift immediately", () => {
    expect(() => captureNoteEditSource({ acknowledgedNote: note(), displayedNote: note(), actorId: "actor", sourceId: "source", snapshotId: "snapshot" })).toThrow(/requires/i);
    expect(() => captureNoteEditSource({ acknowledgedNote: note(), displayedNote: note({ version: 1 }), actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", sourceId: "source", snapshotId: "snapshot" })).toThrow(/requires/i);
  });
});
