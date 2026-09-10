/**
 * SUT: `uploadItemFile` / `removeItemFile` — product capture's one cloud
 * boundary. Doubled (external): `fileHandler` (storage/network) and the
 * `./service` DB layer. Owned and never stubbed: the refusal rules, the exact
 * upload options + metadata, the delete-vs-unlink decision and its ordering.
 */

import { fileHandler } from "@/features/files/handler/handler";
import type { UploadedNormalizedFile } from "@/features/files/handler/types";

import {
  countFileLinks,
  isActiveCloudFile,
  linkFile,
  listItemFiles,
  unlinkFile,
} from "./service";
import type { CaptureFile, CaptureItem, CaptureVideoFacts } from "./types";
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

// ── Fixtures ─────────────────────────────────────────────────────────────────

const videoItem = {
  id: "item-video",
  organizationId: "org-video",
  code: "SKU-VIDEO",
  codeSource: "manual",
  notes: "",
  folderPath: "Product Captures/org-video/item-video",
  status: "capturing",
  createdAt: "2026-09-01T00:00:00.000Z",
  version: 1,
} satisfies CaptureItem;

const WEBM = "video/webm;codecs=vp8,opus";

function videoFile(): File {
  return new File(["video"], "product-video-42.webm", { type: WEBM });
}

/** `fileId: ""` models the malformed upload the SUT must refuse: the handler's
 *  contract promises a durable id, but an empty one is not addressable. */
function uploadedFile(file: File, fileId: string): UploadedNormalizedFile {
  return {
    fileId,
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
    scope: { organizationId: "org-video" },
    __source: { kind: "file", file },
  } satisfies UploadedNormalizedFile;
}

function linkRow(id: string, fileId: string): CaptureFile {
  return {
    id,
    itemId: "item-a",
    fileId,
    kind: "photo",
    video: null,
    createdAt: "2026-09-01T00:00:01.000Z",
  } satisfies CaptureFile;
}

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

  it("hard-deletes a sole active file before unlinking its relation", async () => {
    const calls: unknown[][] = [];
    mockCountFileLinks.mockResolvedValue(1);
    mockRemove.mockImplementation(async (...args) => {
      calls.push(["remove", ...args]);
    });
    mockUnlinkFile.mockImplementation(async (...args) => {
      calls.push(["unlink", ...args]);
    });

    await removeItemFile({
      itemId: "item-a",
      fileId: "sole-file",
      linkId: "sole-link",
    });

    expect(mockCountFileLinks).toHaveBeenCalledWith("sole-file");
    expect(calls).toEqual([
      ["remove", "sole-file", { hard: true }],
      ["unlink", "sole-link"],
    ]);
  });

  it("resolves the relation by fileId when no linkId is supplied", async () => {
    mockListItemFiles.mockResolvedValue([
      linkRow("link-a", "file-a"),
      linkRow("link-b", "file-b"),
    ]);
    mockCountFileLinks.mockResolvedValue(2);

    await removeItemFile({ itemId: "item-a", fileId: "file-b" });

    expect(mockListItemFiles).toHaveBeenCalledWith("item-a");
    expect(mockUnlinkFile).toHaveBeenCalledTimes(1);
    expect(mockUnlinkFile).toHaveBeenCalledWith("link-b");
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

  it("uploads org-internal into the item folder with the exact normalized facts, then links them", async () => {
    const file = videoFile();
    const video = { mime: WEBM, durationMs: 1_235 } satisfies CaptureVideoFacts;
    const uploaded = uploadedFile(file, "cloud-video");
    const link = {
      id: "link-video",
      itemId: "item-video",
      fileId: "cloud-video",
      kind: "video",
      video,
      createdAt: "2026-09-01T00:00:01.000Z",
    } satisfies CaptureFile;
    mockUpload.mockResolvedValue(uploaded);
    mockLinkFile.mockResolvedValue(link);

    const result = await uploadItemFile({ item: videoItem, file, kind: "video", video });

    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockUpload).toHaveBeenCalledWith(
      { kind: "file", file },
      {
        folderPath: "Product Captures/org-video/item-video",
        visibility: "internal",
        fileName: "product-video-42.webm",
        metadata: {
          product_capture: {
            item_id: "item-video",
            code: "SKU-VIDEO",
            kind: "video",
            video: { mime: "video/webm;codecs=vp8,opus", duration_ms: 1235 },
          },
        },
        inheritActiveScope: true,
      },
    );
    expect(mockLinkFile).toHaveBeenCalledWith({
      itemId: "item-video",
      organizationId: "org-video",
      fileId: "cloud-video",
      kind: "video",
      video: { mime: "video/webm;codecs=vp8,opus", durationMs: 1235 },
    });
    expect(result).toEqual({ uploaded, link });
  });

  it("refuses an upload that resolved without a fileId and never links it", async () => {
    const file = videoFile();
    mockUpload.mockResolvedValue(uploadedFile(file, ""));

    await expect(
      uploadItemFile({
        item: videoItem,
        file,
        kind: "video",
        video: { mime: WEBM, durationMs: 1_235 },
      }),
    ).rejects.toThrow(/resolved without a fileId/);
    expect(mockLinkFile).not.toHaveBeenCalled();
  });

  it("rejects missing or divergent terminal facts before uploading bytes", async () => {
    const file = new File(["video"], "product-video.webm", {
      type: "video/webm",
    });
    const item = {
      ...videoItem,
      code: null,
      codeSource: null,
    } satisfies CaptureItem;

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

  it.each([
    ["a zero duration", "video", 0],
    ["a negative duration", "video", -5],
    ["a fractional duration", "video", 12.5],
    ["video facts on a photo", "photo", 1_235],
  ] as const)(
    "refuses %s before uploading bytes",
    async (_case, kind, durationMs) => {
      await expect(
        uploadItemFile({
          item: videoItem,
          file: videoFile(),
          kind,
          video: { mime: WEBM, durationMs },
        }),
      ).rejects.toThrow(/facts must match the file MIME and carry a positive integer duration/);
      expect(mockUpload).not.toHaveBeenCalled();
    },
  );
});
