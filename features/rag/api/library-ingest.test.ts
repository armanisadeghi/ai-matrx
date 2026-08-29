import { postNdjson } from "@/lib/python-client";
import { ingestLibraryFile } from "@/features/rag/api/library-ingest";

jest.mock("@/lib/python-client", () => ({
  postNdjson: jest.fn(),
}));

const mockedPostNdjson = jest.mocked(postNdjson);

describe("ingestLibraryFile", () => {
  beforeEach(() => {
    mockedPostNdjson.mockReset();
  });

  test("resolves from the terminal rag.ingest.result event", async () => {
    mockedPostNdjson.mockImplementation(async function* () {
      yield {
        event: "data",
        data: {
          type: "rag_ingest_result",
          kind: "rag.ingest.result",
          chunks_written: 3,
          embeddings_written: 3,
          skipped_unchanged: false,
          error: null,
        },
      };
      yield { event: "end", data: { reason: "completed" } };
    });

    await expect(ingestLibraryFile("store-1", "file-1")).resolves.toEqual({
      detail: "Ingested 3 chunks and wrote 3 embeddings.",
    });
    expect(mockedPostNdjson).toHaveBeenCalledWith(
      "/rag/library/stores/store-1/ingest",
      { file_id: "file-1", profile: null },
      { signal: undefined },
    );
  });

  test("surfaces an in-band stream error", async () => {
    mockedPostNdjson.mockImplementation(async function* () {
      yield {
        event: "error",
        data: {
          error_type: "library_ingest_failed",
          message: "The library ingest failed.",
          user_message: "The library ingest failed.",
        },
      };
    });

    await expect(ingestLibraryFile("store-1", "file-1")).rejects.toMatchObject({
      code: "library_ingest_failed",
      message: "The library ingest failed.",
    });
  });

  test("rejects a stream that closes without a terminal result", async () => {
    mockedPostNdjson.mockImplementation(async function* () {
      yield { event: "end", data: { reason: "completed" } };
    });

    await expect(ingestLibraryFile("store-1", "file-1")).rejects.toMatchObject({
      code: "library_ingest_incomplete",
    });
  });
});
