// features/rich-document/annotations/record-of-source.ts
//
// Which SAVED RECORD a rendered piece of content is — the identity the
// annotation sidecar anchors to. Content that is not a saved record (a stream
// in flight, a raw buffer, an edited copy) has none, and the reading set's
// record actions (highlight, comment, suggest, link) are simply absent there.

import type { ContentSource } from "@ai-matrx/rich-content/rich-document/types";
import { durableRecordId } from "@ai-matrx/kit/ids";

/** The saved record a host renders, when its ContentSource does not say (the studio's loaded document). */
export interface AnnotationRecord {
  token: string;
  id: string;
  title?: string;
  contentVersion?: number;
  href?: string;
  /** A chat answer's conversation. */
  conversationId?: string;
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
    case "chat-message": {
      // A client-temp answer (no reservation arrived — e.g. incognito) is not a saved record.
      const messageId = durableRecordId(source.messageId);
      if (!messageId) return null;
      return {
        token: "message",
        id: messageId,
        title: "Chat answer",
        href: `/chat/${source.conversationId}`,
        conversationId: source.conversationId,
      };
    }
    case "working-document":
      // A working document is a content-store document (content.document, type working_document)
      // since cleanup C5c (2026-10-07), so its record token is "document".
      return source.documentId ? { token: "document", id: source.documentId, title: "Working document" } : null;
    default:
      return null;
  }
}

export function recordKeyOf(record: Pick<AnnotationRecord, "token" | "id">): string {
  return `${record.token}:${record.id}`;
}
