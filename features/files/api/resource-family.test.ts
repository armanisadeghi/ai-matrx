import {
  FILE_RESOURCE_FAMILY_SCHEMA_VERSION,
  normalizeFileResourceId,
  parseFileResourceFamilyInventory,
} from "./resource-family";

const FILE_ID = "11111111-1111-4111-8111-111111111111";

describe("file resource family contract", () => {
  it("accepts canonical file references but not URLs or arbitrary strings", () => {
    expect(normalizeFileResourceId(FILE_ID)).toBe(FILE_ID);
    expect(normalizeFileResourceId({ file_id: FILE_ID })).toBe(FILE_ID);
    expect(normalizeFileResourceId({ resource_id: FILE_ID })).toBe(FILE_ID);
    expect(normalizeFileResourceId("https://example.test/file.pdf")).toBeNull();
    expect(
      normalizeFileResourceId("019f7916-d58e-72d1-a607-9661664692e1"),
    ).toBe("019f7916-d58e-72d1-a607-9661664692e1");
  });

  it("parses the dynamic representation inventory", () => {
    const inventory = parseFileResourceFamilyInventory({
      schema_version: FILE_RESOURCE_FAMILY_SCHEMA_VERSION,
      resource_type: "file",
      requested_file_id: FILE_ID,
      root_file_id: FILE_ID,
      files: [{ id: FILE_ID }],
      processed_documents: [],
      representations: [
        {
          key: "clean",
          label: "Clean text",
          category: "text",
          count: 3,
          promotable: true,
          fetch_tool: "document_content",
        },
        {
          key: "rag",
          label: "RAG chunks",
          category: "search",
          count: 42,
          promotable: false,
          fetch_tool: "knowledge_search",
        },
      ],
      capabilities: ["document_search", "knowledge_search"],
      counts: { files: 1, rag_chunk_count: 42 },
    });

    expect(inventory.representations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "clean", count: 3, promotable: true }),
      ]),
    );
    expect(inventory.representations[1]).toEqual(
      expect.objectContaining({ key: "rag", fetch_tool: "knowledge_search" }),
    );
    expect(inventory.capabilities).toEqual([
      "document_search",
      "knowledge_search",
    ]);
    expect(inventory.capabilities).not.toContain("verify");
  });

  it("fails loudly when the RPC contract is newer than this client", () => {
    expect(() =>
      parseFileResourceFamilyInventory({
        schema_version: FILE_RESOURCE_FAMILY_SCHEMA_VERSION + 1,
        resource_type: "file",
      }),
    ).toThrow("Unsupported file-family schema version");
  });
});
