'use client';

/**
 * The page-scoped editor registry for the Feedback & Announcements console
 * (`matrx-admin/feedback`).
 *
 * WHY THIS EXISTS. The surface's write targets stage copy into editors that
 * live several components below the route: the two announcement dialogs
 * (create + edit) and the inline category form inside `CategoriesTab`. Neither
 * `getScope()` nor a write handler can reach that state from
 * `FeedbackManagementContainer`, and the usual escape hatch —
 * `useSurfaceWriteHandlers` from the owning child — does not work here either,
 * because TWO components (CreateAnnouncementDialog and EditAnnouncementDialog)
 * both own "the announcement editor". Registering `announcement_draft` twice
 * would be a last-one-wins collision, not a mode gate. So the children publish
 * a HANDLE into this registry and the container owns exactly one handler per
 * target, which resolves WHICH editor is live before it writes anything.
 *
 * WHY A REF AND NOT STATE. `applySurfaceWrite` resolves the handler map — and
 * therefore every closure inside it — BEFORE the confirm dialog is answered
 * (`resolveHandlers` runs above `agentWriteAllowed` in
 * `features/surfaces/runtime/surface-writeback.ts`). Any "is a dialog open",
 * "which one", or "is it saving" guard read straight off the render closure is
 * therefore STALE by the time the admin clicks Apply. Handles are stored in a
 * mutable ref that children refresh on EVERY render, so a handler that reads
 * `store.announcementEditors` at call time always sees the latest render's
 * values and setters. `getScope()` reads the same ref, which is sampled when
 * the admin presses ▶.
 *
 * Nothing in here writes to a server. A handle only ever exposes the SAME
 * setters the admin's own typing goes through.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import type { AnnouncementType } from '@/types/feedback.types';
import type { AnnouncementDraftPatch } from '@/features/admin/feedback/announcement-draft';
import type { CategoryDraftPatch } from '@/features/admin/feedback/category-draft';

/** Which of the two announcement editors a handle belongs to. */
export type AnnouncementEditorMode = 'create' | 'edit';

/**
 * One announcement editor, as the dialog that owns it sees itself right now.
 *
 * `applyDraft` deliberately belongs to the dialog rather than the handler: the
 * dialog calls its OWN `setTitle`/`setMessage`/`setAnnouncementType` — the
 * exact setters the admin's keystrokes go through — so a staged value and a
 * typed value are the same write, not two parallel paths.
 */
export interface AnnouncementEditorHandle {
  mode: AnnouncementEditorMode;
  /** True only when this dialog is actually on screen and editable. */
  isOpen: boolean;
  /** The row being edited, for the `edit` handle; null for `create`. */
  announcementId: string | null;
  title: string;
  message: string;
  announcementType: AnnouncementType;
  /** True while this dialog's own create/update request is in flight. */
  isSubmitting: boolean;
  /** Opens this editor. Only the `create` handle implements it meaningfully. */
  open: () => void;
  /** Stages a validated patch through the dialog's own setters. */
  applyDraft: (patch: AnnouncementDraftPatch) => void;
}

/**
 * The inline category editor inside `CategoriesTab`.
 *
 * There is only ever ONE (the tab renders a single `CategoryForm`, either the
 * new-category form or the row being edited), so no mode gate is needed — but
 * the form only renders inside the "Manage Categories" view, so `applyDraft`
 * is also responsible for revealing it.
 */
export interface CategoryEditorHandle {
  /** True when a category form is open (new or existing). */
  isEditing: boolean;
  /** "create" for the new-category form, "edit" for an existing row. */
  mode: 'create' | 'edit' | null;
  /** The category being edited; null for the new-category form. */
  categoryId: string | null;
  name: string;
  description: string;
  /** True while this tab's own save request is in flight. */
  isSaving: boolean;
  /**
   * Stages a validated patch. When no form is open it starts a NEW category
   * draft, and it always switches to the Manage Categories view so the staged
   * value is visible — staging into something the admin cannot see is not
   * `mode: "draft"`, it is a silent write.
   */
  applyDraft: (patch: CategoryDraftPatch) => void;
}

export interface FeedbackConsoleEditorStore {
  announcementEditors: Map<AnnouncementEditorMode, AnnouncementEditorHandle>;
  categoryEditor: CategoryEditorHandle | null;
}

const FeedbackConsoleEditorContext =
  createContext<FeedbackConsoleEditorStore | null>(null);

/**
 * Mounts the registry. Rendered by `FeedbackManagementContainer` around the
 * whole console so every tab and dialog can publish into it.
 */
export function FeedbackConsoleEditorProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const store = useMemo<FeedbackConsoleEditorStore>(
    () => ({ announcementEditors: new Map(), categoryEditor: null }),
    [],
  );
  return (
    <FeedbackConsoleEditorContext.Provider value={store}>
      {children}
    </FeedbackConsoleEditorContext.Provider>
  );
}

/** The registry, or null when rendered outside the console (tests, storybook). */
export function useFeedbackConsoleEditorStore(): FeedbackConsoleEditorStore | null {
  return useContext(FeedbackConsoleEditorContext);
}

/**
 * Publish an announcement editor's live state into the registry.
 *
 * Call it UNCONDITIONALLY and let `handle.isOpen` say whether the editor is on
 * screen — the create dialog must stay registered while closed so a write can
 * open it, which is the whole reachability fix (a Radix modal puts
 * `pointer-events: none` on the body, so an admin cannot open the dialog and
 * THEN ask an agent for help; the agent has to be able to open it).
 *
 * The first effect has no dependency array on purpose: it re-publishes the
 * latest handle after every render, which is what keeps the container's
 * handlers off stale closures. The second only cleans up on unmount, so the
 * per-render refresh never leaves a gap another read could land in.
 */
export function useRegisterAnnouncementEditor(
  handle: AnnouncementEditorHandle,
): void {
  const store = useFeedbackConsoleEditorStore();
  const mode = handle.mode;

  useEffect(() => {
    store?.announcementEditors.set(mode, handle);
  });

  useEffect(() => {
    if (!store) return;
    return () => {
      store.announcementEditors.delete(mode);
    };
  }, [store, mode]);
}

/** Publish the inline category editor's live state. Same contract as above. */
export function useRegisterCategoryEditor(handle: CategoryEditorHandle): void {
  const store = useFeedbackConsoleEditorStore();

  useEffect(() => {
    if (store) store.categoryEditor = handle;
  });

  useEffect(() => {
    if (!store) return;
    return () => {
      store.categoryEditor = null;
    };
  }, [store]);
}

/**
 * Resolve WHICH announcement editor a write should land in, or explain why it
 * cannot be resolved. Pure so the container's handler and `getScope()` agree.
 *
 * The rules, in order:
 *  - BOTH dialogs open → genuinely ambiguous. Refuse rather than guess which
 *    announcement the admin meant; the whole point of a mode gate is that a
 *    handler never picks a record on the admin's behalf.
 *  - The edit dialog open → that existing announcement is what the admin is
 *    looking at, so it wins over the closed create form.
 *  - Neither open → the create form, which the caller then opens.
 */
export function resolveAnnouncementEditor(
  store: FeedbackConsoleEditorStore,
):
  | { ok: true; handle: AnnouncementEditorHandle }
  | { ok: false; reason: string } {
  const create = store.announcementEditors.get('create');
  const edit = store.announcementEditors.get('edit');

  if (create?.isOpen && edit?.isOpen)
    return {
      ok: false,
      reason:
        'Both the "Create New Announcement" and "Edit Announcement" dialogs are open, so there is no single announcement to write into. Close one of them and ask again — I will not guess which announcement you meant.',
    };

  if (edit?.isOpen) return { ok: true, handle: edit };
  if (create) return { ok: true, handle: create };

  return {
    ok: false,
    reason:
      'The Feedback & Announcements console has no announcement editor mounted right now, so there is nowhere to stage this copy.',
  };
}

/** A read-twin snapshot of whichever announcement editor is currently open. */
export function readAnnouncementEditorValue(
  store: FeedbackConsoleEditorStore,
):
  | {
      mode: AnnouncementEditorMode;
      announcement_id: string | null;
      title: string;
      message: string;
      announcement_type: AnnouncementType;
      is_saving: boolean;
    }
  | undefined {
  const open = [
    store.announcementEditors.get('edit'),
    store.announcementEditors.get('create'),
  ].find((handle) => handle?.isOpen);
  if (!open) return undefined;
  return {
    mode: open.mode,
    announcement_id: open.announcementId,
    title: open.title,
    message: open.message,
    announcement_type: open.announcementType,
    is_saving: open.isSubmitting,
  };
}

/** A read-twin snapshot of the inline category editor, when one is open. */
export function readCategoryEditorValue(store: FeedbackConsoleEditorStore):
  | {
      mode: 'create' | 'edit';
      category_id: string | null;
      name: string;
      description: string;
      is_saving: boolean;
    }
  | undefined {
  const editor = store.categoryEditor;
  if (!editor?.isEditing || !editor.mode) return undefined;
  return {
    mode: editor.mode,
    category_id: editor.categoryId,
    name: editor.name,
    description: editor.description,
    is_saving: editor.isSaving,
  };
}
