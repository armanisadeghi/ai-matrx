import {
  areCloudFileFieldsLoaded,
  FILE_RENDER_FIELDS,
  fileHintToCloudFilePartial,
  needsOnlyRenderFields,
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

  it("recognizes the render-only field set", () => {
    expect(needsOnlyRenderFields(FILE_RENDER_FIELDS)).toBe(true);
    expect(needsOnlyRenderFields(["fileName", "metadata"])).toBe(false);
  });
});
