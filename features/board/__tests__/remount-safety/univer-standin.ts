/**
 * Univer (the /documents editor engine) stands in at its ONE construction door,
 * `createUniver` from `@univerjs/presets`: it paints on canvas and cannot boot
 * in jsdom. Everything above it — `DocumentEditor`, the document model
 * (`features/documents/document-model`), the save path, the realtime door —
 * runs for real.
 *
 * The stand-in does what the real engine does at that boundary and nothing
 * more: `createDocument(data)` mounts a unit from the snapshot it is GIVEN
 * (an editor is only ever as current as what its host hands it), a keystroke
 * is a MUTATION through the command service (`onMutationExecutedForCollab`
 * listeners hear it, exactly as the model listens to Univer), `save()` reports
 * the unit's current body, `dispose()` throws the unit away. Undo / redo live INSIDE the
 * instance (Univer's undo service is per instance): a person's local edit is
 * undoable, a replayed one (`fromCollab` / `onlyLocal`) is not, and a new
 * instance starts with no history. So the case
 * asserts on the store layer: after a remount, does the host hand the new
 * editor the words the person typed, or a stale copy?
 */

type Listener = (info: { id: string; type: number; params: unknown }, options?: Record<string, unknown>) => void;

export interface StandInDocument {
  unitId: string;
  text: () => string;
  /** A person's keystrokes: one rich-text mutation through the command service. */
  type: (text: string) => void;
  /** ⌘Z / ⌘⇧Z in this editor instance (a no-op with nothing to undo / redo). */
  undo: () => void;
  redo: () => void;
}

interface Instance {
  disposed: boolean;
  documents: StandInDocument[];
}

const instances: Instance[] = [];

/** Every editor instance created in this test file, oldest first. */
export function univerInstances(): readonly Instance[] {
  return instances;
}

/** The live (not disposed) editor's active document. */
export function liveUniverDocument(): StandInDocument | null {
  for (let i = instances.length - 1; i >= 0; i--) {
    const inst = instances[i];
    if (!inst.disposed && inst.documents.length) return inst.documents[inst.documents.length - 1];
  }
  return null;
}

export function resetUniverInstances(): void {
  instances.length = 0;
}

/** `createUniver` — call with the real `ICommandService` token and `CommandType.MUTATION`. */
export function createUniverStandIn(commandServiceToken: unknown, mutationType: number) {
  return () => {
    const listeners = new Set<Listener>();
    const instance: Instance = { disposed: false, documents: [] };
    instances.push(instance);
    let active: { data: Record<string, unknown>; body: { dataStream: string } } | null = null;

    const insert = (at: number, text: string) => {
      if (!active) throw new Error("no document unit is mounted");
      const s = active.body.dataStream;
      active.body.dataStream = s.slice(0, at) + text + s.slice(at);
    };
    const emit = (info: { id: string; type: number; params: unknown }, options?: Record<string, unknown>) => {
      for (const l of listeners) l(info, options);
    };
    // This instance's history: the body before each undoable local edit.
    let undoStack: string[] = [];
    let redoStack: string[] = [];
    const restore = (from: string[], to: string[]) => {
      const previous = from.pop();
      if (previous === undefined || !active) return;
      to.push(active.body.dataStream);
      active.body.dataStream = previous;
      emit({ id: "doc.mutation.rich-text-editing", type: mutationType, params: { restore: true } });
    };

    const commandService = {
      onMutationExecutedForCollab(listener: Listener) {
        listeners.add(listener);
        return { dispose: () => void listeners.delete(listener) };
      },
      onCommandExecuted() {
        return { dispose: () => undefined };
      },
      syncExecuteCommand(id: string, params: { at: number; text: string }, options?: Record<string, unknown>) {
        if (typeof params?.text !== "string") return true; // an undo/redo replay carries no insert
        const before = active?.body.dataStream;
        insert(params.at, params.text);
        if (before !== undefined && !options?.fromCollab && !options?.onlyLocal) {
          undoStack.push(before);
          redoStack = [];
        }
        emit({ id, type: mutationType, params }, options);
        return true;
      },
      executeCommand: async () => true,
    };

    const injector = {
      get: (token: unknown) => (token === commandServiceToken ? commandService : undefined),
      has: () => true,
      add: () => undefined,
    };

    const documentFacade = () => ({
      getId: () => (active?.data.id as string) ?? null,
      save: () => (active ? { ...active.data, body: { ...(active.data.body as object), dataStream: active.body.dataStream } } : null),
      getBody: () => ({ dataStream: active?.body.dataStream ?? "" }),
      insertText: (at: number, text: string) => commandService.syncExecuteCommand("doc.mutation.rich-text-editing", { at, text }),
      deleteRange: () => true,
    });

    const api: Record<string, unknown> = {
      createDocument(data: Record<string, unknown>) {
        const body = (data.body as { dataStream?: string } | undefined) ?? {};
        active = { data, body: { dataStream: body.dataStream ?? "\r\n" } };
        undoStack = [];
        redoStack = [];
        const unitId = String(data.id);
        instance.documents.push({
          unitId,
          text: () => active?.body.dataStream ?? "",
          type: (text: string) => {
            const end = Math.max(0, (active?.body.dataStream.length ?? 2) - 2);
            commandService.syncExecuteCommand("doc.mutation.rich-text-editing", { at: end, text });
          },
          undo: () => restore(undoStack, redoStack),
          redo: () => restore(redoStack, undoStack),
        });
        return documentFacade();
      },
      getActiveDocument: () => (active ? documentFacade() : null),
    };
    // Facade calls the stand-in has no opinion on (dark mode, theme) are no-ops.
    const univerAPI = new Proxy(api, {
      get: (target, prop: string) => (prop in target ? target[prop] : () => undefined),
    });
    const univer = {
      __getInjector: () => injector,
      dispose: () => {
        instance.disposed = true;
        listeners.clear();
      },
    };
    return { univer, univerAPI };
  };
}

/**
 * The Univer modules the document path imports at runtime, as the stand-in.
 * Univer's real packages cannot load in Jest at all (ESM-only lodash-es), so
 * every one the editor's import graph touches is answered here — constants
 * with Univer's own values, and `createUniver` from above.
 */
export const COMMAND_SERVICE = Symbol.for("univer.ICommandService");
const MUTATION = 2;

export const univerModules = {
  presets: () => ({
    LocaleType: { EN_US: "enUS" },
    merge: (...parts: object[]) => Object.assign({}, ...parts),
    createUniver: createUniverStandIn(COMMAND_SERVICE, MUTATION),
  }),
  core: () => ({
    ICommandService: COMMAND_SERVICE,
    CommandType: { COMMAND: 0, OPERATION: 1, MUTATION },
    NamedStyleType: { NAMED_STYLE_TYPE_UNSPECIFIED: 0, NORMAL_TEXT: 1, TITLE: 2, SUBTITLE: 3, HEADING_1: 4, HEADING_2: 5, HEADING_3: 6, HEADING_4: 7, HEADING_5: 8 },
    CellValueType: { STRING: 1, NUMBER: 2, BOOLEAN: 3, FORCE_STRING: 4 },
    createParagraphId: () => `p${Math.random().toString(36).slice(2, 8)}`,
    createSectionId: () => `s${Math.random().toString(36).slice(2, 8)}`,
  }),
  themes: () => ({ defaultTheme: {} }),
  docsPreset: () => ({ UniverDocsCorePreset: () => ({ plugins: [] }) }),
  locale: () => ({ __esModule: true, default: {} }),
  sheetsPreset: () => ({ DragManagerService: class DragManagerService {}, HoverManagerService: class HoverManagerService {}, UniverSheetsCorePreset: () => ({ plugins: [] }) }),
  engineRender: () => ({ ICanvasColorService: Symbol.for("univer.ICanvasColorService"), DumbCanvasColorService: class DumbCanvasColorService {} }),
};
