"use client";

/**
 * useWorkingDocument(conversationId, kind?)
 *
 * The single entry point for the reusable per-conversation documents. Two kinds
 * share this hook:
 *   - "working" (default) — the collaborative doc the agent reads AND writes.
 *   - "scratch"           — the user's private scratchpad; the agent reads it
 *                           (read-only context value) but never writes it.
 *
 * Owns:
 *   • local editable draft + debounced commit to the slice (the canonical
 *     content shared by every mount of the same conversation+kind).
 *   • debounced push of the rich context entry into the `instanceContext` slice
 *     when enabled (and removal when disabled) — working publishes the mutable
 *     `working_document` value; scratch publishes the read-only `user_scratchpad`
 *     value.
 *   • debounced persistence to the durable source (cx document, or a bound note
 *     for the working kind) on user edits.
 *   • merge-in of agent/remote edits while the user isn't actively typing.
 *
 * Controls: setEnabled (persisted), bindToNote, unbind, linkToDocument, setTitle,
 * openInCanvas.
 *
 * `useWorkingDocumentContextSync` is the effect-only half (no draft); mount it
 * wherever a conversation is always present (the Smart Input) so the agent
 * always receives the current document regardless of which editor is open.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { supabase } from "@/utils/supabase/client";
import { saveNoteField } from "@/features/notes/redux/thunks";
import { useAutoLabel } from "@/features/notes/hooks/useAutoLabel";
import { useAccess } from "@/utils/permissions/access";
import {
  USER_SCRATCHPAD_CONTEXT_KEY,
  USER_SCRATCHPAD_LABEL,
  WORKING_DOCUMENT_CONTEXT_KEY,
  WORKING_DOCUMENT_LABEL,
  buildUserScratchpadContextValue,
  buildWorkingDocumentContextValue,
  scratchpadExtraContextKey,
} from "@/features/agents/utils/workingDocumentContext";
import {
  removeContextEntry,
  setContextEntries,
} from "@/features/agents/redux/execution-system/instance-context/instance-context.slice";
import {
  applyAgentWorkingDocContent,
  DEFAULT_DOC_KIND,
  isScratchScope,
  scratchScopeId,
  workingDocKey,
  markWorkingDocError,
  clearWorkingDocConflict,
  markWorkingDocConflict,
  markWorkingDocMaterialized,
  markWorkingDocSaving,
  setWorkingDocContent,
  setWorkingDocTitle,
  setWorkingDocVersion,
  type WorkingDocumentBinding,
  type WorkingDocumentKind,
} from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.slice";
import {
  selectActiveScratchpadId,
  selectAttachedScratchpadIds,
  selectWorkingDocBinding,
  selectWorkingDocConflict,
  selectWorkingDocContent,
  selectWorkingDocEnabled,
  selectWorkingDocError,
  selectWorkingDocMaterialized,
  selectWorkingDocSaving,
  selectWorkingDocTitle,
  selectWorkingDocVersion,
} from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.selectors";
import {
  bindWorkingDocumentToNoteThunk,
  hydrateConversationDocumentsThunk,
  linkConversationDocumentThunk,
  materializeWorkingDocumentThunk,
  setConversationDocumentEnabledThunk,
  unbindWorkingDocumentThunk,
  type BindNoteMode,
} from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.thunks";
import {
  hydrateActiveScratchpadThunk,
  hydrateAttachedScratchpadsThunk,
} from "@/features/agents/redux/execution-system/instance-working-document/scratchpad.thunks";
import {
  commitWorkingDocumentContent,
  updateCxWorkingDocumentTitle,
  type CxWorkingDocumentRow,
} from "@/features/agents/redux/execution-system/instance-working-document/cx-working-document.service";
import { selectIsCacheOnly } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import { useCanvas } from "@/features/canvas/hooks/useCanvas";

const AUTOSAVE_MS = 700;

// ─── Shared realtime subscription manager ───────────────────────────────────
// useWorkingDocumentContextSync mounts in several places at once (the always-on
// SmartInput bridge + every open editor). Without dedup, each mount opens its
// own Supabase channel for the SAME document — N connections + N dispatches per
// server edit. This ref-counts ONE channel per documentId and fans out to one
// listener per (conversation, kind), so the round-trip is exactly once.
type WdChannelEntry = {
  channel: ReturnType<typeof supabase.channel>;
  listeners: Map<string, (row: CxWorkingDocumentRow) => void>;
};
const wdChannels = new Map<string, WdChannelEntry>();

function subscribeWorkingDocRow(
  documentId: string,
  listenerKey: string,
  onRow: (row: CxWorkingDocumentRow) => void,
): () => void {
  let entry = wdChannels.get(documentId);
  if (!entry) {
    const listeners = new Map<string, (row: CxWorkingDocumentRow) => void>();
    const channel = supabase
      .channel(`cx-working-doc:${documentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "workbench",
          table: "working_documents",
          filter: `id=eq.${documentId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") return;
          const row = payload.new as CxWorkingDocumentRow | undefined;
          if (!row) return;
          listeners.forEach((fn) => fn(row));
        },
      )
      .subscribe();
    entry = { channel, listeners };
    wdChannels.set(documentId, entry);
  }
  entry.listeners.set(listenerKey, onRow);
  return () => {
    const e = wdChannels.get(documentId);
    if (!e) return;
    e.listeners.delete(listenerKey);
    if (e.listeners.size === 0) {
      void supabase.removeChannel(e.channel);
      wdChannels.delete(documentId);
    }
  };
}

// =============================================================================
// Context sync (effect-only) — keeps the document's instanceContext entry
// current for an active conversation. Scratch publication is the SEPARATE
// `useScratchpadContextSync` (scratchpads are user-global; this hook's scratch
// mounts run only the materialize + realtime effects at their sp:<id> scope).
// =============================================================================

export function useWorkingDocumentContextSync(
  conversationId: string,
  kind: WorkingDocumentKind = DEFAULT_DOC_KIND,
): void {
  const dispatch = useAppDispatch();
  // Per-MOUNT realtime listener key — this hook mounts several times for the
  // same (conversation, kind) (the always-on bridge + each open editor), so the
  // listener key must be unique per mount or one mount's cleanup would tear down
  // another's listener. The CHANNEL is still shared (keyed by document id); only
  // the listener fan-out is per mount (idempotent dispatches).
  const mountId = useId();
  const enabled = useAppSelector(selectWorkingDocEnabled(conversationId, kind));
  const content = useAppSelector(selectWorkingDocContent(conversationId, kind));
  const binding = useAppSelector(selectWorkingDocBinding(conversationId, kind));
  const title = useAppSelector(selectWorkingDocTitle(conversationId, kind));
  const version = useAppSelector(selectWorkingDocVersion(conversationId, kind));
  const materialized = useAppSelector(
    selectWorkingDocMaterialized(conversationId, kind),
  );
  const organizationId = useAppSelector(
    (state) =>
      state.conversations.byConversationId[conversationId]?.organizationId ??
      null,
  );
  // `cacheOnly` is true until the server confirms the cx_conversation row
  // exists. A user-global scratchpad (sp:<docId> scope) has no conversation —
  // never gated.
  const isCacheOnlyRaw = useAppSelector(selectIsCacheOnly(conversationId));
  const isCacheOnly = isScratchScope(conversationId) ? false : isCacheOnlyRaw;

  // MATERIALIZE-ON-WRITE: create the durable row + conversation edge the moment
  // content FIRST exists — never on mere activation (that produced the empty-row
  // churn). Idempotent + gated (no-op once materialized, while empty, or while
  // the conversation is unconfirmed); re-fires harmlessly as content grows. The
  // agent-first case is handled server-side and reflected via the stream.
  useEffect(() => {
    if (
      enabled &&
      binding.kind === "cx_working_document" &&
      binding.id &&
      !materialized &&
      content.trim() !== "" &&
      !isCacheOnly
    ) {
      void dispatch(materializeWorkingDocumentThunk({ conversationId, kind }));
    }
  }, [
    dispatch,
    conversationId,
    kind,
    enabled,
    binding.kind,
    binding.id,
    materialized,
    content,
    isCacheOnly,
  ]);

  // Live channel: edits to the bound document (the agent's ctx_patch writes for
  // the working kind, or edits from another conversation linked to the same
  // doc) arrive here as UPDATEs. We filter by the DOCUMENT id (binding.id), not
  // conversation_id, so linked conversations resolve correctly.
  useEffect(() => {
    if (!enabled || binding.kind !== "cx_working_document" || !binding.id) {
      return undefined;
    }
    // Shared, ref-counted channel (see subscribeWorkingDocRow) — one connection
    // per document, one dispatch per (conversation, kind), regardless of how many
    // editors/bridges are mounted. Filtered by DOCUMENT id (not conversation) so
    // conversations linked to the same doc all resolve.
    return subscribeWorkingDocRow(
      binding.id,
      `${conversationId}:${kind}:${mountId}`,
      (row) => {
        // Title-only UPDATEs (rename in the rail, auto-title, etc.) emit partial
        // realtime payloads when REPLICA IDENTITY is DEFAULT — `content` is
        // omitted, not empty. Never treat a missing column as a blank document.
        if (typeof row.content === "string") {
          dispatch(
            applyAgentWorkingDocContent({
              conversationId,
              kind,
              content: row.content,
            }),
          );
        }
        if (typeof row.title === "string") {
          dispatch(
            setWorkingDocTitle({
              conversationId,
              kind,
              title: row.title,
            }),
          );
        }
        // A realtime echo proves the row exists — latch version + materialized so
        // the next turn's base_version is current.
        dispatch(
          markWorkingDocMaterialized({
            conversationId,
            kind,
            version: typeof row.version === "number" ? row.version : undefined,
          }),
        );
      },
    );
  }, [
    dispatch,
    conversationId,
    kind,
    enabled,
    binding.kind,
    binding.id,
    mountId,
  ]);

  useEffect(() => {
    // Scratch mounts never publish from here: the scratchpad's read-only
    // context entry is owned by `useScratchpadContextSync` per conversation
    // (an sp:<docId> scope isn't a conversation to publish into).
    if (kind === "scratch") return;

    const key = WORKING_DOCUMENT_CONTEXT_KEY;
    const label = WORKING_DOCUMENT_LABEL;
    const value = buildWorkingDocumentContextValue({
      content,
      binding,
      conversationId,
      organizationId,
      docKind: kind,
      title,
      version,
    });

    if (!enabled) {
      dispatch(removeContextEntry({ conversationId, key }));
      return;
    }

    // Publish IMMEDIATELY (no debounce). The slice content updates on every
    // keystroke (onChange), and the agent must receive the user's EXACT latest
    // text on the next turn — a debounce here would drop the final keystrokes
    // typed just before send (the request reads the published instanceContext
    // entry, not the slice). The publish is a cheap Redux write.
    dispatch(
      setContextEntries({
        conversationId,
        entries: [{ key, value, type: "text", label }],
      }),
    );
  }, [
    dispatch,
    conversationId,
    kind,
    enabled,
    content,
    binding,
    organizationId,
    title,
    version,
  ]);
}

// A never-matching scope so hooks stay unconditional while no scratchpad
// exists yet (its slice entry is absent → every effect no-ops).
const SCRATCH_SYNC_SENTINEL = "sp:none";

/**
 * useScratchpadContextSync — publishes the user's GLOBAL scratchpads into ONE
 * conversation's agent context:
 *
 *   • the ACTIVE scratchpad → `user_scratchpad` (read-only) — ONLY when this
 *     conversation has opted in (per-conversation gate, default OFF) and the
 *     content is non-empty. NEVER forced onto unrelated chats.
 *   • each ATTACHED scratchpad → `user_scratchpad_<id8>` extras — attaching is
 *     itself the per-conversation opt-in, so only the empty rule applies.
 *
 * Also keeps the active scratchpad's realtime + materialize effects mounted
 * (via the shared sync hook at its sp:<id> scope), so cross-tab edits arrive
 * even when no editor is open.
 */
export function useScratchpadContextSync(conversationId: string): void {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const activeId = useAppSelector(selectActiveScratchpadId);
  const activeScope = activeId
    ? scratchScopeId(activeId)
    : SCRATCH_SYNC_SENTINEL;

  // Realtime + materialize for the active scratchpad, app-wide.
  useWorkingDocumentContextSync(activeScope, "scratch");

  const content = useAppSelector(
    selectWorkingDocContent(activeScope, "scratch"),
  );
  const title = useAppSelector(selectWorkingDocTitle(activeScope, "scratch"));
  // Per-conversation opt-in gate (default OFF) — the `enabled` flag at the
  // conversation's own (conversationId, "scratch") slot, persisted on the
  // deterministic gate edge by setConversationDocumentEnabledThunk.
  const scratchEnabled = useAppSelector(
    selectWorkingDocEnabled(conversationId, "scratch"),
  );

  // Active scratchpad → `user_scratchpad`. Published ONLY when the conversation
  // opted in AND there is content (empty is not sent); otherwise any prior
  // entry is removed.
  useEffect(() => {
    if (!scratchEnabled || !activeId || content.trim() === "") {
      dispatch(
        removeContextEntry({
          conversationId,
          key: USER_SCRATCHPAD_CONTEXT_KEY,
        }),
      );
      return;
    }
    dispatch(
      setContextEntries({
        conversationId,
        entries: [
          {
            key: USER_SCRATCHPAD_CONTEXT_KEY,
            value: buildUserScratchpadContextValue(content, title),
            type: "text",
            label: title?.trim() || USER_SCRATCHPAD_LABEL,
          },
        ],
      }),
    );
  }, [dispatch, conversationId, scratchEnabled, activeId, content, title]);

  // Attached extras. The snapshot string re-runs the effect whenever any
  // attached scratchpad's title/content changes without allocating fresh
  // arrays per render.
  const attachedIds = useAppSelector(
    selectAttachedScratchpadIds(conversationId),
  );
  const attachedSnapshot = useAppSelector((state) =>
    attachedIds
      .map((id) => {
        const e =
          state.instanceWorkingDocument.byKey[
            workingDocKey(scratchScopeId(id), "scratch")
          ];
        return `${id} ${e?.title ?? ""} ${e?.content ?? ""}`;
      })
      .join(""),
  );
  const prevExtraKeysRef = useRef<string[]>([]);
  useEffect(() => {
    const state = store.getState();
    const entries: {
      key: string;
      value: ReturnType<typeof buildUserScratchpadContextValue>;
      type: "text";
      label: string;
    }[] = [];
    const liveKeys: string[] = [];
    for (const id of attachedIds) {
      const e =
        state.instanceWorkingDocument.byKey[
          workingDocKey(scratchScopeId(id), "scratch")
        ];
      const c = e?.content ?? "";
      if (c.trim() === "") continue; // empty is not sent
      const key = scratchpadExtraContextKey(id);
      liveKeys.push(key);
      entries.push({
        key,
        value: buildUserScratchpadContextValue(c, e?.title),
        type: "text",
        label: e?.title?.trim() || USER_SCRATCHPAD_LABEL,
      });
    }
    for (const stale of prevExtraKeysRef.current) {
      if (!liveKeys.includes(stale)) {
        dispatch(removeContextEntry({ conversationId, key: stale }));
      }
    }
    prevExtraKeysRef.current = liveKeys;
    if (entries.length) {
      dispatch(setContextEntries({ conversationId, entries }));
    }
  }, [dispatch, store, conversationId, attachedIds, attachedSnapshot]);
}

/**
 * Always-on per-conversation bridge: restore the conversation's persisted
 * WORKING document + attached scratchpads, resolve the user's global ACTIVE
 * scratchpad, then keep the conversation's document context entries current.
 * Mount this once where a conversation is always present (the Smart Input), so
 * the agent receives the current documents regardless of which editor (if any)
 * is open.
 */
export function useConversationDocumentsBridge(conversationId: string): void {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);
  useEffect(() => {
    if (!userId) return;
    void dispatch(hydrateConversationDocumentsThunk({ conversationId }));
    // Attached-scratchpad hydration must run AFTER the active pointer resolves
    // (it excludes the active id from the attached list).
    void dispatch(hydrateActiveScratchpadThunk())
      .then(() =>
        dispatch(hydrateAttachedScratchpadsThunk({ conversationId })),
      )
      .catch((err: unknown) => {
        console.error("[scratchpad] bridge hydrate failed", err);
      });
  }, [dispatch, conversationId, userId]);
  useWorkingDocumentContextSync(conversationId, "working");
  useScratchpadContextSync(conversationId);
}

// =============================================================================
// Full hook — draft + controls
// =============================================================================

export interface UseWorkingDocumentResult {
  kind: WorkingDocumentKind;
  enabled: boolean;
  /** Canonical content (slice). Use `draft` for the editor binding. */
  content: string;
  title: string;
  binding: WorkingDocumentBinding;
  saving: boolean;
  error: string | null;
  /** A pending concurrent-edit conflict to reconcile (the agent's version), or null. */
  conflict: { agentVersion: number; agentContent: string } | null;
  /** Resolve a conflict: keep the user's draft, or adopt the agent's version. */
  resolveConflict: (choice: "keep-mine" | "take-agent") => void;
  /** Local editor value (merges remote edits when not typing). */
  draft: string;
  onChange: (value: string) => void;
  flush: () => void;
  setEnabled: (enabled: boolean) => void;
  bindToNote: (noteId: string, mode?: BindNoteMode) => void;
  unbind: () => void;
  /** Link this conversation's document to an existing one (cross-conversation). */
  linkToDocument: (documentId: string) => void;
  setTitle: (title: string) => void;
  /** Open this document as an item in the Canvas (the unified live workspace). */
  openInCanvas: () => void;
  /**
   * True when the current user has only VIEW access to the bound document (a
   * viewer-level sharee). This hook is the single write authority, and every
   * durable write path in it (autosave commit, keep-mine, title persistence,
   * auto-label) no-ops under viewOnly — an RLS-refused UPDATE touches 0 rows
   * silently and would otherwise surface as a bogus, unresolvable
   * "concurrent edit" conflict loop. UIs use this to render read-only chrome.
   */
  viewOnly: boolean;
}

export function useWorkingDocument(
  conversationId: string,
  kind: WorkingDocumentKind = DEFAULT_DOC_KIND,
): UseWorkingDocumentResult {
  const dispatch = useAppDispatch();
  const canvas = useCanvas();

  const enabled = useAppSelector(selectWorkingDocEnabled(conversationId, kind));
  const content = useAppSelector(selectWorkingDocContent(conversationId, kind));
  const title = useAppSelector(selectWorkingDocTitle(conversationId, kind));
  const binding = useAppSelector(selectWorkingDocBinding(conversationId, kind));
  const saving = useAppSelector(selectWorkingDocSaving(conversationId, kind));
  const error = useAppSelector(selectWorkingDocError(conversationId, kind));
  const materialized = useAppSelector(
    selectWorkingDocMaterialized(conversationId, kind),
  );
  const version = useAppSelector(selectWorkingDocVersion(conversationId, kind));
  const conflict = useAppSelector(
    selectWorkingDocConflict(conversationId, kind),
  );
  // Latched in refs so the debounced commit reads the LATEST values at fire time
  // (not those captured when the callback was created).
  const versionRef = useRef(version);
  versionRef.current = version;
  const conflictRef = useRef(conflict);
  conflictRef.current = conflict;

  // ── View-vs-edit gate — THE write choke point. Resolved here (not in each
  // UI) so every durable write this hook owns is gated in one place: the
  // debounced commit, keep-mine, title persistence, and auto-label. Scratch
  // docs are personal (never shared); unmaterialized reserved ids resolve
  // `exists:false` and stay writable.
  const docAccess = useAccess(
    kind === "working" &&
      binding.kind === "cx_working_document" &&
      binding.id &&
      materialized
      ? "working_document"
      : undefined,
    kind === "working" &&
      binding.kind === "cx_working_document" &&
      binding.id &&
      materialized
      ? binding.id
      : undefined,
  );
  const viewOnly =
    !docAccess.loading &&
    docAccess.exists &&
    docAccess.level === "view" &&
    !docAccess.isOwner;
  const viewOnlyRef = useRef(viewOnly);
  viewOnlyRef.current = viewOnly;

  // Keep the instanceContext entry current for every mount of this hook (the
  // dedicated SmartInput bridge guarantees the always-on case).
  useWorkingDocumentContextSync(conversationId, kind);

  // ── Editable draft (mirrors useWorkingDocumentDraft) ──────────────────────
  const [draft, setDraft] = useState(content);
  const dirtyRef = useRef(false);
  const editingRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // Pull in agent/remote edits only when the user isn't actively typing.
  useEffect(() => {
    if (!editingRef.current) setDraft(content);
  }, [content]);

  const commit = useCallback(
    (value: string) => {
      if (!dirtyRef.current) return;
      // View-only sharee: the UPDATE would be RLS-refused (0 rows) and
      // masquerade as an eternal fake conflict. Drop the durable write; the
      // draft stays local-session-only, and the UI says "View only".
      if (viewOnlyRef.current) {
        dirtyRef.current = false;
        return;
      }
      // Don't auto-save over an unresolved conflict — the user must reconcile
      // first (their draft is preserved meanwhile).
      if (conflictRef.current) return;
      dirtyRef.current = false;
      // The slice content is already current (onChange writes it on every
      // keystroke so the agent always sees the latest); here we persist to the
      // durable source.
      const done = () =>
        dispatch(markWorkingDocSaving({ conversationId, kind, saving: false }));

      if (binding.kind === "cx_working_document" && binding.id) {
        const docId = binding.id;
        dispatch(markWorkingDocSaving({ conversationId, kind, saving: true }));
        const fail = () =>
          dispatch(
            markWorkingDocError({
              conversationId,
              kind,
              error: "Could not save the document.",
            }),
          );
        if (materialized) {
          // OPTIMISTIC-CONCURRENCY write: refused if a concurrent edit (the agent
          // this turn) advanced the row. On conflict we DON'T clobber — we record
          // the agent's version for the user to diff + reconcile, keeping their
          // draft intact. Nothing is lost (both versions are in history).
          void commitWorkingDocumentContent(docId, value, versionRef.current)
            .then((res) => {
              if (res.status === "saved") {
                dispatch(
                  setWorkingDocVersion({
                    conversationId,
                    kind,
                    version: res.document.version,
                  }),
                );
                done();
              } else {
                dispatch(
                  markWorkingDocConflict({
                    conversationId,
                    kind,
                    agentVersion: res.document.version,
                    agentContent: res.document.content,
                  }),
                );
                console.warn(
                  "[working-document] save refused — a concurrent edit advanced " +
                    "the document; surfaced a conflict for the user to reconcile",
                  { conversationId, kind },
                );
              }
            })
            .catch(fail);
        } else {
          // First content → create the durable row + conversation edge, seeded
          // with the current content (materialize-on-write).
          void dispatch(
            materializeWorkingDocumentThunk({ conversationId, kind }),
          )
            .unwrap()
            .then(done)
            .catch(fail);
        }
        return;
      }

      if (binding.kind === "note" && binding.id) {
        const noteId = binding.id;
        dispatch(markWorkingDocSaving({ conversationId, kind, saving: true }));
        void dispatch(saveNoteField({ noteId, field: "content", value }))
          .unwrap()
          .then(done)
          .catch(() =>
            dispatch(
              markWorkingDocError({
                conversationId,
                kind,
                error: "Could not save to the bound note.",
              }),
            ),
          );
      }
    },
    [dispatch, conversationId, kind, binding.kind, binding.id, materialized],
  );

  const onChange = useCallback(
    (value: string) => {
      editingRef.current = true;
      dirtyRef.current = true;
      setDraft(value);
      // Keep the canonical slice content current on EVERY keystroke so the
      // agent receives the user's exact latest text on the next turn (the
      // durable DB write stays debounced via commit below).
      dispatch(setWorkingDocContent({ conversationId, kind, content: value }));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        editingRef.current = false;
        commit(value);
      }, AUTOSAVE_MS);
    },
    [dispatch, conversationId, kind, commit],
  );

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    editingRef.current = false;
    commit(draftRef.current);
  }, [commit]);

  // Persist any pending edit if the editor unmounts mid-debounce.
  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
        if (dirtyRef.current) {
          dispatch(
            setWorkingDocContent({
              conversationId,
              kind,
              content: draftRef.current,
            }),
          );
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Controls ──────────────────────────────────────────────────────────────
  const setEnabled = useCallback(
    (value: boolean) => {
      // Reserves the doc id on enable (no DB write) and persists the opt-out on
      // the platform.associations edge on disable, so it survives reloads.
      void dispatch(
        setConversationDocumentEnabledThunk({
          conversationId,
          kind,
          enabled: value,
        }),
      );
    },
    [dispatch, conversationId, kind],
  );

  const bindToNote = useCallback(
    (noteId: string, mode?: BindNoteMode) => {
      void dispatch(
        bindWorkingDocumentToNoteThunk({ conversationId, kind, noteId, mode }),
      );
    },
    [dispatch, conversationId, kind],
  );

  const unbind = useCallback(() => {
    void dispatch(unbindWorkingDocumentThunk({ conversationId, kind }));
  }, [dispatch, conversationId, kind]);

  const linkToDocument = useCallback(
    (documentId: string) => {
      void dispatch(
        linkConversationDocumentThunk({ conversationId, kind, documentId }),
      );
    },
    [dispatch, conversationId, kind],
  );

  const setTitle = useCallback(
    (value: string) => {
      // Trim so a cleared field never persists a blank name (the doc falls back
      // to its auto-derived name instead — see useAutoLabel below).
      const title = value.trim();
      dispatch(setWorkingDocTitle({ conversationId, kind, title }));
      // Persist to the durable row only once it exists; before materialize the
      // title lives in Redux and is carried up by materializeWorkingDocument.
      // View-only sharee: never persist (RLS-refused; incl. auto-label fires).
      if (viewOnlyRef.current) return;
      if (
        binding.kind === "cx_working_document" &&
        binding.id &&
        materialized
      ) {
        void updateCxWorkingDocumentTitle(binding.id, title).catch(() =>
          dispatch(
            markWorkingDocError({
              conversationId,
              kind,
              error: "Could not save the document name.",
            }),
          ),
        );
      } else if (binding.kind === "note" && binding.id) {
        void dispatch(
          saveNoteField({ noteId: binding.id, field: "label", value: title }),
        );
      }
    },
    [dispatch, conversationId, kind, binding.kind, binding.id, materialized],
  );

  // AUTO-NAMING: when the document is unnamed, derive a name from its content
  // (H1 / first non-empty line, markdown markers stripped — the same primitive
  // notes uses) once content meets a threshold. The user can always rename; a
  // manual name (non-empty title) stops auto-generation. Never forces the user
  // to name the document, and never leaves a blank name.
  useAutoLabel({
    content,
    currentLabel: title,
    onLabelChange: setTitle,
    // Auto-naming is a WRITE — never fire it on a view-only shared doc.
    enabled: enabled && !viewOnly,
    maxLength: 60,
  });

  // CONFLICT RESOLUTION: the user picks which version wins after a concurrent
  // edit. "take-agent" adopts the agent's version; "keep-mine" re-saves the
  // user's preserved draft over it (the agent's version stays in history).
  const resolveConflict = useCallback(
    (choice: "keep-mine" | "take-agent") => {
      const c = conflictRef.current;
      if (!c || binding.kind !== "cx_working_document" || !binding.id) {
        dispatch(clearWorkingDocConflict({ conversationId, kind }));
        return;
      }
      if (choice === "take-agent") {
        dispatch(
          applyAgentWorkingDocContent({
            conversationId,
            kind,
            content: c.agentContent,
          }),
        );
        dispatch(
          setWorkingDocVersion({
            conversationId,
            kind,
            version: c.agentVersion,
          }),
        );
        setDraft(c.agentContent);
        editingRef.current = false;
        dispatch(clearWorkingDocConflict({ conversationId, kind }));
        return;
      }
      // keep-mine: write the user's current draft, based on the agent's version
      // so it lands. If another edit raced in the meantime, re-surface.
      // View-only sharee: the write is RLS-doomed and would re-conflict
      // forever — clear the (bogus) conflict instead of looping.
      if (viewOnlyRef.current) {
        dispatch(clearWorkingDocConflict({ conversationId, kind }));
        return;
      }
      const docId = binding.id;
      const mine = draftRef.current;
      dispatch(markWorkingDocSaving({ conversationId, kind, saving: true }));
      void commitWorkingDocumentContent(docId, mine, c.agentVersion)
        .then((res) => {
          if (res.status === "saved") {
            dispatch(
              setWorkingDocContent({ conversationId, kind, content: mine }),
            );
            dispatch(
              setWorkingDocVersion({
                conversationId,
                kind,
                version: res.document.version,
              }),
            );
            dispatch(clearWorkingDocConflict({ conversationId, kind }));
            dispatch(
              markWorkingDocSaving({ conversationId, kind, saving: false }),
            );
          } else {
            dispatch(
              markWorkingDocConflict({
                conversationId,
                kind,
                agentVersion: res.document.version,
                agentContent: res.document.content,
              }),
            );
            dispatch(
              markWorkingDocSaving({ conversationId, kind, saving: false }),
            );
          }
        })
        .catch(() => {
          dispatch(
            markWorkingDocError({
              conversationId,
              kind,
              error: "Could not save your version.",
            }),
          );
          dispatch(
            markWorkingDocSaving({ conversationId, kind, saving: false }),
          );
        });
    },
    [dispatch, conversationId, kind, binding.kind, binding.id],
  );

  const openInCanvas = useCallback(() => {
    canvas.open({
      type: kind === "scratch" ? "scratchpad" : "working_document",
      data: { conversationId, kind },
      metadata: {
        title:
          title || (kind === "scratch" ? "Scratchpad" : "Working document"),
        conversationId,
        // Stable dedup key so reopening reuses the same Canvas item instead of
        // stacking duplicates (openCanvas dedups on sourceMessageId).
        sourceMessageId: `wd:${conversationId}:${kind}`,
      },
    });
  }, [canvas, conversationId, kind, title]);

  return {
    kind,
    enabled,
    content,
    title,
    binding,
    saving,
    error,
    conflict,
    resolveConflict,
    draft,
    onChange,
    flush,
    setEnabled,
    bindToNote,
    unbind,
    linkToDocument,
    setTitle,
    openInCanvas,
    viewOnly,
  };
}
