import { fileHandler } from "@/features/files/handler/handler";
import type { NormalizedFile } from "@/features/files/handler/types";
import { classify } from "@/features/files/handler/utils/classify";
import { saveEditedImage } from "./save-edited-image";

jest.mock("@/features/files/handler/handler", () => ({
  fileHandler: {
    resolve: jest.fn(),
    upload: jest.fn(),
  },
}));

const mockedResolve = jest.mocked(fileHandler.resolve);
const mockedUpload = jest.mocked(fileHandler.upload);

function resolvedFile(filePath?: string): NormalizedFile {
  return {
    fileId: "generated-file-id",
    filePath,
    url: "https://files.example/generated-file-id",
    origin: "owned",
    capabilities: {
      canRead: true,
      canEdit: true,
      canShare: true,
      canDelete: true,
      requiresAuth: true,
      transportSafeForFetch: true,
    },
    meta: classify({ fileName: "generated.png", mime: "image/png" }),
    lifecycle: { refreshable: true, persisted: true },
    scope: {},
    __source: { kind: "file_id", fileId: "generated-file-id" },
  };
}

describe("saveEditedImage", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("resolves a version target by file id before uploading to its existing path", async () => {
    mockedResolve.mockResolvedValue(
      resolvedFile("Images/Generated/run/generated.png"),
    );
    mockedUpload.mockResolvedValue({
      ...resolvedFile("Images/Generated/run/generated.png"),
      fileId: "generated-file-id",
      shareToken: "share-token",
      url: "https://files.example/share-token",
    });

    const result = await saveEditedImage({
      blob: new Blob(["png"], { type: "image/png" }),
      filename: "generated-edited.png",
      folderPath: "Images/Edited",
      mime: "image/png",
      fileId: "generated-file-id",
      changeSummary: "Edited in Image Studio",
    });

    expect(mockedResolve).toHaveBeenCalledWith({
      kind: "file_id",
      fileId: "generated-file-id",
    });
    expect(mockedUpload).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "file" }),
      expect.objectContaining({
        filePath: "Images/Generated/run/generated.png",
        changeSummary: "Edited in Image Studio",
      }),
    );
    expect(mockedUpload.mock.calls[0]?.[1]).not.toHaveProperty("folderPath");
    expect(result.fileId).toBe("generated-file-id");
  });

  it("fails loudly instead of creating a sibling when the existing path cannot be resolved", async () => {
    mockedResolve.mockResolvedValue(resolvedFile());

    await expect(
      saveEditedImage({
        blob: new Blob(["png"], { type: "image/png" }),
        filename: "generated-edited.png",
        folderPath: "Images/Edited",
        fileId: "generated-file-id",
      }),
    ).rejects.toThrow("could not resolve the existing path");

    expect(mockedUpload).not.toHaveBeenCalled();
  });
});
