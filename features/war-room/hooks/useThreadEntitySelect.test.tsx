/**
 * features/war-room/hooks/useThreadEntitySelect.ts — the War Room Notes and
 * Audio name dropdowns (useThreadNoteSelectAdapter,
 * useThreadAudioSessionSelectAdapter).
 *
 * What the adapters OWN: which attached ids they list; the title precedence
 * (loaded source row → fetched canonical title → attach-time edge label →
 * positional fallback); asking the batched title read for every attached row
 * with a null label; and rename — save the TRIMMED name to the source, fold the
 * saved row back into the store, re-stamp the association edge label while
 * preserving its active flag, and prime the shared title cache only when every
 * step landed.
 *
 * Everything the adapters touch in-process is REAL: a store built from the
 * real warRoom / notes / transcriptStudio reducers, the real selectors, the
 * real war-room + studio thunks, and the real shared title cache. Only the
 * network edges are doubled — the notes API, the studio session service, the
 * war-room association service — plus the batched title-fetch hook (a network
 * read) and the toast port.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";

jest.mock("@/features/war-room/service/associations");
jest.mock("@/features/transcript-studio/service/studioService");
jest.mock("@/features/notes/service/notesApi");
jest.mock("@/features/scopes/hooks/useEntityTitles");
jest.mock("@/lib/toast");

import warRoomReducer, {
  assignmentsLoadedForContainer,
} from "@/features/war-room/redux/slice";
import notesReducer, {
  upsertNoteFromServer,
} from "@/features/notes/redux/slice";
import transcriptStudioReducer, {
  sessionUpserted,
} from "@/features/transcript-studio/redux/slice";
import {
  containerKey,
  threadRef,
  type WarRoomAssignment,
} from "@/features/war-room/types";
import type { Note } from "@/features/notes/types";
import type { StudioSession } from "@/features/transcript-studio/types";
import * as assoc from "@/features/war-room/service/associations";
import * as studioService from "@/features/transcript-studio/service/studioService";
import * as notesApi from "@/features/notes/service/notesApi";
import { useEntityTitles } from "@/features/scopes/hooks/useEntityTitles";
import {
  getCachedEntityTitle,
  primeEntityTitle,
} from "@/features/scopes/service/entityTitles";
import {
  useThreadAudioSessionSelectAdapter,
  useThreadNoteSelectAdapter,
} from "./useThreadEntitySelect";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const ORG = "f9cb3e35-2a65-4f2a-8525-088d6551071c";
const USER = "a3c1d2e4-5f60-4718-9a2b-3c4d5e6f7081";
const STAMP = "2026-09-10T09:00:00.000Z";

// The title cache is process-wide; every test uses ids no other test has seen.
let sequence = 0;
function freshId(): string {
  sequence += 1;
  return `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
}

function noteRow(id: string, label: string) {
  return {
    content: "Agenda for the incident review",
    content_hash: null,
    created_at: STAMP,
    created_by: USER,
    deleted_at: null,
    file_path: null,
    folder_id: null,
    folder_name: "War Room",
    id,
    label,
    last_device_id: null,
    metadata: {},
    organization_id: ORG,
    position: 0,
    project_id: null,
    sync_version: 1,
    tags: [],
    task_id: null,
    updated_at: STAMP,
    updated_by: null,
    version: 1,
    visibility: "personal",
  } satisfies Note;
}

function studioSession(id: string, title: string) {
  return {
    id,
    userId: USER,
    organizationId: ORG,
    projectId: null,
    transcriptId: null,
    title,
    status: "stopped",
    moduleId: "tasks",
    source: "studio",
    startedAt: STAMP,
    endedAt: STAMP,
    totalDurationMs: 60_000,
    audioStoragePath: null,
    assistantConversationId: null,
    assistantConversations: [],
    createdAt: STAMP,
    updatedAt: STAMP,
  } satisfies StudioSession;
}

function edge(
  threadId: string,
  entityType: string,
  entityId: string,
  label: string | null,
  isActive: boolean,
  position: number,
) {
  return {
    id: freshId(),
    container_type: "thread",
    container_id: threadId,
    entity_type: entityType,
    entity_id: entityId,
    position,
    is_active: isActive,
    label,
    metadata: { is_active: isActive, position },
    created_by: USER,
    created_at: STAMP,
  } satisfies WarRoomAssignment;
}

function makeTestStore() {
  return configureStore({
    reducer: {
      warRoom: warRoomReducer,
      notes: notesReducer,
      transcriptStudio: transcriptStudioReducer,
    },
    // Note records carry Sets (dirty-field tracking) by design.
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });
}
type TestStore = ReturnType<typeof makeTestStore>;

const unmounts: Array<() => Promise<void>> = [];

async function renderAdapter<T>(store: TestStore, useAdapter: () => T) {
  const holder: { value: T | null } = { value: null };
  function Probe(): null {
    holder.value = useAdapter();
    return null;
  }
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <Provider store={store}>
        <Probe />
      </Provider>,
    );
  });
  unmounts.push(async () => {
    await act(async () => root.unmount());
    container.remove();
  });
  return {
    get current(): T {
      if (holder.value === null) throw new Error("adapter never rendered");
      return holder.value;
    },
  };
}

async function rename(
  adapter: { current: { rename?: (id: string, title: string) => Promise<boolean> } },
  id: string,
  title: string,
): Promise<boolean> {
  const renameFn = adapter.current.rename;
  if (!renameFn) throw new Error("adapter exposes no rename");
  let result: boolean | null = null;
  await act(async () => {
    result = await renameFn(id, title);
  });
  if (result === null) throw new Error("rename never settled");
  return result;
}

beforeEach(() => {
  jest.mocked(useEntityTitles).mockReturnValue({});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  while (unmounts.length) await unmounts.pop()?.();
  jest.restoreAllMocks();
  jest.mocked(assoc.createAssignment).mockReset();
  jest.mocked(notesApi.update).mockReset();
  jest.mocked(studioService.updateSession).mockReset();
});

describe("War Room Notes name dropdown", () => {
  it("names each note from its loaded row, then its fetched title, then its edge label, then its position", async () => {
    const thread = freshId();
    const [loaded, fetched, edgeOnly, unnamed] = [freshId(), freshId(), freshId(), freshId()];
    const store = makeTestStore();
    store.dispatch(upsertNoteFromServer({ note: noteRow(loaded, "Loaded note"), fetchStatus: "full" }));
    primeEntityTitle("note", fetched, "Canonical note");
    store.dispatch(
      assignmentsLoadedForContainer({
        key: containerKey("thread", thread),
        assignments: [
          edge(thread, "note", loaded, "Stale edge label", true, 0),
          edge(thread, "note", fetched, "Attach-time note", false, 1),
          edge(thread, "note", edgeOnly, "Edge-only note", false, 2),
          edge(thread, "note", unnamed, null, false, 3),
          edge(thread, "studio_session", freshId(), "Not a note", false, 0),
        ],
      }),
    );

    const notes = await renderAdapter(store, () =>
      useThreadNoteSelectAdapter(thread, freshId()),
    );

    expect(notes.current.loading).toBe(false);
    expect(notes.current.activeId).toBe(loaded);
    expect(notes.current.items).toEqual([
      { id: loaded, title: "Loaded note" },
      { id: fetched, title: "Canonical note" },
      { id: edgeOnly, title: "Edge-only note" },
      { id: unnamed, title: "Note 4" },
    ]);
    // Every attached note's canonical title is requested — never trusting the edge label.
    expect(jest.mocked(useEntityTitles).mock.calls.at(-1)?.[0]).toEqual([
      { token: "note", id: loaded, label: null },
      { token: "note", id: fetched, label: null },
      { token: "note", id: edgeOnly, label: null },
      { token: "note", id: unnamed, label: null },
    ]);
  });

  it("renames a note: saves the trimmed label, shows it, re-stamps the active edge, and primes the title", async () => {
    const thread = freshId();
    const noteId = freshId();
    const store = makeTestStore();
    store.dispatch(upsertNoteFromServer({ note: noteRow(noteId, "Loaded note"), fetchStatus: "full" }));
    store.dispatch(
      assignmentsLoadedForContainer({
        key: containerKey("thread", thread),
        assignments: [edge(thread, "note", noteId, "Loaded note", true, 0)],
      }),
    );
    jest.mocked(notesApi.update).mockResolvedValue(noteRow(noteId, "Renamed note"));
    jest
      .mocked(assoc.createAssignment)
      .mockResolvedValue(edge(thread, "note", noteId, "Renamed note", true, 0));
    const notes = await renderAdapter(store, () =>
      useThreadNoteSelectAdapter(thread, freshId()),
    );

    await expect(rename(notes, noteId, "  Renamed note ")).resolves.toBe(true);

    expect(jest.mocked(notesApi.update).mock.calls).toEqual([
      [noteId, { label: "Renamed note" }],
    ]);
    expect(jest.mocked(assoc.createAssignment).mock.calls).toEqual([
      [
        {
          ref: threadRef(thread),
          entityType: "note",
          entityId: noteId,
          label: "Renamed note",
          makeActive: true,
          metadata: undefined,
        },
      ],
    ]);
    expect(notes.current.items).toEqual([{ id: noteId, title: "Renamed note" }]);
    expect(getCachedEntityTitle("note", noteId)).toBe("Renamed note");
  });

  it("keeps an inactive note inactive when renaming it", async () => {
    const thread = freshId();
    const [active, inactive] = [freshId(), freshId()];
    const store = makeTestStore();
    store.dispatch(
      assignmentsLoadedForContainer({
        key: containerKey("thread", thread),
        assignments: [
          edge(thread, "note", active, "Active note", true, 0),
          edge(thread, "note", inactive, "Background note", false, 1),
        ],
      }),
    );
    jest.mocked(notesApi.update).mockResolvedValue(noteRow(inactive, "Parked note"));
    jest
      .mocked(assoc.createAssignment)
      .mockResolvedValue(edge(thread, "note", inactive, "Parked note", false, 1));
    const notes = await renderAdapter(store, () =>
      useThreadNoteSelectAdapter(thread, freshId()),
    );

    await expect(rename(notes, inactive, "Parked note")).resolves.toBe(true);

    expect(jest.mocked(assoc.createAssignment).mock.calls[0]?.[0]).toMatchObject({
      entityId: inactive,
      makeActive: false,
    });
    expect(notes.current.activeId).toBe(active);
  });

  it("reports failure and primes no title when the edge label cannot be re-stamped", async () => {
    const thread = freshId();
    const noteId = freshId();
    const store = makeTestStore();
    store.dispatch(
      assignmentsLoadedForContainer({
        key: containerKey("thread", thread),
        assignments: [edge(thread, "note", noteId, "Loaded note", true, 0)],
      }),
    );
    jest.mocked(notesApi.update).mockResolvedValue(noteRow(noteId, "Renamed note"));
    jest
      .mocked(assoc.createAssignment)
      .mockRejectedValue(new Error("assoc_add: permission denied"));
    const notes = await renderAdapter(store, () =>
      useThreadNoteSelectAdapter(thread, freshId()),
    );

    await expect(rename(notes, noteId, "Renamed note")).resolves.toBe(false);

    expect(getCachedEntityTitle("note", noteId)).toBeNull();
  });

  it("reports failure without touching the edge when the note save fails", async () => {
    const thread = freshId();
    const noteId = freshId();
    const store = makeTestStore();
    store.dispatch(
      assignmentsLoadedForContainer({
        key: containerKey("thread", thread),
        assignments: [edge(thread, "note", noteId, "Loaded note", true, 0)],
      }),
    );
    jest.mocked(notesApi.update).mockRejectedValue(new Error("notes: 42501"));
    const notes = await renderAdapter(store, () =>
      useThreadNoteSelectAdapter(thread, freshId()),
    );

    await expect(rename(notes, noteId, "Renamed note")).resolves.toBe(false);

    expect(assoc.createAssignment).not.toHaveBeenCalled();
    expect(getCachedEntityTitle("note", noteId)).toBeNull();
  });
});

describe("War Room Audio name dropdown", () => {
  it("names each recording from its loaded session, then its fetched title, then its edge label, then its position", async () => {
    const thread = freshId();
    const [loaded, fetched, edgeOnly, unnamed] = [freshId(), freshId(), freshId(), freshId()];
    const store = makeTestStore();
    store.dispatch(sessionUpserted(studioSession(loaded, "Loaded recording")));
    primeEntityTitle("studio_session", fetched, "Canonical recording");
    store.dispatch(
      assignmentsLoadedForContainer({
        key: containerKey("thread", thread),
        assignments: [
          edge(thread, "studio_session", loaded, "Stale edge label", true, 0),
          edge(thread, "studio_session", fetched, "Attach-time recording", false, 1),
          edge(thread, "studio_session", edgeOnly, "Edge-only recording", false, 2),
          edge(thread, "studio_session", unnamed, null, false, 3),
          edge(thread, "note", freshId(), "Not a recording", false, 0),
        ],
      }),
    );

    const audio = await renderAdapter(store, () =>
      useThreadAudioSessionSelectAdapter(thread),
    );

    expect(audio.current.activeId).toBe(loaded);
    expect(audio.current.items).toEqual([
      { id: loaded, title: "Loaded recording" },
      { id: fetched, title: "Canonical recording" },
      { id: edgeOnly, title: "Edge-only recording" },
      { id: unnamed, title: "Recording 4" },
    ]);
    expect(jest.mocked(useEntityTitles).mock.calls.at(-1)?.[0]).toEqual([
      { token: "studio_session", id: loaded, label: null },
      { token: "studio_session", id: fetched, label: null },
      { token: "studio_session", id: edgeOnly, label: null },
      { token: "studio_session", id: unnamed, label: null },
    ]);
  });

  it("renames a recording: saves the trimmed title, shows it, re-stamps the active edge, and primes the title", async () => {
    const thread = freshId();
    const sessionId = freshId();
    const store = makeTestStore();
    store.dispatch(sessionUpserted(studioSession(sessionId, "Loaded recording")));
    store.dispatch(
      assignmentsLoadedForContainer({
        key: containerKey("thread", thread),
        assignments: [edge(thread, "studio_session", sessionId, "Loaded recording", true, 0)],
      }),
    );
    jest
      .mocked(studioService.updateSession)
      .mockResolvedValue(studioSession(sessionId, "Renamed audio"));
    jest
      .mocked(assoc.createAssignment)
      .mockResolvedValue(edge(thread, "studio_session", sessionId, "Renamed audio", true, 0));
    const audio = await renderAdapter(store, () =>
      useThreadAudioSessionSelectAdapter(thread),
    );

    await expect(rename(audio, sessionId, " Renamed audio  ")).resolves.toBe(true);

    expect(jest.mocked(studioService.updateSession).mock.calls).toEqual([
      [sessionId, { title: "Renamed audio" }],
    ]);
    expect(jest.mocked(assoc.createAssignment).mock.calls).toEqual([
      [
        {
          ref: threadRef(thread),
          entityType: "studio_session",
          entityId: sessionId,
          label: "Renamed audio",
          makeActive: true,
          metadata: undefined,
        },
      ],
    ]);
    expect(audio.current.items).toEqual([{ id: sessionId, title: "Renamed audio" }]);
    expect(getCachedEntityTitle("studio_session", sessionId)).toBe("Renamed audio");
  });

  it("reports failure without touching the edge when the recording row is gone", async () => {
    const thread = freshId();
    const sessionId = freshId();
    const store = makeTestStore();
    store.dispatch(
      assignmentsLoadedForContainer({
        key: containerKey("thread", thread),
        assignments: [edge(thread, "studio_session", sessionId, "Recording", true, 0)],
      }),
    );
    jest.mocked(studioService.updateSession).mockResolvedValue(null);
    const audio = await renderAdapter(store, () =>
      useThreadAudioSessionSelectAdapter(thread),
    );

    await expect(rename(audio, sessionId, "Renamed audio")).resolves.toBe(false);

    expect(assoc.createAssignment).not.toHaveBeenCalled();
    expect(getCachedEntityTitle("studio_session", sessionId)).toBeNull();
  });
});
