// lib/local-drafts/types.ts
//
// Shapes for the local unsaved-work draft store. See FEATURE.md.

/** What a draft source hands over for one unsaved entity. */
export interface LocalDraftInput {
  /** Entity family — "note", "task", … One namespace per feature. */
  namespace: string;
  /** The entity's id (a client-minted id is fine — it may have no server row). */
  entityId: string;
  /**
   * The user id the edits were made AS. A draft is only ever offered back to
   * the same user: on the 2026-08-08 identity-drift incident the tab's edits
   * belonged to a different account than the one that reloaded, and restoring
   * across that boundary would leak one account's text into another's note.
   */
  ownerId: string | null;
  /** Human label for the recovery UI ("Meeting notes"). */
  label?: string | null;
  /** The unsaved text itself. */
  content: string;
  /** True when the entity has NO server row yet (its first insert never landed). */
  isNew?: boolean;
}

export interface LocalDraft extends LocalDraftInput {
  /** `${namespace}:${entityId}` — the storage key. */
  key: string;
  /** Epoch ms this snapshot was taken. */
  capturedAt: number;
  /** Why it was taken ("auth-identity-drift", "note-save-failures", "unload"). */
  reason: string;
}

/** A feature registers one collector; it returns everything currently unsaved. */
export type DraftSource = () => LocalDraftInput[];
