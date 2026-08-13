"use client";

/**
 * Surface runtime for the Tool Registry Bundles admin (`matrx-admin/bundles`)
 * — the page's scope emitter AND the authority both write targets resolve
 * through.
 *
 * WHY THIS MODULE EXISTS. `BundlesAdminPage` keeps its list/filter/search in
 * one component, the selected bundle's editable identity in a `BundleDetail`
 * child that only mounts while a bundle is selected, and the new-bundle fields
 * in a `NewBundleDialog` that only mounts while the admin is creating. Before
 * this there was no shared point to build a scope from, so the surface was
 * manifest-only (`readiness: "stub"`, "Emitters: NONE YET") and an agent bound
 * here was offered no write tool at all — which looks exactly like a broken
 * target.
 *
 * Rather than lift two editors' worth of state up into the page (and re-plumb
 * a working admin screen), each child PUBLISHES what it owns into a
 * page-scoped store, and the page reads that store to build both `getScope()`
 * and the write handlers. This is the shape `matrx-admin/lookups` shipped.
 *
 * EVERYTHING IS READ THROUGH REFS, deliberately. `applySurfaceWrite` resolves
 * the handler from `getWriteHandlers()` BEFORE it awaits the confirm dialog,
 * so a guard read off a render closure ("is a bundle still selected", "is a
 * save in flight") reflects the moment the agent CALLED, not the moment the
 * admin pressed Apply. An admin who changes selection while the confirm is up
 * would otherwise get a write staged into an editor that no longer exists.
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
  BUNDLE_DESCRIPTION_MAX_CHARS,
  BUNDLE_NAME_MAX_CHARS,
  BUNDLE_NAME_RULE,
  NEW_BUNDLE_DRAFT_FIELDS,
  listerToolNameFor,
} from "@/features/tool-registry/bundles/bundlesVocabulary";
import type {
  BundleMemberWithTool,
  BundleRow,
} from "@/features/tool-registry/bundles/services/bundles.service";
import {
  createAdminBundlesScope,
  type AdminBundleEditor,
  type AdminNewBundleEditor,
} from "@/features/surfaces/manifests/admin-bundles.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import type { SurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";

/**
 * The selected bundle's inline identity editor, exposed as getters plus the
 * panel's OWN setter.
 *
 * No plain values: a snapshot captured at registration would be stale by the
 * time an agent's write clears the confirm dialog (see the module header).
 * `setDescription` is a React state setter — stable by construction, and the
 * SAME one the admin's typing calls, so nothing here is a parallel write path.
 */
export interface BundleDetailEditorHandle {
  getBundleId: () => string;
  getBundleName: () => string;
  getDescription: () => string;
  getPersistedDescription: () => string;
  getIsActive: () => boolean;
  /** True while the panel's Save is in flight. */
  isSaving: () => boolean;
  setDescription: (next: string) => void;
}

/** The New bundle dialog, same contract as above. */
export interface NewBundleEditorHandle {
  getName: () => string;
  getDescription: () => string;
  getIsSystem: () => boolean;
  /** True while the dialog's Create is in flight. */
  isBusy: () => boolean;
  setName: (next: string) => void;
  setDescription: (next: string) => void;
}

interface BundlesStore {
  filter: "active" | "all";
  search: string;
  bundles: BundleRow[];
  selected: BundleRow | null;
  members: BundleMemberWithTool[];
  /** Open detail editors by registration id. Normally 0 or 1. */
  detailEditors: Map<number, BundleDetailEditorHandle>;
  /** Open create dialogs by registration id. Normally 0 or 1 — it is modal. */
  newEditors: Map<number, NewBundleEditorHandle>;
  /** The page's "New bundle" action, so a handler can open the form itself. */
  openCreate: (() => void) | null;
}

interface BundlesSurfaceApi {
  storeRef: React.MutableRefObject<BundlesStore>;
  publishList: (args: {
    filter: "active" | "all";
    search: string;
    bundles: BundleRow[];
    selected: BundleRow | null;
  }) => void;
  publishMembers: (rows: BundleMemberWithTool[]) => void;
  publishOpenCreate: (open: () => void) => void;
  registerDetailEditor: (handle: BundleDetailEditorHandle) => () => void;
  registerNewEditor: (handle: NewBundleEditorHandle) => () => void;
}

const BundlesSurfaceContext = createContext<BundlesSurfaceApi | null>(null);

let nextEditorId = 0;

/**
 * Page-scoped store provider. Mounted by `BundlesAdminPage` INSIDE its own
 * tree and outside the `SurfaceRuntimeProvider`'s children, so the scope
 * builder and every publishing child share one instance.
 */
export function BundlesSurfaceStoreProvider({
  children,
}: {
  children: ReactNode;
}) {
  const storeRef = useRef<BundlesStore>({
    filter: "active",
    search: "",
    bundles: [],
    selected: null,
    members: [],
    detailEditors: new Map(),
    newEditors: new Map(),
    openCreate: null,
  });

  const api = useMemo<BundlesSurfaceApi>(
    () => ({
      storeRef,
      publishList: ({ filter, search, bundles, selected }) => {
        storeRef.current.filter = filter;
        storeRef.current.search = search;
        storeRef.current.bundles = bundles;
        storeRef.current.selected = selected;
      },
      publishMembers: (rows) => {
        storeRef.current.members = rows;
      },
      publishOpenCreate: (open) => {
        storeRef.current.openCreate = open;
      },
      // Registration is keyed by an incrementing id rather than a single slot
      // so a LATE cleanup cannot clobber a newer registration — `BundleDetail`
      // is keyed by bundle id, so switching bundles mounts a new editor and
      // unmounts the old one.
      registerDetailEditor: (handle) => {
        const id = ++nextEditorId;
        storeRef.current.detailEditors.set(id, handle);
        return () => {
          storeRef.current.detailEditors.delete(id);
        };
      },
      registerNewEditor: (handle) => {
        const id = ++nextEditorId;
        storeRef.current.newEditors.set(id, handle);
        return () => {
          storeRef.current.newEditors.delete(id);
        };
      },
    }),
    [],
  );

  return (
    <BundlesSurfaceContext.Provider value={api}>
      {children}
    </BundlesSurfaceContext.Provider>
  );
}

function useBundlesSurfaceApi(): BundlesSurfaceApi | null {
  return useContext(BundlesSurfaceContext);
}

// ---------------------------------------------------------------------------
// Publishing hooks — one per owner of state the manifest declares.
// ---------------------------------------------------------------------------

/** `BundlesAdminPage` publishes the list, its filter/search, and the selection. */
export function usePublishBundleList(args: {
  filter: "active" | "all";
  search: string;
  bundles: BundleRow[];
  selected: BundleRow | null;
}): void {
  const api = useBundlesSurfaceApi();
  const { filter, search, bundles, selected } = args;
  useEffect(() => {
    api?.publishList({ filter, search, bundles, selected });
  }, [api, filter, search, bundles, selected]);
}

/** `BundleDetail` publishes the selected bundle's loaded members. */
export function usePublishBundleMembers(rows: BundleMemberWithTool[]): void {
  const api = useBundlesSurfaceApi();
  useEffect(() => {
    api?.publishMembers(rows);
  }, [api, rows]);
}

/**
 * `BundlesAdminPage` publishes its "New bundle" action so `new_bundle_draft`
 * can open the create form when none is open — see `useBundlesWriteHandlers`.
 */
export function usePublishOpenCreate(open: () => void): void {
  const api = useBundlesSurfaceApi();
  const latest = useRef(open);
  latest.current = open;
  useEffect(() => {
    api?.publishOpenCreate(() => latest.current());
  }, [api]);
}

/**
 * Registers the open detail panel as THE live editor for the selected bundle.
 *
 * Every value is re-read through a ref on each render, so the handle a write
 * resolves through is never a snapshot from mount. Registration lasts exactly
 * as long as a bundle is selected — deselecting unmounts `BundleDetail`, the
 * editor disappears from the store, and `bundle_description` starts refusing
 * again, which is the intended behavior rather than an edge case.
 */
export function useBundleDetailRegistration(args: {
  bundleId: string;
  bundleName: string;
  description: string;
  persistedDescription: string;
  isActive: boolean;
  saving: boolean;
  setDescription: (next: string) => void;
}): void {
  const api = useBundlesSurfaceApi();
  const latest = useRef(args);
  latest.current = args;

  // Stable identity so the registration effect runs once per panel mount.
  const setDescription = useCallback((next: string) => {
    latest.current.setDescription(next);
  }, []);

  useEffect(() => {
    if (!api) return;
    return api.registerDetailEditor({
      getBundleId: () => latest.current.bundleId,
      getBundleName: () => latest.current.bundleName,
      getDescription: () => latest.current.description,
      getPersistedDescription: () => latest.current.persistedDescription,
      getIsActive: () => latest.current.isActive,
      isSaving: () => latest.current.saving,
      setDescription,
    });
  }, [api, setDescription]);
}

/** Registers the open New bundle dialog as THE live create editor. */
export function useNewBundleRegistration(args: {
  name: string;
  description: string;
  isSystem: boolean;
  busy: boolean;
  setName: (next: string) => void;
  setDescription: (next: string) => void;
}): void {
  const api = useBundlesSurfaceApi();
  const latest = useRef(args);
  latest.current = args;

  const setName = useCallback((next: string) => {
    latest.current.setName(next);
  }, []);
  const setDescription = useCallback((next: string) => {
    latest.current.setDescription(next);
  }, []);

  useEffect(() => {
    if (!api) return;
    return api.registerNewEditor({
      getName: () => latest.current.name,
      getDescription: () => latest.current.description,
      getIsSystem: () => latest.current.isSystem,
      isBusy: () => latest.current.busy,
      setName,
      setDescription,
    });
  }, [api, setName, setDescription]);
}

// ---------------------------------------------------------------------------
// Scope + write handlers — what the page hands to SurfaceRuntimeProvider.
// ---------------------------------------------------------------------------

/** Exactly one editor of a kind, or nothing. Ambiguity is never guessed at. */
function soleEditor<T>(map: Map<number, T>): T | undefined {
  const all = [...map.values()];
  return all.length === 1 ? all[0] : undefined;
}

/**
 * Describe the selected bundle's inline editor for the read half. Absent when
 * no bundle is selected — exactly the signal an agent should check before
 * attempting a `bundle_description` write.
 */
function readDetailEditor(store: BundlesStore): AdminBundleEditor | undefined {
  const editor = soleEditor(store.detailEditors);
  if (!editor) return undefined;
  const description = editor.getDescription();
  return {
    bundle_id: editor.getBundleId(),
    bundle_name: editor.getBundleName(),
    description,
    description_dirty: description !== editor.getPersistedDescription(),
    is_active: editor.getIsActive(),
    saving: editor.isSaving(),
  };
}

/** Describe the open New bundle dialog. Absent when it is closed. */
function readNewEditor(store: BundlesStore): AdminNewBundleEditor | undefined {
  const editor = soleEditor(store.newEditors);
  if (!editor) return undefined;
  const name = editor.getName();
  return {
    name,
    description: editor.getDescription(),
    is_system: editor.getIsSystem(),
    lister_tool_name: name ? listerToolNameFor(name) : "",
    busy: editor.isBusy(),
  };
}

/** Build the live surface scope. Called only when a run starts. */
export function useBundlesScopeBuilder(): () => SurfaceScopePayload {
  const api = useBundlesSurfaceApi();
  return useCallback(() => {
    const store = api?.storeRef.current;
    if (!store) {
      return createAdminBundlesScope({
        bundles_filter: "active",
        bundles_search: "",
        bundle_count: 0,
        bundles_list: [],
      });
    }
    const selected = store.selected;
    return createAdminBundlesScope({
      bundles_filter: store.filter,
      bundles_search: store.search,
      bundle_count: store.bundles.length,
      bundles_list: store.bundles.map((b) => ({
        id: b.id,
        name: b.name,
        description: b.description,
        is_active: b.is_active,
        is_system: b.is_system,
      })),
      selected_bundle_id: selected?.id,
      selected_bundle: selected
        ? {
            id: selected.id,
            name: selected.name,
            description: selected.description,
            is_active: selected.is_active,
            is_system: selected.is_system,
            lister_tool_id: selected.lister_tool_id,
            metadata: (selected.metadata ?? {}) as Record<string, unknown>,
          }
        : undefined,
      bundle_members: selected
        ? store.members.map((m) => ({
            tool_id: m.member.tool_id,
            tool_name: m.tool?.name ?? m.member.tool_id,
            tool_description: m.tool?.description ?? null,
            local_alias: m.member.local_alias,
            sort_order: m.member.sort_order,
          }))
        : undefined,
      bundle_member_count: selected ? store.members.length : undefined,
      bundle_editor: readDetailEditor(store),
      new_bundle_editor: readNewEditor(store),
    });
  }, [api]);
}

/** Wait for the create dialog opened by the handler to mount and register. */
async function awaitNewEditor(
  store: BundlesStore,
  timeoutMs = 3000,
): Promise<NewBundleEditorHandle | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const editor = soleEditor(store.newEditors);
    if (editor) return editor;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  return null;
}

/**
 * Read a string field off a draft object, or `undefined` when the key is
 * absent. Throws on anything that is present but not usable text.
 *
 * The `not JSON and not JSON-encoded` phrasing is in the throw on purpose: the
 * inline-tool layer PARSES a JSON-looking argument before a handler sees it,
 * so an agent that "fixes" a rejection by double-encoding lands escaped `\n`
 * and stray quotes in the field. Saying it here is what stops that loop.
 */
function readTextField(
  draft: Record<string, unknown>,
  target: string,
  key: string,
): string | undefined {
  if (!(key in draft)) return undefined;
  const raw = draft[key];
  if (typeof raw !== "string")
    throw new Error(
      `${target}.${key} expects a string — plain text, not JSON and not JSON-encoded.`,
    );
  if (!raw.trim())
    throw new Error(
      `${target}.${key} cannot be empty — send a real value or omit the field.`,
    );
  return raw.trim();
}

/** Shared bound check so both targets reject an over-long description alike. */
function assertDescriptionLength(target: string, description: string): void {
  if (description.length > BUNDLE_DESCRIPTION_MAX_CHARS)
    throw new Error(
      `${target} description is ${description.length} characters; the limit is ${BUNDLE_DESCRIPTION_MAX_CHARS}. A bundle description is a short paragraph telling an admin (and the bundle picker) what this bundle groups together, not documentation.`,
    );
}

/**
 * The two write handlers.
 *
 * WHY TWO TARGETS AND NOT ONE OBJECT — the argument is in the manifest
 * docblock; the code consequence is here. Each target names its own
 * destination, so neither has to infer one from invisible page state: the
 * agent's CHOICE of target is its declaration of intent, and the admin reads
 * that choice in the confirm dialog.
 *
 * ORDER MATTERS in both: the ENTIRE payload — shape, key names, string types,
 * emptiness, length caps, and the name pattern — is validated BEFORE any form
 * is opened or any setter runs, so a rejected value never leaves a stray empty
 * dialog on screen and never half-writes an editor. (`matrx-admin/lookups`
 * shipped that bug first and caught it in live verification.)
 */
export function useBundlesWriteHandlers(): () => SurfaceWriteHandlers {
  const api = useBundlesSurfaceApi();

  return useCallback(
    () => ({
      /**
       * Stages name/description into the New bundle create form, opening it
       * when none is open.
       *
       * That auto-open is what makes the target usable at all. The create form
       * is a Radix MODAL (it sets `pointer-events: none` on the body), so
       * while it is open the floating agent chat cannot be typed into — an
       * admin cannot open the form and then ask for help. Opening from the
       * handler inverts that: the admin asks first, with the page idle, and
       * the form appears already filled. This follows `CreateStoreInline` in
       * the RAG data-stores adopter and `lookup_draft` in the sibling lookups
       * console.
       */
      new_bundle_draft: async (value: unknown) => {
        const store = api?.storeRef.current;
        if (!store)
          throw new Error(
            "The bundles console is not mounted, so there is nothing to stage into.",
          );

        // ── 1. Shape. Validated first, with nothing opened, so a malformed
        //       call changes nothing on screen.
        if (typeof value !== "object" || value === null || Array.isArray(value))
          throw new Error(
            `new_bundle_draft expects an object with at least one of: ${NEW_BUNDLE_DRAFT_FIELDS.join(" | ")}. Send plain text values, not JSON and not JSON-encoded.`,
          );

        const draft = value as Record<string, unknown>;
        const keys = Object.keys(draft);
        if (keys.length === 0)
          throw new Error(
            "new_bundle_draft needs at least one field to stage.",
          );

        const unknownKeys = keys.filter(
          (key) =>
            !(NEW_BUNDLE_DRAFT_FIELDS as readonly string[]).includes(key),
        );
        if (unknownKeys.length > 0)
          throw new Error(
            `new_bundle_draft does not accept: ${unknownKeys.join(", ")}. Allowed fields: ${NEW_BUNDLE_DRAFT_FIELDS.join(" | ")}. The System bundle switch, the bundle's members, and pressing Create are the admin's own controls and have no write target.`,
          );

        const nextName = readTextField(draft, "new_bundle_draft", "name");
        const nextDescription = readTextField(
          draft,
          "new_bundle_draft",
          "description",
        );

        if (nextDescription !== undefined)
          assertDescriptionLength("new_bundle_draft", nextDescription);

        if (nextName !== undefined) {
          if (nextName.length > BUNDLE_NAME_MAX_CHARS)
            throw new Error(
              `new_bundle_draft.name is ${nextName.length} characters; the limit is ${BUNDLE_NAME_MAX_CHARS}. Bundle names are short slugs like \`google-workspace\`.`,
            );
          if (!BUNDLE_NAME_RULE.pattern.test(nextName))
            // Deliberately does NOT echo the rejected name into the lister
            // template: `bundle:list_Browser Tools!` reads as though that
            // lister would be created, when nothing was staged at all.
            throw new Error(
              `"${nextName}" is not a valid bundle name. Required: ${BUNDLE_NAME_RULE.describe}. The name is not a label — it becomes the bundle's globally-unique key, and creating the bundle mints a lister tool called \`${listerToolNameFor("<name>")}\` that a model will call by that exact name.`,
            );
          // The DB enforces global uniqueness (`tool_bundle_name_key`); this
          // catches the clash the admin can already SEE, so the agent hears it
          // now instead of the form refusing to submit later. The loaded list
          // honours `bundles_filter`, so on "active" it cannot see an inactive
          // bundle holding the name — hence "already in the list", not "free".
          if (store.bundles.some((b) => b.name === nextName))
            throw new Error(
              `A bundle named "${nextName}" is already in the list, and bundle names are globally unique — pick a different name. (The list currently shows ${store.filter === "active" ? "ACTIVE bundles only, so an inactive bundle could also be holding this name" : "all bundles"}.)`,
            );
        }

        // ── 2. Resolve the editor. Only NOW may anything open.
        let editor = soleEditor(store.newEditors);
        if (editor?.isBusy())
          throw new Error(
            "The New bundle form is creating a bundle right now, so staging into it would edit a form mid-submit — refused. Try again once it finishes.",
          );
        if (store.newEditors.size > 1)
          throw new Error(
            "More than one New bundle form is open, so which one you meant is ambiguous — refused.",
          );

        if (!editor) {
          if (!store.openCreate)
            throw new Error(
              "The New bundle form is not open and its New action is not available, so there is nothing to stage into.",
            );
          store.openCreate();
          const opened = await awaitNewEditor(store);
          if (!opened)
            throw new Error(
              "Tried to open the New bundle form but it did not appear, so nothing was staged. Ask the admin to click New bundle and try again.",
            );
          editor = opened;
        }

        // ── 3. Stage, through the dialog's own setters.
        if (nextName !== undefined) editor.setName(nextName);
        if (nextDescription !== undefined)
          editor.setDescription(nextDescription);
      },

      /**
       * Stages the selected bundle's description into the detail panel's
       * Description textarea. The panel is INLINE (not a dialog), so unlike
       * the create form there is nothing to open and nothing to reach around
       * — the admin can read the staged text and press Save, or not.
       *
       * It never picks a bundle. With none selected there is no editor and
       * this refuses, because choosing WHICH registry row to rewrite is the
       * admin's decision, not an inference from the conversation.
       */
      bundle_description: async (value: unknown) => {
        const store = api?.storeRef.current;
        if (!store)
          throw new Error(
            "The bundles console is not mounted, so there is nothing to stage into.",
          );

        // ── 1. Shape first, before any editor is touched.
        if (typeof value !== "string")
          throw new Error(
            "bundle_description expects a single string — the description text itself, as plain text, not JSON and not JSON-encoded. To stage a NEW bundle's fields instead, use new_bundle_draft.",
          );
        const next = value.trim();
        if (!next)
          throw new Error(
            "bundle_description cannot be empty. Send the replacement text; clearing a bundle's description back to blank is the admin's own edit, not an agent write.",
          );
        assertDescriptionLength("bundle_description", next);

        // ── 2. Resolve the editor — read through the store's refs, never off
        //       a render closure, because the confirm dialog was answered
        //       after this handler was resolved.
        if (store.detailEditors.size > 1)
          throw new Error(
            "More than one bundle detail panel is registered, so which bundle you meant is ambiguous — refused.",
          );
        const editor = soleEditor(store.detailEditors);
        if (!editor)
          throw new Error(
            "No bundle is selected, so there is no description to replace. Ask the admin to pick a bundle from the list first — this target will not choose one for you. (To draft a brand-new bundle instead, use new_bundle_draft.)",
          );
        if (editor.isSaving())
          throw new Error(
            `The "${editor.getBundleName()}" bundle is saving right now, so staging into it would edit the row mid-write — refused. Try again once the save finishes.`,
          );

        // ── 3. Stage, through the panel's own setter.
        editor.setDescription(next);
      },
    }),
    [api],
  );
}
