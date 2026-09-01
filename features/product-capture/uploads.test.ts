import { fileHandler } from "@/features/files/handler/handler";

import {
  countFileLinks,
  isActiveCloudFile,
  linkFile,
  listItemFiles,
  unlinkFile,
} from "./service";
import { removeItemFile, uploadItemFile } from "./uploads";

jest.mock("@/features/files/handler/handler", () => ({
  fileHandler: { remove: jest.fn(), upload: jest.fn() },
}));

jest.mock("./service", () => ({
  countFileLinks: jest.fn(),
  isActiveCloudFile: jest.fn(),
  linkFile: jest.fn(),
  listItemFiles: jest.fn(),
  unlinkFile: jest.fn(),
}));

const mockRemove = jest.mocked(fileHandler.remove);
const mockUpload = jest.mocked(fileHandler.upload);
const mockLinkFile = jest.mocked(linkFile);
const mockCountFileLinks = jest.mocked(countFileLinks);
const mockIsActiveCloudFile = jest.mocked(isActiveCloudFile);
const mockListItemFiles = jest.mocked(listItemFiles);
const mockUnlinkFile = jest.mocked(unlinkFile);

describe("removeItemFile", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListItemFiles.mockResolvedValue([]);
    mockIsActiveCloudFile.mockResolvedValue(true);
    mockRemove.mockResolvedValue(undefined);
    mockUnlinkFile.mockResolvedValue(undefined);
  });

  it("unlinks only this item when a deduplicated file has another live link", async () => {
    mockCountFileLinks.mockResolvedValue(2);

    await removeItemFile({
      itemId: "item-b",
      fileId: "shared-file",
      linkId: "link-b",
    });

    expect(mockUnlinkFile).toHaveBeenCalledWith("link-b");
    expect(mockRemove).not.toHaveBeenCalled();
    expect(mockIsActiveCloudFile).not.toHaveBeenCalled();
  });

  it("does not delete a file when the supplied relation is already absent", async () => {
    mockCountFileLinks.mockResolvedValue(0);

    await removeItemFile({
      itemId: "item-a",
      fileId: "unlinked-file",
      linkId: "missing-link",
    });

    expect(mockRemove).not.toHaveBeenCalled();
    expect(mockUnlinkFile).not.toHaveBeenCalled();
    expect(mockIsActiveCloudFile).not.toHaveBeenCalled();
  });

  it("deletes a sole active file before unlinking its relation", async () => {
    const order: string[] = [];
    mockCountFileLinks.mockResolvedValue(1);
    mockRemove.mockImplementation(async () => {
      order.push("file");
    });
    mockUnlinkFile.mockImplementation(async () => {
      order.push("link");
    });

    await removeItemFile({
      itemId: "item-a",
      fileId: "sole-file",
      linkId: "sole-link",
    });

    expect(order).toEqual(["file", "link"]);
  });

  it("idempotently unlinks a stale relation whose file is already deleted", async () => {
    mockCountFileLinks.mockResolvedValue(1);
    mockIsActiveCloudFile.mockResolvedValue(false);

    await removeItemFile({
      itemId: "item-a",
      fileId: "deleted-file",
      linkId: "stale-link",
    });

    expect(mockUnlinkFile).toHaveBeenCalledWith("stale-link");
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it("does not commit the unlink when deleting a sole active file fails", async () => {
    mockCountFileLinks.mockResolvedValue(1);
    mockRemove.mockRejectedValue(new Error("storage unavailable"));

    await expect(
      removeItemFile({
        itemId: "item-a",
        fileId: "sole-file",
        linkId: "sole-link",
      }),
    ).rejects.toThrow("storage unavailable");

    expect(mockUnlinkFile).not.toHaveBeenCalled();
  });

  it("is a no-op when this item has no matching relation", async () => {
    await removeItemFile({ itemId: "item-a", fileId: "unlinked-file" });

    expect(mockCountFileLinks).not.toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
    expect(mockUnlinkFile).not.toHaveBeenCalled();
  });
});

describe("uploadItemFile video contract", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("persists the exact normalized MIME and duration in file and link metadata", async () => {
    const file = new File(["video"], "product-video-42.webm", {
      type: "video/webm;codecs=vp8,opus",
    });
    const item = {
      id: "item-video",
      organizationId: "org-video",
      code: "SKU-VIDEO",
      codeSource: "manual" as const,
      notes: "",
      folderPath: "Product Captures/org-video/item-video",
      status: "capturing" as const,
      createdAt: "2026-09-01T00:00:00.000Z",
      version: 1,
    };
    const video = {
      mime: "video/webm;codecs=vp8,opus",
      durationMs: 1_235,
    };
    mockUpload.mockResolvedValue({
      fileId: "cloud-video",
      origin: "owned",
      capabilities: {
        canRead: true,
        canEdit: true,
        canShare: true,
        canDelete: true,
        requiresAuth: true,
        transportSafeForFetch: true,
      },
      meta: {
        fileName: file.name,
        mime: file.type,
        category: "VIDEO",
        previewKind: "video",
        thumbnailStrategy: "video-poster",
      },
      lifecycle: { refreshable: true, persisted: true },
      scope: { organizationId: item.organizationId },
      __source: { kind: "file", file },
    });
    mockLinkFile.mockResolvedValue({
      id: "link-video",
      itemId: item.id,
      fileId: "cloud-video",
      kind: "video",
      video,
      createdAt: "2026-09-01T00:00:01.000Z",
    });

    await uploadItemFile({ item, file, kind: "video", video });

    expect(mockUpload).toHaveBeenCalledWith(
      { kind: "file", file },
      expect.objectContaining({
        metadata: {
          product_capture: {
            item_id: item.id,
            code: item.code,
            kind: "video",
            video: {
              mime: video.mime,
              duration_ms: video.durationMs,
            },
          },
        },
      }),
    );
    expect(mockLinkFile).toHaveBeenCalledWith({
      itemId: item.id,
      organizationId: item.organizationId,
      fileId: "cloud-video",
      kind: "video",
      video,
    });
  });

  it("rejects missing or divergent terminal facts before uploading bytes", async () => {
    const file = new File(["video"], "product-video.webm", {
      type: "video/webm",
    });
    const item = {
      id: "item-video",
      organizationId: "org-video",
      code: null,
      codeSource: null,
      notes: "",
      folderPath: "Product Captures/org-video/item-video",
      status: "capturing" as const,
      createdAt: "2026-09-01T00:00:00.000Z",
      version: 1,
    };

    await expect(uploadItemFile({ item, file, kind: "video" })).rejects.toThrow(
      /requires normalized MIME and duration/i,
    );
    await expect(
      uploadItemFile({
        item,
        file,
        kind: "video",
        video: { mime: "video/mp4", durationMs: 10 },
      }),
    ).rejects.toThrow(/facts must match the file MIME/i);

    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockLinkFile).not.toHaveBeenCalled();
  });
});
