// features/rich-document/annotations/record-of-source.ts
//
// Which SAVED RECORD a rendered piece of content is — the identity the
// annotation sidecar anchors to. Content that is not a saved record (a stream
// in flight, a raw buffer, an edited copy) has none, and the reading set's
// record actions (highlight, comment, suggest, link) are simply absent there.

import type { ContentSource } from "../types";

/** The saved record a host renders, when its ContentSource does not say (the studio's loaded document). */
export interface AnnotationRecord {
  token: string;
  id: string;
  title?: string;
  contentVersion?: number;
  href?: string;
}

/** The record a ContentSource names, or null (raw, prompt results, an ephemeral working document…). */
export function annotationRecordOf(source: ContentSource): AnnotationRecord | null {
  switch (source.type) {
    case "note":
      return {
        token: "note",
        id: source.noteId,
        title: (source.mode === "editable" && source.displayedPhysicalSnapshot.label) || "Note",
        contentVersion: source.mode === "editable" ? source.editBase.version : undefined,
        href: `/notes/${source.noteId}`,
      };
    case "chat-message":
      return {
        token: "message",
        id: source.messageId,
        title: "Chat answer",
        href: `/chat/${source.conversationId}`,
      };
    case "working-document":
      // "working_document" (workbench.working_documents), NOT "document" (content.document, a different
      // table): the wrong token made every access check ask about a row that does not exist, so a
      // working document could never be commented on (2026-09-29).
      return source.documentId ? { token: "working_document", id: source.documentId, title: "Working document" } : null;
    default:
      return null;
  }
}

export function recordKeyOf(record: Pick<AnnotationRecord, "token" | "id">): string {
  return `${record.token}:${record.id}`;
}
