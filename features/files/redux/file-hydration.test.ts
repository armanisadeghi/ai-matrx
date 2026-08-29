import {
  areCloudFileFieldsLoaded,
  FILE_RENDER_FIELDS,
  fileHintToCloudFilePartial,
  needsOnlyRenderFields,
  renderRowToCloudFilePartial,
} from "./file-hydration";

describe("canonical file field hydration", () => {
  it("treats loaded null metadata as complete", () => {
    const record = {
      _loadedFields: {
        fileName: true,
        mimeType: true,
        fileSize: true,
        visibility: true,
      },
    } as const;

    expect(areCloudFileFieldsLoaded(record, FILE_RENDER_FIELDS)).toBe(true);
  });

  it("detects any missing required render field", () => {
    const record = {
      _loadedFields: { fileName: true, mimeType: true },
    } as const;

    expect(areCloudFileFieldsLoaded(record, FILE_RENDER_FIELDS)).toBe(false);
  });

  it("maps the narrow database projection into canonical Redux fields", () => {
    expect(
      renderRowToCloudFilePartial({
        id: "file-1",
        file_name: "photo.jpg",
        mime_type: "image/jpeg",
        size_bytes: 42,
        visibility: "internal",
      }),
    ).toEqual({
      id: "file-1",
      fileName: "photo.jpg",
      mimeType: "image/jpeg",
      fileSize: 42,
      visibility: "internal",
    });
  });

  it("merges persisted hints without pretending absent fields were loaded", () => {
    expect(
      fileHintToCloudFilePartial("file-1", {
        fileName: "photo.jpg",
        mimeType: "image/jpeg",
      }),
    ).toEqual({
      id: "file-1",
      fileName: "photo.jpg",
      mimeType: "image/jpeg",
    });
  });

  it("uses the narrow query only for the render field set", () => {
    expect(needsOnlyRenderFields(FILE_RENDER_FIELDS)).toBe(true);
    expect(needsOnlyRenderFields(["fileName", "metadata"])).toBe(false);
  });
});
