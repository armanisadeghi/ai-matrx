/**
 * A COLLABORATOR'S SNAPSHOT IS NEVER OVERWRITTEN BY THIS TAB'S NEXT SAVE.
 *
 * Before 2026-10-03, a snapshot committed elsewhere while this tab had unsaved
 * edits only logged a console.warn — and this tab's next autosave wrote its
 * document over the collaborator's. Now it is a working-copy CONFLICT: no save
 * runs until the person chooses; "Keep mine" writes on top, "Take theirs"
 * shows the collaborator's snapshot in every view and drops the edit.
 *
 * Break that turns this red: `onRemoteSnapshot` going back to a warning (or
 * any path that saves over a snapshot it did not show).
 */
import { configureStore } from "@reduxjs/toolkit";
import { defineWorkingCopyKind } from "@/lib/working-copy/workingCopyKind";
import workingCopiesReducer, { getWorkingCopy } from "@/lib/working-copy/workingCopySlice";
import { DocumentModel, type DocumentModelDeps, type DocumentSnapshotData } from "@/features/documents/document-model/documentModel";

type Listener = (info: { id: string; type: number; params: unknown }, options?: Record<string, unknown>) => void;

const doc = (text: string) => ({ id: "unit-1", body: { dataStream: `${text}\r\n` } }) as unknown as DocumentSnapshotData;
const textOf = (snapshot: DocumentSnapshotData | null) =>
  ((snapshot as { body?: { dataStream?: string } } | null)?.body?.dataStream ?? "").replace(/\r\n$/, "");

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const flush = async () => {
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
};

function setup() {
  let server = { id: "snap-1", snapshot: doc("Quarterly plan: hire two techs") };
  const saved: string[] = [];
  const deps: DocumentModelDeps = {
    loadLatest: async () => server,
    save: async ({ snapshot }) => {
      saved.push(textOf(snapshot));
      server = { id: `snap-mine-${saved.length}`, snapshot };
      return { id: server.id, createdBy: null };
    },
  };
  const kind = defineWorkingCopyKind<DocumentModel>({
    entity: `doc-conflict-${Math.random().toString(36).slice(2, 8)}`,
    delay: () => 2500,
    createEngine: (handle) => new DocumentModel(handle, deps),
    engineBusy: (model) => model.hasViews(),
    save: async ({ engine, reason }) => {
      const wrote = await engine!.write(reason);
      return { savedAt: wrote ? Date.now() : null };
    },
    resolveConflict: async (model, choice, conflict) => {
      if (choice === "theirs" && model) await model.onRemoteSnapshot(conflict.theirsRef ?? "", { overUnsaved: true });
    },
  });
  const store = configureStore({ reducer: { workingCopies: workingCopiesReducer } });
  const release = kind.attach("plan", store);
  const model = kind.engine("plan")!;
  // One view: its body is a text; a keystroke is a content mutation.
  let shown = doc("Quarterly plan: hire two techs");
  const listeners = new Set<Listener>();
  const detach = model.attachView({
    commandService: {
      onMutationExecutedForCollab: (listener: Listener) => {
        listeners.add(listener);
        return { dispose: () => listeners.delete(listener) };
      },
      syncExecuteCommand: () => true,
    } as never,
    snapshot: () => shown,
    remount: (snapshot) => {
      shown = snapshot;
    },
    editable: () => true,
  });
  const type = (text: string) => {
    shown = doc(text);
    for (const l of listeners) l({ id: "doc.mutation.rich-text-editing", type: 2, params: {} });
  };
  const collaboratorSaves = (id: string, text: string) => {
    server = { id, snapshot: doc(text) };
    return model.onRemoteSnapshot(id);
  };
  return { kind, store, model, saved, type, collaboratorSaves, shownText: () => textOf(shown), release, detach };
}

it("a collaborator's snapshot over unsaved edits is a conflict, and no save runs until the person chooses", async () => {
  const t = setup();
  await t.model.openingSnapshot(() => doc(""));
  t.type("Quarterly plan: hire two techs and a dispatcher");
  await t.collaboratorSaves("snap-2", "Quarterly plan: hire three techs");
  expect(getWorkingCopy(t.store.getState(), t.kind.key("plan"))?.conflict).toMatchObject({ theirsRef: "snap-2" });

  jest.advanceTimersByTime(10_000);
  await flush();
  expect(t.saved).toEqual([]); // the collaborator's snapshot is not written over

  await t.kind.resolveConflict("plan", "theirs");
  expect(t.shownText()).toBe("Quarterly plan: hire three techs");
  expect(getWorkingCopy(t.store.getState(), t.kind.key("plan"))).toMatchObject({ dirty: false, conflict: null });
  jest.advanceTimersByTime(10_000);
  await flush();
  expect(t.saved).toEqual([]);
  t.detach();
  t.release();
});

it("Keep mine writes this tab's document on top, once", async () => {
  const t = setup();
  await t.model.openingSnapshot(() => doc(""));
  t.type("Quarterly plan: hire two techs and a dispatcher");
  await t.collaboratorSaves("snap-2", "Quarterly plan: hire three techs");
  await t.kind.resolveConflict("plan", "mine");
  await flush();
  expect(t.saved).toEqual(["Quarterly plan: hire two techs and a dispatcher"]);
  t.detach();
  t.release();
});
