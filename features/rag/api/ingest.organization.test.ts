// An existing record is processed in ITS OWN organization: ingestSource forwards the
// record's org to the transport instead of leaving it to the active organization.
import { ingestSource } from "./ingest";
import { postJson } from "@/lib/python-client";

jest.mock("@/lib/python-client", () => ({
  buildHeaders: jest.fn(),
  postJson: jest.fn(async () => ({ data: { error: null }, meta: {} })),
  resolveBaseUrl: jest.fn(),
}));

describe("ingestSource organization", () => {
  it("passes the source record's own organization to the request", async () => {
    await ingestSource("note", "note-1", { organizationId: "org-of-the-note" });
    expect(postJson).toHaveBeenCalledWith(
      "/rag/ingest",
      expect.objectContaining({ source_id: "note-1" }),
      expect.objectContaining({ organizationId: "org-of-the-note" }),
    );
  });
});
