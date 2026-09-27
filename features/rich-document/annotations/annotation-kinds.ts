// features/rich-document/annotations/annotation-kinds.ts
//
// THE ANNOTATION KINDS and where each one's removal can be undone. The soft-delete law:
// anything important can be archived and restored, never lost. Every door the sidecar's
// service removes something through is declared here with its entity token, and every
// soft-deleting kind is either registered with THE trash (/trash lists it, entity_undelete
// restores it) or named below as a gap with its reason.
//
// Guards: `__tests__/annotation-kinds.census.test.ts` (every removal door in service.ts is
// declared here) and `pnpm check:annotation-trash` (live: every declared soft-deleting token
// carries a user_artifact_kind in platform.entity_types, or is an allowed gap).

export interface AnnotationKindStorage {
  /** What a person calls it. */
  kinds: readonly string[];
  /** platform.entity_types token of the table the row lives in. */
  entityToken: string;
  /** How service.ts removes it (the census matches these against the source). */
  removalDoor: string;
  /** In-place undo on the removal toast. */
  toastUndo: boolean;
  /** Null = registered with /trash; otherwise why it is not (a gap the chair has queued). */
  trashGap: string | null;
}

export const ANNOTATION_KINDS: readonly AnnotationKindStorage[] = [
  {
    kinds: ["comment", "suggestion", "reply"],
    entityToken: "comment",
    removalDoor: "cmt_delete",
    toastUndo: true,
    trashGap: null,
  },
  {
    kinds: ["highlight", "note"],
    entityToken: "document",
    removalDoor: 'schema("content")',
    toastUndo: true,
    trashGap: null,
  },
  {
    kinds: ["link"],
    entityToken: "agent_surface_binding",
    removalDoor: "associationsService.remove",
    toastUndo: true,
    // platform.associations is every relationship in the platform (scopes, tags, bindings…);
    // registering the whole table would flood /trash with rows nobody recognises. A detached
    // passage link is undone from its toast (re-linked to the same passage); a filtered
    // "passage link" trash kind needs its own design. Queued with the chair 2026-09-26.
    trashGap: "platform.associations is every relationship; needs a filtered passage-link kind",
  },
];
