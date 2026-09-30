/**
 * THE TOKEN IS THE TABLE (2026-09-29). An annotation source's `token` is the platform entity type the
 * database's access checks resolve — `platform.entity_types.token` → its table. A token that names a
 * DIFFERENT table than the id belongs to makes every check ask about a row that does not exist: the
 * answer is always "no", so the record can never be commented on. That is exactly what happened to
 * working documents: they were sent as "document" (content.document) while their id lives in
 * workbench.working_documents ("working_document").
 */
import { annotationRecordOf } from "../record-of-source";

describe("annotation record tokens name the table the id lives in", () => {
  it("a working document is a working_document, never a content document", () => {
    const record = annotationRecordOf({
      type: "working-document",
      conversationId: "c",
      kind: "document",
      documentId: "3d7c2c6e-0000-4000-8000-000000000001",
    } as never);
    expect(record?.token).toBe("working_document");
  });

  it("a note is a note and a chat answer is a message", () => {
    expect(annotationRecordOf({ type: "note", noteId: "n", mode: "readonly" } as never)?.token).toBe("note");
    expect(
      annotationRecordOf({ type: "chat-message", messageId: "m", conversationId: "c" } as never)?.token,
    ).toBe("message");
  });
});
