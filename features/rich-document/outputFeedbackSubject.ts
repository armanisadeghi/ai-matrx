/**
 * Map a rich-document `ContentSource` onto an output-feedback subject.
 *
 * `subject_type` is FK-enforced against `platform.entity_types.token`, so a
 * source whose entity is not registered returns null and its thumbs stay
 * hidden — never a button that 23503s on click. Registering the entity is all
 * it takes to light one up.
 */

import type { OutputFeedbackSubject } from "@/lib/output-feedback/types";
import type { ContentSource } from "./types";
import { durableRecordId } from "@/lib/ids/durable-record-id";

export function outputFeedbackSubjectForSource(
  source: ContentSource,
): OutputFeedbackSubject | null {
  switch (source.type) {
    case "chat-message": {
      // A client-temp answer has no row yet — no thumbs until it does.
      const messageId = durableRecordId(source.messageId);
      return messageId ? { subjectType: "message", subjectId: messageId } : null;
    }
    case "note":
      return { subjectType: "note", subjectId: source.noteId };
    case "artifact":
      return { subjectType: "artifact", subjectId: source.artifactId };
    case "working-document":
      return source.documentId
        ? { subjectType: "working_document", subjectId: source.documentId }
        : null;
    // `prompt-result`, `scraper-result` and `raw` have no registered entity
    // token to hang a verdict on yet.
    default:
      return null;
  }
}
