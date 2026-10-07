/**
 * THE TOKEN IS THE TABLE (2026-09-29). An annotation source's `token` is the platform entity type the
 * database's access checks resolve — `platform.entity_types.token` → its table. A token that names a
 * DIFFERENT table than the id belongs to makes every check ask about a row that does not exist: the
 * answer is always "no", so the record can never be commented on. Working documents live in the
 * content store (content.document, type working_document) since cleanup C5c (2026-10-07), so their
 * token is "document"; the retired "working_document" token names a table that is gone.
 */
import { noteIdentityContentSource } from "@/features/notes/richDocumentSource";
import { annotationRecordOf } from "../record-of-source";

describe("annotation record tokens name the table the id lives in", () => {
  it("a working document is a content-store document", () => {
    const record = annotationRecordOf({
      type: "working-document",
      conversationId: "c",
      kind: "document",
      documentId: "3d7c2c6e-0000-4000-8000-000000000001",
    } as never);
    expect(record?.token).toBe("document");
  });

  it("a note is a note and a chat answer is a message", () => {
    expect(annotationRecordOf({ ...noteIdentityContentSource("11111111-1111-4111-8111-111111111111"), mode: "readonly" } as never)?.token).toBe("note");
    expect(
      annotationRecordOf({ type: "chat-message", messageId: "263550e7-eb60-4e8e-97ee-e19297126ebe", conversationId: "c" } as never)?.token,
    ).toBe("message");
  });
});
