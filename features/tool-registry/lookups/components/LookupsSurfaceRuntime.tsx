"use client";

/**
 * Surface runtime for the Tool Registry Lookups admin
 * (`matrx-admin/lookups`) — the page's scope emitter AND the single authority
 * the `lookup_draft` write target resolves through.
 *
 * WHY THIS MODULE EXISTS. `LookupsAdminPage` is three independent CRUD
 * sub-components, each holding its own `useState`, and the row editors are
 * dialogs that only MOUNT while the admin is creating or editing. Before this
 * there was no shared point to build a scope from, so the surface was
 * manifest-only (`readiness: "stub"`, "Emitters: NONE YET") and an agent bound
 * here was offered no write tool at all.
 *
 * Rather than lift three tables' worth of state into the page (and re-plumb a
 * working admin screen), each child PUBLISHES what it owns into a page-scoped
 * store, and the page reads that store to build both `getScope()` and the
 * write handler.
 *
 * EVERYTHING IS READ THROUGH REFS, deliberately. `applySurfaceWrite` resolves
 * the handler from `getWriteHandlers()` BEFORE it awaits the confirm dialog,
 * so a guard read off a render closure ("is a dialog open", "is it create or
 * edit", "is a save in flight") reflects the moment the agent CALLED, not the
 * moment the admin pressed Apply. A dialog closed while that dialog was up
 * would otherwise let a write land in an editor that no longer exists.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

import {
  LOOKUP_DESCRIPTION_MAX_CHARS,
  LOOKUP_DRAFT_FIELDS,
  LOOKUP_NAME_MAX_CHARS,
  LOOKUP_NAME_RULES,
  LOOKUP_TAB_TABLE,
  type LookupEditorMode,
  type LookupTab,
} from "@/features/tool-registry/lookups/lookupsVocabulary";
import type {
  ToolExecutorRow,
  UiClientRow,
  UiSurfaceRow,
} from "@/features/tool-registry/lookups/services/lookups.service";
import {
  createAdminLookupsScope,
  type AdminLookupOpenEditor,
} from "@/features/surfaces/manifests/admin-lookups.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import type { SurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";

/**
 * A live row editor, exposed entirely as getters + the dialog's OWN setters.
 *
 * No plain values: a snapshot captured at registration would be stale by the
 * time an agent's write clears the confirm dialog (see the module header).
 * The setters are React state setters, which are stable by construction, and
 * they are the SAME ones the admin's typing calls — nothing here is a
 * parallel write path.
 */
export interface LookupEditorHandle {
  /** Which tab (and therefore which table) this editor belongs to. */
  tab: LookupTab;
  getMode: () => LookupEditorMode;
  getName: () => string;
  getDescription: () => string;
  /**
   * Whether the name input is live. False in edit mode on every tab — the
   * dialogs render it `disabled` because the name IS the primary key.
   */
  isNameEditable: () => boolean;
  /** True while the dialog's Save is in flight. */
  isBusy: () => boolean;
  setName: (next: string) => void;
  setDescription: (next: string) => void;
}

interface LookupsStore {
  tab: LookupTab;
  clients: UiClientRow[];
  surfaces: UiSurfaceRow[];
  surfacesVisibleCount: number;
  surfacesClientFilter: string;
  executors: ToolExecutorRow[];
  /** Open row editors by registration id. Normally 0 or 1 — the dialogs are modal. */
  editors: Map<number, LookupEditorHandle>;
  /** Each tab's "New" action, so the handler can open a create form itself. */
  openCreate: Partial<Record<LookupTab, () => void>>;
}

interface LookupsSurfaceApi {
  storeRef: React.MutableRefObject<LookupsStore>;
  publishTab: (tab: LookupTab) => void;
  publishClients: (rows: UiClientRow[]) => void;
  publishSurfaces: (
    rows: UiSurfaceRow[],
    visibleCount: number,
    clientFilter: string,
  ) => void;
  publishExecutors: (rows: ToolExecutorRow[]) => void;
  publishOpenCreate: (tab: LookupTab, open: () => void) => void;
  registerEditor: (handle: LookupEditorHandle) => () => void;
}

const LookupsSurfaceContext = createContext<LookupsSurfaceApi | null>(null);

let nextEditorId = 0;

/**
 * Page-scoped store provider. Mounted by `LookupsAdminPage` INSIDE its own
 * tree and outside the `SurfaceRuntimeProvider`'s children, so the scope
 * builder and every publishing child share one instance.
 */
export function LookupsSurfaceStoreProvider({
  children,
}: {
  children: ReactNode;
}) {
  const storeRef = useRef<LookupsStore>({
    tab: "clients",
    clients: [],
    surfaces: [],
    surfacesVisibleCount: 0,
    surfacesClientFilter: "__all__",
    executors: [],
    editors: new Map(),
    openCreate: {},
  });

  const api = useMemo<LookupsSurfaceApi>(
    () => ({
      storeRef,
      publishTab: (tab) => {
        storeRef.current.tab = tab;
      },
      publishClients: (rows) => {
        storeRef.current.clients = rows;
      },
      publishSurfaces: (rows, visibleCount, clientFilter) => {
        storeRef.current.surfaces = rows;
        storeRef.current.surfacesVisibleCount = visibleCount;
        storeRef.current.surfacesClientFilter = clientFilter;
      },
      publishExecutors: (rows) => {
        storeRef.current.executors = rows;
      },
      publishOpenCreate: (tab, open) => {
        storeRef.current.openCreate[tab] = open;
      },
      registerEditor: (handle) => {
        const id = ++nextEditorId;
        storeRef.current.editors.set(id, handle);
        return () => {
          storeRef.current.editors.delete(id);
        };
      },
    }),
    [],
  );

  return (
    <LookupsSurfaceContext.Provider value={api}>
      {children}
    </LookupsSurfaceContext.Provider>
  );
}

function useLookupsSurfaceApi(): LookupsSurfaceApi | null {
  return useContext(LookupsSurfaceContext);
}

// ---------------------------------------------------------------------------
// Publishing hooks — one per owner of state the manifest declares.
// ---------------------------------------------------------------------------

/** `LookupsAdminPage` publishes the active tab. */
export function usePublishLookupsTab(tab: LookupTab): void {
  const api = useLookupsSurfaceApi();
  useEffect(() => {
    api?.publishTab(tab);
  }, [api, tab]);
}

/** `UiClientCrud` publishes its loaded rows. */
export function usePublishUiClients(rows: UiClientRow[]): void {
  const api = useLookupsSurfaceApi();
  useEffect(() => {
    api?.publishClients(rows);
  }, [api, rows]);
}

/** `UiSurfaceCrud` publishes its loaded rows, the filtered count, and the filter. */
export function usePublishUiSurfaces(
  rows: UiSurfaceRow[],
  visibleCount: number,
  clientFilter: string,
): void {
  const api = useLookupsSurfaceApi();
  useEffect(() => {
    api?.publishSurfaces(rows, visibleCount, clientFilter);
  }, [api, rows, visibleCount, clientFilter]);
}

/** `ToolExecutorCrud` publishes its loaded rows. */
export function usePublishToolExecutors(rows: ToolExecutorRow[]): void {
  const api = useLookupsSurfaceApi();
  useEffect(() => {
    api?.publishExecutors(rows);
  }, [api, rows]);
}

/**
 * Each CRUD publishes its own "New" action so `lookup_draft` can open a
 * create form when none is open — see `useLookupsWriteHandlers`.
 */
export function usePublishOpenCreate(tab: LookupTab, open: () => void): void {
  const api = useLookupsSurfaceApi();
  const latest = useRef(open);
  latest.current = open;
  useEffect(() => {
    api?.publishOpenCreate(tab, () => latest.current());
  }, [api, tab]);
}

/**
 * Registers an open row dialog as THE live editor for its tab.
 *
 * Every value is re-read through a ref on each render, so the handle a write
 * resolves through is never a snapshot from mount. Registration lasts exactly
 * as long as the dialog is mounted — when the admin closes it, the editor
 * disappears from the store and `lookup_draft` starts refusing again, which
 * is the intended behavior rather than an edge case.
 */
export function useLookupEditorRegistration(args: {
  tab: LookupTab;
  isEdit: boolean;
  name: string;
  description: string;
  busy: boolean;
  setName: (next: string) => void;
  setDescription: (next: string) => void;
}): void {
  const api = useLookupsSurfaceApi();
  const latest = useRef(args);
  latest.current = args;

  // Stable identities so the registration effect runs once per dialog mount.
  const setName = useCallback((next: string) => {
    latest.current.setName(next);
  }, []);
  const setDescription = useCallback((next: string) => {
    latest.current.setDescription(next);
  }, []);

  const tab = args.tab;
  useEffect(() => {
    if (!api) return;
    return api.registerEditor({
      tab,
      getMode: () => (latest.current.isEdit ? "edit" : "create"),
      getName: () => latest.current.name,
      getDescription: () => latest.current.description,
      isNameEditable: () => !latest.current.isEdit,
      isBusy: () => latest.current.busy,
      setName,
      setDescription,
    });
  }, [api, tab, setName, setDescription]);
}

// ---------------------------------------------------------------------------
// Scope + write handler — what the page hands to SurfaceRuntimeProvider.
// ---------------------------------------------------------------------------

/**
 * Describe the open editor for the read half. Absent (undefined) when no
 * dialog is open, which is exactly the signal an agent should check before
 * attempting a `lookup_draft` write.
 */
function readOpenEditor(store: LookupsStore): AdminLookupOpenEditor | undefined {
  const editors = [...store.editors.values()];
  if (editors.length !== 1) return undefined;
  const editor = editors[0];
  return {
    tab: editor.tab,
    table: LOOKUP_TAB_TABLE[editor.tab],
    mode: editor.getMode(),
    name: editor.getName(),
    description: editor.getDescription(),
    name_editable: editor.isNameEditable(),
  };
}

/** Build the live surface scope. Called only when a run starts. */
export function useLookupsScopeBuilder(): () => SurfaceScopePayload {
  const api = useLookupsSurfaceApi();
  return useCallback(() => {
    const store = api?.storeRef.current;
    if (!store) {
      return createAdminLookupsScope({
        lookups_tab: "clients",
        ui_clients_list: [],
        ui_client_count: 0,
        ui_surfaces_list: [],
        ui_surface_count: 0,
        ui_surfaces_client_filter: "__all__",
        tool_executors_list: [],
        tool_executor_count: 0,
      });
    }
    return createAdminLookupsScope({
      lookups_tab: store.tab,
      ui_clients_list: store.clients.map((row) => ({
        name: row.name,
        description: row.description,
        sort_order: row.sort_order,
        is_active: row.is_active,
      })),
      ui_client_count: store.clients.length,
      ui_surfaces_list: store.surfaces.map((row) => ({
        name: row.name,
        client_name: row.client_name,
        description: row.description,
        sort_order: row.sort_order,
        is_active: row.is_active,
      })),
      ui_surface_count: store.surfacesVisibleCount,
      ui_surfaces_client_filter: store.surfacesClientFilter,
      tool_executors_list: store.executors.map((row) => ({
        name: row.name,
        description: row.description,
        parent_executor_name: row.parent_executor_name,
        mcp_server_id: row.mcp_server_id,
        is_active: row.is_active,
        config: row.config,
      })),
      tool_executor_count: store.executors.length,
      lookup_editor: readOpenEditor(store),
    });
  }, [api]);
}

/** Wait for a dialog opened by the handler to mount and register itself. */
async function awaitEditor(
  store: LookupsStore,
  timeoutMs = 3000,
): Promise<LookupEditorHandle | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const editors = [...store.editors.values()];
    if (editors.length === 1) return editors[0];
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  return null;
}

/**
 * The `lookup_draft` handler.
 *
 * RESOLUTION, and the reason this surface was worth wiring: the page is THREE
 * tables behind three tabs, so "set the name" is meaningless until the live
 * editor is resolved. It resolves from PAGE STATE — never from the payload,
 * which is why the target has no `tab`/`table`/`row` key at all.
 *
 * When exactly one row dialog is open, that dialog is the target. When NONE
 * is open there is no visible state to stage into, so — following
 * `CreateStoreInline` in the RAG data-stores adopter — applying OPENS the
 * "New" form on the ACTIVE tab and stages there: staging into something the
 * admin can see is the whole contract of `mode: "draft"`, opening a create
 * form is reversible and creates nothing, and the ask dialog has already been
 * answered by the time this runs. It still never guesses ACROSS tabs: the tab
 * the admin is looking at is the one it opens, and anything else refuses.
 *
 * That auto-open is also what makes the target usable at all. The row dialogs
 * are MODAL (Radix sets `pointer-events: none` on the body), so while one is
 * open the floating agent chat cannot be typed into — an admin cannot open a
 * dialog and then ask for help. Opening from the handler inverts that: the
 * admin asks first, with the page idle, and the form appears already filled.
 *
 * ORDER MATTERS, and the live agent run proved it: the ENTIRE patch — shape,
 * key names, string types, length caps, create-only-ness AND the per-tab name
 * pattern — is validated before a form is opened or a setter runs. The tab is
 * knowable in advance (an already-open dialog names it; otherwise it is the
 * active tab, which is the one auto-open would use), so a rejected value never
 * leaves a stray empty dialog on screen and never half-writes a row.
 */
export function useLookupsWriteHandlers(): () => SurfaceWriteHandlers {
  const api = useLookupsSurfaceApi();

  return useCallback(
    () => ({
      lookup_draft: async (value: unknown) => {
        const store = api?.storeRef.current;
        if (!store)
          throw new Error(
            "The lookups console is not mounted, so there is nothing to stage into.",
          );

        // ── 1. Shape. Validated first, with no editor resolved and nothing
        //       opened, so a malformed call changes nothing on screen.
        if (typeof value !== "object" || value === null || Array.isArray(value))
          throw new Error(
            `lookup_draft expects an object with at least one of: ${LOOKUP_DRAFT_FIELDS.join(" | ")}. Send plain text values, not JSON and not JSON-encoded.`,
          );

        const draft = value as Record<string, unknown>;
        const keys = Object.keys(draft);
        if (keys.length === 0)
          throw new Error("lookup_draft needs at least one field to stage.");

        const unknownKeys = keys.filter(
          (key) => !(LOOKUP_DRAFT_FIELDS as readonly string[]).includes(key),
        );
        if (unknownKeys.length > 0)
          throw new Error(
            `lookup_draft does not accept: ${unknownKeys.join(", ")}. Allowed fields: ${LOOKUP_DRAFT_FIELDS.join(" | ")}. Sort order, the active toggle, the client select, the parent executor, and the executor config JSON are the admin's own controls and have no write target.`,
          );

        /** The sent string for a present key; `undefined` when the key is absent. */
        const field = (key: string): string | undefined => {
          if (!(key in draft)) return undefined;
          const raw = draft[key];
          if (typeof raw !== "string")
            throw new Error(
              `lookup_draft.${key} expects a string — plain text, not JSON and not JSON-encoded.`,
            );
          if (!raw.trim())
            throw new Error(
              `lookup_draft.${key} cannot be empty — send a real value or omit the field.`,
            );
          return raw;
        };

        const nextName = field("name");
        const nextDescription = field("description");
        if (
          nextDescription !== undefined &&
          nextDescription.trim().length > LOOKUP_DESCRIPTION_MAX_CHARS
        )
          throw new Error(
            `lookup_draft.description is ${nextDescription.trim().length} characters; the limit is ${LOOKUP_DESCRIPTION_MAX_CHARS}. These are one-line reference labels, not documentation.`,
          );
        if (
          nextName !== undefined &&
          nextName.trim().length > LOOKUP_NAME_MAX_CHARS
        )
          throw new Error(
            `lookup_draft.name is ${nextName.trim().length} characters; the limit is ${LOOKUP_NAME_MAX_CHARS}.`,
          );

        // ── 2. Work out WHICH editor this lands in — WITHOUT opening
        //       anything yet, so the checks below can run against the real
        //       tab and a rejected value leaves no stray dialog on screen.
        const open = [...store.editors.values()];
        if (open.length > 1)
          throw new Error(
            "More than one lookup row editor is open, so which row you meant is ambiguous — refused. Ask the admin to close all but the row they want edited.",
          );

        const existing = open[0];
        // With nothing open this will open the ACTIVE tab's New form, so both
        // the tab and the name-editability are known before anything opens.
        const tab = existing ? existing.tab : store.tab;
        const nameEditable = existing ? existing.isNameEditable() : true;
        const table = LOOKUP_TAB_TABLE[tab];

        if (existing?.isBusy())
          throw new Error(
            `The ${table} row editor is saving right now, so staging into it would edit a row mid-write — refused. Try again once the save finishes.`,
          );

        // ── 3. name is create-only. A correctness gate, not politeness.
        if (nextName !== undefined) {
          if (!nameEditable)
            throw new Error(
              `This editor is CHANGING an existing ${table} row, so its name cannot be staged: the name is the primary key, the dialog renders that input disabled, and the save is an upsert on the name — a different name would INSERT A SECOND ROW instead of renaming, silently orphaning everything that already references the original. Renaming a lookup key is a human migration. Send only \`description\` here, or ask the admin to create a new row.`,
            );

          const rule = LOOKUP_NAME_RULES[tab];
          if (!rule.pattern.test(nextName.trim()))
            throw new Error(
              `"${nextName.trim()}" is not a valid name for a ${table} row. Required: ${rule.describe}.`,
            );
        }

        // ── 4. Everything is valid — only NOW open a form if one is needed.
        let editor = existing;
        if (!editor) {
          const openCreate = store.openCreate[tab];
          if (!openCreate)
            throw new Error(
              `No row editor is open on the ${table} tab and its New action is not available, so there is nothing to stage into. Ask the admin to open a row.`,
            );
          openCreate();
          editor = (await awaitEditor(store)) as LookupEditorHandle;
          if (!editor)
            throw new Error(
              `Tried to open a new ${table} row form but it did not appear, so nothing was staged. Ask the admin to click New and try again.`,
            );
        }

        // ── 5. Stage, through the dialog's own setters.
        if (nextName !== undefined) editor.setName(nextName.trim());
        if (nextDescription !== undefined)
          editor.setDescription(nextDescription.trim());
      },
    }),
    [api],
  );
}
