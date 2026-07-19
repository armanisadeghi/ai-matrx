import {
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
  });

  it("parses the dynamic representation inventory", () => {
    const inventory = parseFileResourceFamilyInventory({
      schema_version: 1,
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
          fetch_tool: "document_context",
        },
      ],
      capabilities: ["document_search"],
      counts: { files: 1 },
    });

    expect(inventory.representations).toEqual([
      expect.objectContaining({ key: "clean", count: 3, promotable: true }),
    ]);
    expect(inventory.capabilities).toEqual(["document_search"]);
  });
});
