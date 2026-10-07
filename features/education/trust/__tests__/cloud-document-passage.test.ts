import { univerDocToMarkdown } from "@/features/documents/univer-doc-to-markdown";
import { findDocumentPassage } from "../documentPassage";
import { readCloudDocumentBody } from "../useDocumentPassage";

jest.mock("@/features/documents/document-service", () => ({
  getDocument: jest.fn(async (id: string) =>
    id === "gone"
      ? { success: false, error: "trash" }
      : { success: true, data: { id, document_name: "Lab protocol" } },
  ),
  getLatestDocumentSnapshot: jest.fn(async () => ({
    success: true,
    data: {
      snapshot: {
        body: {
          dataStream: "Lab protocol\rIncubate the sample at 37 degrees for twenty minutes.\r\n",
          paragraphs: [{ startIndex: 11 }, { startIndex: 62 }],
        },
      },
    },
  })),
}));
jest.mock("@/features/rich-document/annotations/documentSource", () => ({
  loadDocument: jest.fn(async () => null),
}));

describe("a cloud document citation opens its latest snapshot text", () => {
  it("reads the title and the snapshot as text", async () => {
    const doc = await readCloudDocumentBody("abc");
    expect(doc?.title).toBe("Lab protocol");
    expect(doc?.body).toContain("Incubate the sample at 37 degrees");
  });
  it("marks the cited passage in that text", async () => {
    const doc = await readCloudDocumentBody("abc");
    const p = findDocumentPassage(doc!.body, "Incubate the sample at 37 degrees for twenty minutes.");
    expect(p).not.toBeNull();
  });
  it("is null (honest) when the document cannot be read", async () => {
    expect(await readCloudDocumentBody("gone")).toBeNull();
  });
  it("the snapshot reader is the canonical one", () => {
    expect(typeof univerDocToMarkdown).toBe("function");
  });
});
