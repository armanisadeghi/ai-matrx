/**
 * Instance Working Document thunks.
 *
 * Side-effectful operations for the per-conversation documents (working +
 * scratch). MATERIALIZE-ON-WRITE model:
 *
 *   - Enabling a document only RESERVES a client id (binding) — no DB row. The
 *     durable `workbench.working_documents` row + the `platform.associations`
 *     edge to the conversation are created on the FIRST byte of content, by
 *     whichever party writes first (`materializeWorkingDocumentThunk` for the
 *     user; the server's writeback for the agent, reflected via the stream).
 *   - `hydrateConversationDocumentsThunk` restores the conversation's enabled
 *     documents from its association edges on mount.
 *   - `setConversationDocumentEnabledThunk` toggles on (reserve id) / off
 *     (persist the opt-out on the edge if the row exists).
 *   - `linkConversationDocumentThunk` attaches an EXISTING document (from any
 *     conversation) as this conversation's document of that kind.
 *   - `materializeWorkingDocumentThunk` performs the first-content materialize.
 *   - `bind/unbindWorkingDocumentToNoteThunk` swap the durable source to/from a
 *     `workbench.notes` row (working kind only).
 *   - `syncWorkingDocumentFromAgentThunk` reflects an agent writeback.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { NotesAPI } from "@/features/notes/service/notesApi";
import { getActiveOrgId } from "@/lib/organizations/activeOrg";
import {
  refreshNoteContent,
  saveNoteField,
} from "@/features/notes/redux/thunks";
import { generateLabelFromContent } from "@/features/notes/hooks/useAutoLabel";
import {
  applyAgentWorkingDocContent,
  DEFAULT_DOC_KIND,
  markWorkingDocError,
  markWorkingDocMaterialized,
  NO_BINDING,
  reservedWorkingDocumentId,
  setWorkingDocBinding,
  setWorkingDocContent,
  setWorkingDocEnabled,
  setWorkingDocTitle,
  setWorkingDocVersion,
  type WorkingDocumentKind,
} from "./instance-working-document.slice";
import {
  selectWorkingDocBinding,
  selectWorkingDocContent,
  selectWorkingDocMaterialized,
  selectWorkingDocTitle,
  selectWorkingDocVersion,
} from "./instance-working-document.selectors";
import { selectIsCacheOnly } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  commitWorkingDocumentContent,
  getCxWorkingDocumentById,
  linkDocumentToConversation,
  listConversationDocuments,
  materializeWorkingDocument,
  setConversationDocumentEnabled,
  unlinkDocumentFromConversation,
  updateCxWorkingDocumentContent,
} from "./cx-working-document.service";

interface ThunkConfig {
  state: RootState;
  dispatch: AppDispatch;
}

const DOC_KINDS: WorkingDocumentKind[] = ["working", "scratch"];

/** Title char budget for auto-derived document names (longer than a note). */
const AUTO_TITLE_MAX = 60;

/**
 * Derive a human title from the document's content (H1 / first non-empty line,
 * markdown markers stripped) — the same primitive notes uses. Returns "" when
 * there's nothing to derive from.
 */
export function deriveWorkingDocTitle(content: string): string {
  return generateLabelFromContent(content, AUTO_TITLE_MAX);
}

/**
 * The org a new working document is stamped with: the conversation's org first,
 * then the user's GLOBAL active org (header selection, else personal) via the
 * canonical `getActiveOrgId()`. Only returns null in the impossible case where
 * neither is present — callers still guard, but in practice it's never null.
 */
function resolveOrgId(state: RootState, conversationId: string): string | null {
  return (
    state.conversations.byConversationId[conversationId]?.organizationId ??
    getActiveOrgId()
  );
}

/**
 * How to reconcile current content when binding to a note that the user picked
 * while content already exists.
 */
export type BindNoteMode = "replace" | "append";

// =============================================================================
// Hydrate — restore enabled documents from the conversation's association edges
// =============================================================================

/**
 * Restore the conversation's persisted documents from its `platform.associations`
 * edges. A kind with an enabled edge comes back enabled + bound (+ content); a
 * kind with no enabled edge stays OFF (opt-in default). READ-ONLY — never
 * provisions. For the primary slot we take the first enabled edge of each kind.
 */
export const hydrateConversationDocumentsThunk = createAsyncThunk<
  void,
  { conversationId: string },
  ThunkConfig
>(
  "instanceWorkingDocument/hydrate",
  async ({ conversationId }, { dispatch, getState }) => {
    // Guests on `/chat/new` mount RunControlsMenu with a provisional
    // conversation id but have no persisted documents — skip quietly.
    if (!selectUserId(getState())) return;

    let links;
    try {
      links = await listConversationDocuments(conversationId);
    } catch (err) {
      console.error("[working-document] hydrate: list links failed", {
        conversationId,
        err,
      });
      return;
    }
    await Promise.all(
      DOC_KINDS.map(async (kind) => {
        // Prefer the conversation's OWN (born-here, deterministic-id) document as
        // the primary slot; fall back to the first enabled attached doc. (True
        // multi-attach beyond the primary is a DocumentsWorkspace concern.)
        const deterministicId = reservedWorkingDocumentId(conversationId, kind);
        const kindLinks = links.filter((l) => l.kind === kind && l.enabled);
        const link =
          kindLinks.find((l) => l.documentId === deterministicId) ??
          kindLinks[0];
        if (!link) return; // never used / disabled → stays off
        try {
          const doc = await getCxWorkingDocumentById(link.documentId);
          if (!doc) return; // edge points at a vanished doc — leave off
          dispatch(
            setWorkingDocEnabled({ conversationId, kind, enabled: true }),
          );
          dispatch(
            setWorkingDocBinding({
              conversationId,
              kind,
              binding: {
                kind: "cx_working_document",
                id: doc.id,
                label: doc.title,
              },
            }),
          );
          dispatch(
            markWorkingDocMaterialized({
              conversationId,
              kind,
              version: doc.version,
            }),
          );
          if (doc.title) {
            dispatch(
              setWorkingDocTitle({ conversationId, kind, title: doc.title }),
            );
          }
          dispatch(
            applyAgentWorkingDocContent({
              conversationId,
              kind,
              content: doc.content ?? "",
            }),
          );
        } catch (err) {
          console.error("[working-document] hydrate: restore failed", {
            conversationId,
            kind,
            err,
          });
        }
      }),
    );
  },
);

// =============================================================================
// Enable / disable
// =============================================================================

/**
 * Toggle a document on/off. Enabling RESERVES a client id (no DB row — the row
 * is created on first edit); disabling persists the opt-out on the edge when the
 * row already exists, so a reload restores it OFF.
 */
export const setConversationDocumentEnabledThunk = createAsyncThunk<
  void,
  { conversationId: string; kind?: WorkingDocumentKind; enabled: boolean },
  ThunkConfig
>(
  "instanceWorkingDocument/setEnabled",
  async (
    { conversationId, kind = DEFAULT_DOC_KIND, enabled },
    { dispatch, getState },
  ) => {
    dispatch(setWorkingDocEnabled({ conversationId, kind, enabled }));
    const binding = selectWorkingDocBinding(conversationId, kind)(getState());

    if (enabled) {
      // Reserve the DETERMINISTIC id only if not already pointing at a
      // working_document (a hydrated/linked doc keeps its id). NO durable write
      // here — the id is deterministic per (conversation, kind) so every tab
      // agrees and materialize-on-write collapses to one row.
      if (binding.kind === "none" || !binding.id) {
        dispatch(
          setWorkingDocBinding({
            conversationId,
            kind,
            binding: {
              kind: "cx_working_document",
              id: reservedWorkingDocumentId(conversationId, kind),
              label: null,
            },
          }),
        );
      }
      return;
    }

    // Disable: persist enabled=false on the edge only if the row exists.
    const materialized = selectWorkingDocMaterialized(
      conversationId,
      kind,
    )(getState());
    if (materialized && binding.kind === "cx_working_document" && binding.id) {
      try {
        const orgId = resolveOrgId(getState(), conversationId);
        if (orgId) {
          await setConversationDocumentEnabled(
            binding.id,
            conversationId,
            orgId,
            kind,
            false,
          );
        }
      } catch (err) {
        console.error("[working-document] failed to persist disable", {
          conversationId,
          kind,
          err,
        });
      }
    }
  },
);

// =============================================================================
// Materialize-on-write — create the row + edge on the first byte of content
// =============================================================================

/**
 * Create the durable row + conversation edge for the conversation's reserved
 * working/scratch document, seeding it with the current content + an auto-derived
 * title. Idempotent and gated: a no-op if already materialized, if there is no
 * content yet (create-on-first-content), or while the conversation is `cacheOnly`
 * (not server-confirmed — the edge would target a not-yet-real conversation id;
 * the content stays in Redux and this re-fires once it's confirmed).
 */
export const materializeWorkingDocumentThunk = createAsyncThunk<
  void,
  { conversationId: string; kind?: WorkingDocumentKind },
  ThunkConfig
>(
  "instanceWorkingDocument/materialize",
  async (
    { conversationId, kind = DEFAULT_DOC_KIND },
    { dispatch, getState },
  ) => {
    const state = getState();
    if (selectIsCacheOnly(conversationId)(state)) return;

    const binding = selectWorkingDocBinding(conversationId, kind)(state);
    if (binding.kind !== "cx_working_document" || !binding.id) return;
    if (selectWorkingDocMaterialized(conversationId, kind)(state)) return;

    const content = selectWorkingDocContent(conversationId, kind)(state);
    if (!content.trim()) return; // create-on-first-CONTENT, not on activation

    const currentTitle = selectWorkingDocTitle(conversationId, kind)(state);
    const title = currentTitle || deriveWorkingDocTitle(content);
    const orgId = resolveOrgId(state, conversationId);
    if (!orgId) {
      console.error("[working-document] materialize: no org for conversation", {
        conversationId,
      });
      return;
    }

    try {
      const doc = await materializeWorkingDocument({
        id: binding.id,
        conversationId,
        organizationId: orgId,
        kind,
        title,
        content,
      });
      dispatch(
        markWorkingDocMaterialized({
          conversationId,
          kind,
          version: doc.version,
        }),
      );
      // CATCH-UP: the materialize captured a snapshot of `content`, but the user
      // may have typed more while it (or a concurrent dedup'd materialize) was in
      // flight. Push the latest slice content — VERSION-AWARE, so if a concurrent
      // agent edit already advanced the row we defer to realtime instead of
      // clobbering it.
      const latest = selectWorkingDocContent(conversationId, kind)(getState());
      if (latest !== content) {
        try {
          const res = await commitWorkingDocumentContent(
            doc.id,
            latest,
            doc.version,
          );
          if (res.status === "saved") {
            dispatch(
              setWorkingDocVersion({
                conversationId,
                kind,
                version: res.document.version,
              }),
            );
          } else {
            console.warn(
              "[working-document] materialize catch-up raced a concurrent edit " +
                "— deferring to realtime rather than clobbering",
              { conversationId, kind },
            );
          }
        } catch (err) {
          console.error("[working-document] materialize catch-up failed", {
            conversationId,
            kind,
            err,
          });
        }
      }
      // Persist the auto-title back into the slice when we derived one.
      if (title && !currentTitle) {
        dispatch(setWorkingDocTitle({ conversationId, kind, title }));
      }
    } catch (err) {
      console.error("[working-document] materialize failed", {
        conversationId,
        kind,
        err,
      });
      dispatch(
        markWorkingDocError({
          conversationId,
          kind,
          error: "Could not save the document.",
        }),
      );
    }
  },
);

// =============================================================================
// Persist content from OUTSIDE the live editor (RichDocument edit action, etc.)
// =============================================================================

/**
 * Persist a full content replacement produced outside the panel's debounced
 * draft (the fullscreen-editor save, agent-tool writebacks). Writes the canonical
 * slice content, then the durable source — materializing first if the row doesn't
 * exist yet. LOUD on failure.
 */
export const persistWorkingDocumentContentThunk = createAsyncThunk<
  void,
  { conversationId: string; kind?: WorkingDocumentKind; content: string },
  ThunkConfig
>(
  "instanceWorkingDocument/persistContent",
  async (
    { conversationId, kind = DEFAULT_DOC_KIND, content },
    { dispatch, getState },
  ) => {
    dispatch(setWorkingDocContent({ conversationId, kind, content }));
    const binding = selectWorkingDocBinding(conversationId, kind)(getState());

    if (binding.kind === "note" && binding.id) {
      try {
        await dispatch(
          saveNoteField({
            noteId: binding.id,
            field: "content",
            value: content,
          }),
        ).unwrap();
      } catch (err) {
        dispatch(
          markWorkingDocError({
            conversationId,
            kind,
            error: "Could not save to the bound note.",
          }),
        );
        throw err;
      }
      return;
    }

    if (binding.kind === "cx_working_document" && binding.id) {
      const materialized = selectWorkingDocMaterialized(
        conversationId,
        kind,
      )(getState());
      try {
        if (materialized) {
          await updateCxWorkingDocumentContent(binding.id, content);
        } else {
          await dispatch(
            materializeWorkingDocumentThunk({ conversationId, kind }),
          ).unwrap();
        }
      } catch (err) {
        dispatch(
          markWorkingDocError({
            conversationId,
            kind,
            error: "Could not save the document.",
          }),
        );
        throw err;
      }
    }
  },
);

// =============================================================================
// Cross-conversation linking — attach an EXISTING document
// =============================================================================

/**
 * Point this conversation's (kind) document at an EXISTING document and adopt its
 * content. Both conversations now share the same document (M2M); edits round-trip
 * to every linked conversation.
 */
export const linkConversationDocumentThunk = createAsyncThunk<
  void,
  { conversationId: string; kind?: WorkingDocumentKind; documentId: string },
  ThunkConfig
>(
  "instanceWorkingDocument/link",
  async (
    { conversationId, kind = DEFAULT_DOC_KIND, documentId },
    { dispatch, getState },
  ) => {
    try {
      const doc = await getCxWorkingDocumentById(documentId);
      if (!doc) {
        dispatch(
          markWorkingDocError({
            conversationId,
            kind,
            error: "Could not load the selected document.",
          }),
        );
        return;
      }
      const orgId = resolveOrgId(getState(), conversationId);
      if (orgId) {
        await linkDocumentToConversation({
          documentId,
          conversationId,
          organizationId: orgId,
          kind,
          enabled: true,
        });
      }
      dispatch(setWorkingDocEnabled({ conversationId, kind, enabled: true }));
      dispatch(
        setWorkingDocBinding({
          conversationId,
          kind,
          binding: {
            kind: "cx_working_document",
            id: doc.id,
            label: doc.title,
          },
        }),
      );
      dispatch(
        markWorkingDocMaterialized({
          conversationId,
          kind,
          version: doc.version,
        }),
      );
      dispatch(
        setWorkingDocTitle({ conversationId, kind, title: doc.title ?? "" }),
      );
      dispatch(
        applyAgentWorkingDocContent({
          conversationId,
          kind,
          content: doc.content ?? "",
        }),
      );
    } catch (err) {
      console.error("[working-document] link failed", {
        conversationId,
        kind,
        documentId,
        err,
      });
      dispatch(
        markWorkingDocError({
          conversationId,
          kind,
          error: "Could not link the selected document.",
        }),
      );
    }
  },
);

// =============================================================================
// Note binding (working kind)
// =============================================================================

/**
 * Bind the conversation's working document to an existing note and seed the
 * document content from that note. Enables the document.
 */
export const bindWorkingDocumentToNoteThunk = createAsyncThunk<
  void,
  {
    conversationId: string;
    kind?: WorkingDocumentKind;
    noteId: string;
    mode?: BindNoteMode;
  },
  ThunkConfig
>(
  "instanceWorkingDocument/bindToNote",
  async (
    { conversationId, kind = DEFAULT_DOC_KIND, noteId, mode = "replace" },
    { dispatch, getState },
  ) => {
    try {
      const note = await NotesAPI.getById(noteId);
      if (!note) {
        dispatch(
          markWorkingDocError({
            conversationId,
            kind,
            error: "Could not load the selected note.",
          }),
        );
        return;
      }

      const noteContent = note.content ?? "";
      let nextContent = noteContent;
      if (mode === "append") {
        const current = selectWorkingDocContent(
          conversationId,
          kind,
        )(getState());
        if (current.trim()) {
          nextContent = noteContent.trim()
            ? `${noteContent}\n\n${current}`
            : current;
        }
      }

      dispatch(
        setWorkingDocBinding({
          conversationId,
          kind,
          binding: { kind: "note", id: note.id, label: note.label ?? null },
        }),
      );
      if (note.label) {
        dispatch(
          setWorkingDocTitle({ conversationId, kind, title: note.label }),
        );
      }
      dispatch(
        setWorkingDocContent({ conversationId, kind, content: nextContent }),
      );
      dispatch(setWorkingDocEnabled({ conversationId, kind, enabled: true }));

      if (mode === "append" && nextContent !== noteContent) {
        void dispatch(
          saveNoteField({ noteId, field: "content", value: nextContent }),
        );
      }
    } catch {
      dispatch(
        markWorkingDocError({
          conversationId,
          kind,
          error: "Could not load the selected note.",
        }),
      );
    }
  },
);

/**
 * Unbind the working document from a note and revert to a fresh conversation
 * working document (a new reserved id; materialized on next edit). The note keeps
 * its own content.
 */
export const unbindWorkingDocumentThunk = createAsyncThunk<
  void,
  { conversationId: string; kind?: WorkingDocumentKind },
  ThunkConfig
>(
  "instanceWorkingDocument/unbind",
  async ({ conversationId, kind = DEFAULT_DOC_KIND }, { dispatch }) => {
    dispatch(
      setWorkingDocBinding({
        conversationId,
        kind,
        binding: { ...NO_BINDING },
      }),
    );
    // Revert to the conversation's own (deterministic) working document; the row
    // is created on next edit (or already exists — same id either way).
    dispatch(setWorkingDocContent({ conversationId, kind, content: "" }));
    dispatch(setWorkingDocTitle({ conversationId, kind, title: "" }));
    dispatch(
      setWorkingDocBinding({
        conversationId,
        kind,
        binding: {
          kind: "cx_working_document",
          id: reservedWorkingDocumentId(conversationId, kind),
          label: null,
        },
      }),
    );
  },
);

// =============================================================================
// Agent writeback resync
// =============================================================================

/**
 * Reflect an agent writeback for the working document. Called from the stream
 * processor on a `context_changed` / `context_persisted` event. The event carries
 * no content, so we re-read the bound durable source by its OWN id (so linked
 * conversations resolve) and apply it, latching the new version.
 *
 * LOUD when unbound: with the materialize-on-write model an agent edit ALWAYS has
 * a durable home, so a working_document writeback with no binding is a real
 * defect (an edit we cannot reflect) — we scream rather than silently drop it.
 */
export const syncWorkingDocumentFromAgentThunk = createAsyncThunk<
  void,
  { conversationId: string; kind?: WorkingDocumentKind },
  ThunkConfig
>(
  "instanceWorkingDocument/syncFromAgent",
  async (
    { conversationId, kind = DEFAULT_DOC_KIND },
    { dispatch, getState },
  ) => {
    const binding = selectWorkingDocBinding(conversationId, kind)(getState());

    if (binding.kind === "cx_working_document" && binding.id) {
      try {
        const doc = await getCxWorkingDocumentById(binding.id);
        if (doc) {
          dispatch(
            applyAgentWorkingDocContent({
              conversationId,
              kind,
              content: doc.content ?? "",
            }),
          );
          dispatch(
            markWorkingDocMaterialized({
              conversationId,
              kind,
              version: doc.version,
            }),
          );
        }
      } catch (err) {
        console.error(
          "[working-document] failed to resync row after agent writeback",
          { conversationId, kind, docId: binding.id, err },
        );
      }
      return;
    }

    if (binding.kind === "note" && binding.id) {
      try {
        const note = await dispatch(refreshNoteContent(binding.id)).unwrap();
        if (note) {
          dispatch(
            applyAgentWorkingDocContent({
              conversationId,
              kind,
              content: note.content ?? "",
            }),
          );
        }
      } catch (err) {
        console.error(
          "[working-document] failed to resync bound note after agent writeback",
          { conversationId, kind, noteId: binding.id, err },
        );
      }
      return;
    }

    console.error(
      "[working-document] RECOVERY: agent writeback for an UNBOUND working " +
        "document — the edit has no durable home and cannot be reflected. This " +
        "must never happen under materialize-on-write; investigate.",
      { conversationId, kind },
    );
  },
);

/**
 * Reflect the AGENT's first write to a working document — the materialize-on-
 * write transition reported by a `context_persisted` event with `materialized`.
 * The server created the durable ROW (at the reserved id) but not the
 * conversation EDGE, so we create the edge here, adopt the id as the binding,
 * mark it enabled + materialized, and re-read the content. Only the working
 * kind is agent-writable, so this is always `kind = "working"`.
 */
export const reflectAgentMaterializedThunk = createAsyncThunk<
  void,
  { conversationId: string; documentId: string },
  ThunkConfig
>(
  "instanceWorkingDocument/reflectAgentMaterialized",
  async ({ conversationId, documentId }, { dispatch, getState }) => {
    const kind: WorkingDocumentKind = "working";
    dispatch(
      setWorkingDocBinding({
        conversationId,
        kind,
        binding: { kind: "cx_working_document", id: documentId, label: null },
      }),
    );
    dispatch(setWorkingDocEnabled({ conversationId, kind, enabled: true }));
    const orgId = resolveOrgId(getState(), conversationId);
    if (orgId) {
      try {
        await linkDocumentToConversation({
          documentId,
          conversationId,
          organizationId: orgId,
          kind,
          enabled: true,
        });
      } catch (err) {
        console.error(
          "[working-document] reflectAgentMaterialized: link failed",
          { conversationId, documentId, err },
        );
      }
    }
    await dispatch(syncWorkingDocumentFromAgentThunk({ conversationId, kind }));
  },
);

// =============================================================================
// Multi-attach — link MULTIPLE documents from other chats into one workspace
// =============================================================================
//
// M2M: a conversation can have many `working_document` → `conversation` edges.
// The DocumentsWorkspace shows the conversation's own working + scratch PLUS one
// tab per attached document. An attached doc is keyed in the slice by its ORIGIN
// (conversationId, kind) — a doc born in another chat is never hydrated by the
// active-conversation bridge, so we load its content on open. Attaches persist
// as association edges and are restored on mount.

/** One attached-document tab: its ORIGIN (conversationId, kind) + id + title. */
export interface WorkspaceDocTab {
  conversationId: string;
  kind: WorkingDocumentKind;
  documentId: string;
  title: string;
}

/**
 * Open a document (by id) in the workspace: load its content into its ORIGIN
 * (conversationId, kind) slice entry so the tab renders it, and — when `attachTo`
 * is given — persist a `working_document → conversation` edge so it survives a
 * reload. Returns the tab descriptor (null if the doc vanished or has no origin).
 *
 * `skipOrigin`: bail (no slice writes) when the doc's origin IS that
 * conversation — its own docs are hydrated by the conversation bridge, and
 * re-applying DB content here could stomp a fresh local draft.
 */
export const openWorkspaceDocumentThunk = createAsyncThunk<
  WorkspaceDocTab | null,
  { documentId: string; attachTo?: string; skipOrigin?: string },
  ThunkConfig
>(
  "instanceWorkingDocument/openWorkspaceDoc",
  async ({ documentId, attachTo, skipOrigin }, { dispatch, getState }) => {
    let doc;
    try {
      doc = await getCxWorkingDocumentById(documentId);
    } catch (err) {
      console.error("[working-document] openWorkspaceDoc: load failed", {
        documentId,
        err,
      });
      return null;
    }
    if (!doc || !doc.conversationId) return null;
    if (skipOrigin && doc.conversationId === skipOrigin) return null;

    if (attachTo) {
      const orgId = resolveOrgId(getState(), attachTo);
      if (orgId) {
        try {
          await linkDocumentToConversation({
            documentId,
            conversationId: attachTo,
            organizationId: orgId,
            kind: doc.kind,
            enabled: true,
          });
        } catch (err) {
          console.error("[working-document] attach: link failed", {
            attachTo,
            documentId,
            err,
          });
        }
      }
    }

    const originConv = doc.conversationId;
    const kind = doc.kind;
    dispatch(setWorkingDocEnabled({ conversationId: originConv, kind, enabled: true }));
    dispatch(
      setWorkingDocBinding({
        conversationId: originConv,
        kind,
        binding: { kind: "cx_working_document", id: doc.id, label: doc.title },
      }),
    );
    dispatch(
      markWorkingDocMaterialized({ conversationId: originConv, kind, version: doc.version }),
    );
    if (doc.title) {
      dispatch(setWorkingDocTitle({ conversationId: originConv, kind, title: doc.title }));
    }
    dispatch(
      applyAgentWorkingDocContent({
        conversationId: originConv,
        kind,
        content: doc.content ?? "",
      }),
    );
    return { conversationId: originConv, kind, documentId: doc.id, title: doc.title };
  },
);

/** Detach a document from a conversation (removes the edge; keeps the doc). */
export const detachWorkspaceDocumentThunk = createAsyncThunk<
  void,
  { conversationId: string; documentId: string },
  ThunkConfig
>(
  "instanceWorkingDocument/detachWorkspaceDoc",
  async ({ conversationId, documentId }) => {
    try {
      await unlinkDocumentFromConversation(documentId, conversationId);
    } catch (err) {
      console.error("[working-document] detach failed", {
        conversationId,
        documentId,
        err,
      });
    }
  },
);

/**
 * Restore the conversation's ATTACHED documents (from its association edges) as
 * workspace tabs on mount, loading each one's content. Excludes the
 * conversation's OWN primary docs (already base tabs — origin === this
 * conversation). Returns the attached-doc tab descriptors.
 */
export const listAttachedDocumentTabsThunk = createAsyncThunk<
  WorkspaceDocTab[],
  { conversationId: string },
  ThunkConfig
>(
  "instanceWorkingDocument/listAttachedTabs",
  async ({ conversationId }, { dispatch, getState }) => {
    let links;
    try {
      links = await listConversationDocuments(conversationId);
    } catch (err) {
      console.error("[working-document] listAttachedTabs failed", {
        conversationId,
        err,
      });
      return [];
    }
    // A linked doc the hydrate path already ADOPTED as this conversation's
    // primary (kind slot) is the base tab — an attached tab for it would show
    // the same document twice.
    const state = getState();
    const boundIds = new Set(
      DOC_KINDS.map(
        (k) => selectWorkingDocBinding(conversationId, k)(state),
      )
        .filter((b) => b.kind === "cx_working_document" && b.id)
        .map((b) => b.id),
    );
    const tabs: WorkspaceDocTab[] = [];
    for (const link of links) {
      if (boundIds.has(link.documentId)) continue;
      // skipOrigin: the conversation's own primary docs (born here) are already
      // base tabs AND bridge-hydrated — loading them again could stomp a draft.
      const tab = await dispatch(
        openWorkspaceDocumentThunk({
          documentId: link.documentId,
          skipOrigin: conversationId,
        }),
      ).unwrap();
      if (tab && tab.conversationId !== conversationId) tabs.push(tab);
    }
    return tabs;
  },
);
