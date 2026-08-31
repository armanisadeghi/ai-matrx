import { supportsClientIdMetadataDocument } from "../client-registration";

describe("supportsClientIdMetadataDocument", () => {
  it("requires explicit provider support", () => {
    expect(supportsClientIdMetadataDocument(null)).toBe(false);
    expect(supportsClientIdMetadataDocument({})).toBe(false);
    expect(
      supportsClientIdMetadataDocument({
        oauth_client_id_metadata_document_supported: "true",
      }),
    ).toBe(false);
  });

  it("accepts the canonical boolean capability flag", () => {
    expect(
      supportsClientIdMetadataDocument({
        oauth_client_id_metadata_document_supported: true,
      }),
    ).toBe(true);
  });
});
