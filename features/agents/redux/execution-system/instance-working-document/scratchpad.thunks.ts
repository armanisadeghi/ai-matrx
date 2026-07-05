/**
 * Scratchpad thunks — the USER-GLOBAL scratchpad pool.
 *
 * Scratchpads are the user's personal notepads: `workbench.working_documents`
 * rows (kind "scratch") owned by the user, DECOUPLED from conversations. One is
 * ACTIVE at all times (`userPreferences.scratchpad.activeId`, synced
 * cross-device); the active one is published read-only into every
 * conversation's agent context — never when empty. The user can additionally
 * ATTACH other scratchpads to a specific conversation (platform.associations
 * edges), published as `user_scratchpad_<id8>` extras.
 *
 * Slice entries live at the synthetic `sp:<documentId>` scope (see
 * `scratchScopeId`) so all of the working-document machinery — draft, debounced
 * optimistic-concurrency commits, realtime, auto-title, materialize-on-write —
 * is reused unchanged. Rows are created on the FIRST byte of content
 * (`materializeWorkingDocumentThunk` handles the sp-scope: no conversation
 * edge, no origin conversation).
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { setPreference } from "@/lib/redux/preferences/userPreferencesSlice";
import { getActiveOrgId } from "@/lib/organizations/activeOrg";
import {
  applyAgentWorkingDocContent,
  markWorkingDocMaterialized,
  removeWorkingDocEntry,
  addAttachedScratchpad,
  removeAttachedScratchpad,
  setAttachedScratchpads,
  scratchScopeId,
  workingDocKey,
  setWorkingDocBinding,
  setWorkingDocEnabled,
  setWorkingDocTitle,
} from "./instance-working-document.slice";
import { selectActiveScratchpadId } from "./instance-working-document.selectors";
import {
  getCxWorkingDocumentById,
  linkDocumentToConversation,
  listConversationDocuments,
  listUserDocuments,
  softDeleteWorkingDocument,
  unlinkDocumentFromConversation,
  type CxWorkingDocument,
} from "./cx-working-document.service";

interface ThunkConfig {
  state: RootState;
  dispatch: AppDispatch;
}

/** Point the durable active-scratchpad preference at a document (or none). */
function setActivePreference(dispatch: AppDispatch, id: string | null): void {
  dispatch(
    setPreference({ module: "scratchpad", preference: "activeId", value: id }),
  );
}

/** Load a scratchpad row into its `sp:<id>` slice entry (always enabled). */
function applyScratchpadDoc(dispatch: AppDispatch, doc: CxWorkingDocument): void {
  const scope = scratchScopeId(doc.id);
  dispatch(setWorkingDocEnabled({ conversationId: scope, kind: "scratch", enabled: true }));
  dispatch(
    setWorkingDocBinding({
      conversationId: scope,
      kind: "scratch",
      binding: { kind: "cx_working_document", id: doc.id, label: doc.title },
    }),
  );
  dispatch(
    markWorkingDocMaterialized({
      conversationId: scope,
      kind: "scratch",
      version: doc.version,
    }),
  );
  if (doc.title) {
    dispatch(
      setWorkingDocTitle({ conversationId: scope, kind: "scratch", title: doc.title }),
    );
  }
  dispatch(
    applyAgentWorkingDocContent({
      conversationId: scope,
      kind: "scratch",
      content: doc.content ?? "",
    }),
  );
}

/** Reserve a slice entry for a scratchpad whose row doesn't exist yet. */
function reserveScratchpadEntry(dispatch: AppDispatch, documentId: string): void {
  const scope = scratchScopeId(documentId);
  dispatch(setWorkingDocEnabled({ conversationId: scope, kind: "scratch", enabled: true }));
  dispatch(
    setWorkingDocBinding({
      conversationId: scope,
      kind: "scratch",
      binding: { kind: "cx_working_document", id: documentId, label: null },
    }),
  );
}

// In-flight dedup — the bridge mounts in several places (RunControlsMenu,
// ProTextareaAgentPanel) and each dispatches hydrate on mount; collapse to one
// round-trip per session unless forced.
let activeHydrateInFlight: Promise<void> | null = null;

/**
 * Resolve + load the user's ACTIVE scratchpad. If no pointer is set yet, adopt
 * the most-recently-edited existing scratchpad (so pre-existing scratch content
 * simply becomes the pool). Never CREATES a row — creation happens on first
 * content, or explicitly via `createScratchpadThunk`.
 */
export const hydrateActiveScratchpadThunk = createAsyncThunk<
  void,
  { force?: boolean } | undefined,
  ThunkConfig
>(
  "scratchpad/hydrateActive",
  async (args, { dispatch, getState }) => {
    if (activeHydrateInFlight && !args?.force) return activeHydrateInFlight;
    const run = (async () => {
      // A null pointer before the preferences REHYDRATE lands just means "not
      // loaded yet" — adopting-newest then would clobber the user's real
      // pointer. Wait briefly for the sync engine to hydrate.
      for (
        let i = 0;
        i < 30 && !getState().userPreferences._meta.loadedPreferences;
        i++
      ) {
        await new Promise((r) => setTimeout(r, 100));
      }
      let activeId = selectActiveScratchpadId(getState());
      // Already live in this session (bridge or a panel loaded it) — never
      // re-apply a DB read over fresher local state.
      if (
        activeId &&
        getState().instanceWorkingDocument.byKey[
          workingDocKey(scratchScopeId(activeId), "scratch")
        ]?.materialized
      ) {
        return;
      }
      if (!activeId) {
        // First run for this user — adopt the newest existing scratchpad.
        try {
          const existing = await listUserDocuments("scratch", 1);
          if (existing[0]) {
            activeId = existing[0].id;
            setActivePreference(dispatch, activeId);
            applyScratchpadDoc(dispatch, existing[0]);
            return;
          }
        } catch (err) {
          console.error("[scratchpad] hydrate: list failed", err);
        }
        return; // none yet — created lazily on first open/type
      }
      try {
        const doc = await getCxWorkingDocumentById(activeId);
        if (doc) {
          applyScratchpadDoc(dispatch, doc);
        } else {
          // Pointer at a row that doesn't exist (never materialized, or
          // deleted elsewhere) — keep the id reserved; first content creates it.
          reserveScratchpadEntry(dispatch, activeId);
        }
      } catch (err) {
        console.error("[scratchpad] hydrate: load failed", { activeId, err });
      }
    })();
    activeHydrateInFlight = run.finally(() => {
      activeHydrateInFlight = null;
    });
    return activeHydrateInFlight;
  },
);

/**
 * Create a new scratchpad (Redux + preference only — the durable row is
 * created on the first byte of content). Returns the new document id.
 */
export const createScratchpadThunk = createAsyncThunk<
  string,
  { makeActive?: boolean } | undefined,
  ThunkConfig
>("scratchpad/create", async (args, { dispatch }) => {
  const id = crypto.randomUUID();
  reserveScratchpadEntry(dispatch, id);
  if (args?.makeActive !== false) setActivePreference(dispatch, id);
  return id;
});

/** Switch the active scratchpad (loads it into the slice if needed). */
export const setActiveScratchpadThunk = createAsyncThunk<
  void,
  { documentId: string },
  ThunkConfig
>("scratchpad/setActive", async ({ documentId }, { dispatch, getState }) => {
  setActivePreference(dispatch, documentId);
  const scope = scratchScopeId(documentId);
  const loaded =
    getState().instanceWorkingDocument.byKey[workingDocKey(scope, "scratch")]
      ?.materialized;
  if (loaded) return;
  try {
    const doc = await getCxWorkingDocumentById(documentId);
    if (doc) applyScratchpadDoc(dispatch, doc);
    else reserveScratchpadEntry(dispatch, documentId);
  } catch (err) {
    console.error("[scratchpad] setActive: load failed", { documentId, err });
  }
});

/**
 * Delete a scratchpad (soft delete — history survives). If it was the active
 * one, the newest remaining scratchpad becomes active (or none, and the next
 * open/type creates a fresh one).
 */
export const deleteScratchpadThunk = createAsyncThunk<
  void,
  { documentId: string },
  ThunkConfig
>("scratchpad/delete", async ({ documentId }, { dispatch, getState }) => {
  const scope = scratchScopeId(documentId);
  const wasMaterialized =
    getState().instanceWorkingDocument.byKey[workingDocKey(scope, "scratch")]
      ?.materialized;
  if (wasMaterialized) {
    try {
      await softDeleteWorkingDocument(documentId);
    } catch (err) {
      console.error("[scratchpad] delete failed", { documentId, err });
      throw err;
    }
  }
  dispatch(removeWorkingDocEntry({ conversationId: scope, kind: "scratch" }));
  if (selectActiveScratchpadId(getState()) === documentId) {
    setActivePreference(dispatch, null);
    try {
      const remaining = await listUserDocuments("scratch", 1);
      if (remaining[0]) {
        setActivePreference(dispatch, remaining[0].id);
        applyScratchpadDoc(dispatch, remaining[0]);
      }
    } catch (err) {
      console.error("[scratchpad] delete: successor pick failed", err);
    }
  }
});

/** The org used for scratchpad attach edges (conversation's org, else active). */
function orgForConversation(
  state: RootState,
  conversationId: string,
): string | null {
  return (
    state.conversations.byConversationId[conversationId]?.organizationId ??
    getActiveOrgId()
  );
}

/**
 * Attach an ADDITIONAL scratchpad to a conversation's context. Persists a
 * `working_document → conversation` edge and loads the content so the
 * publication layer can include it. The active scratchpad never needs this.
 */
export const attachScratchpadToConversationThunk = createAsyncThunk<
  void,
  { conversationId: string; documentId: string },
  ThunkConfig
>(
  "scratchpad/attach",
  async ({ conversationId, documentId }, { dispatch, getState }) => {
    try {
      const doc = await getCxWorkingDocumentById(documentId);
      if (!doc) return;
      applyScratchpadDoc(dispatch, doc);
      const orgId = orgForConversation(getState(), conversationId);
      if (orgId) {
        await linkDocumentToConversation({
          documentId,
          conversationId,
          organizationId: orgId,
          kind: "scratch",
          enabled: true,
        });
      }
      dispatch(addAttachedScratchpad({ conversationId, documentId }));
    } catch (err) {
      console.error("[scratchpad] attach failed", {
        conversationId,
        documentId,
        err,
      });
    }
  },
);

/** Detach an attached scratchpad from a conversation (removes the edge). */
export const detachScratchpadFromConversationThunk = createAsyncThunk<
  void,
  { conversationId: string; documentId: string },
  ThunkConfig
>(
  "scratchpad/detach",
  async ({ conversationId, documentId }, { dispatch }) => {
    dispatch(removeAttachedScratchpad({ conversationId, documentId }));
    try {
      await unlinkDocumentFromConversation(documentId, conversationId);
    } catch (err) {
      console.error("[scratchpad] detach failed", {
        conversationId,
        documentId,
        err,
      });
    }
  },
);

/**
 * Restore a conversation's ATTACHED scratchpads from its association edges
 * (excluding the active one) and load each one's content for publication.
 */
export const hydrateAttachedScratchpadsThunk = createAsyncThunk<
  void,
  { conversationId: string },
  ThunkConfig
>(
  "scratchpad/hydrateAttached",
  async ({ conversationId }, { dispatch, getState }) => {
    let links;
    try {
      links = await listConversationDocuments(conversationId);
    } catch (err) {
      console.error("[scratchpad] hydrateAttached: list failed", {
        conversationId,
        err,
      });
      return;
    }
    const activeId = selectActiveScratchpadId(getState());
    const ids = links
      .filter((l) => l.kind === "scratch" && l.enabled && l.documentId !== activeId)
      .map((l) => l.documentId);
    const resolved: string[] = [];
    await Promise.all(
      ids.map(async (id) => {
        try {
          const doc = await getCxWorkingDocumentById(id);
          if (doc) {
            applyScratchpadDoc(dispatch, doc);
            resolved.push(id);
          }
        } catch (err) {
          console.error("[scratchpad] hydrateAttached: load failed", {
            id,
            err,
          });
        }
      }),
    );
    dispatch(setAttachedScratchpads({ conversationId, documentIds: resolved }));
  },
);
