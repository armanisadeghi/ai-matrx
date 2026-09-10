/**
 * SUT: useProductCaptureSession — item lifecycle, QR serialization, artifact
 * upload state, and the lane-specific terminal writes.
 * Doubled (external): the DB service layer (`../service`), the cloud upload
 * boundary (`../uploads`), toast, object URLs, speech API.
 * Redux is a REAL store over the real appContext reducer; the hook's own
 * selector runs against it (only the Provider-bound hook is bridged).
 */

import { configureStore } from "@reduxjs/toolkit";

import { renderHook, settle, type HookHandle } from "@/test-utils/renderHook";
import appContextReducer, {
  setOrganization,
} from "@/lib/redux/slices/appContextSlice";
import type { NormalizedFile } from "@/features/files/handler/types";

const mockStore = configureStore({ reducer: { appContext: appContextReducer } });
mockStore.dispatch(setOrganization({ id: "org-q28", name: "Q28 Warehouse" }));
type MockState = ReturnType<typeof mockStore.getState>;

const mockCreateItem = jest.fn();
const mockCloseItem = jest.fn();
const mockLoadItem = jest.fn();
const mockReopenItem = jest.fn();
const mockSetItemCode = jest.fn();
const mockUploadItemFile = jest.fn();

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: MockState) => unknown) =>
    selector(mockStore.getState()),
}));
jest.mock("@/lib/media/object-url-registry", () => ({
  createTrackedObjectUrl: () => "blob:q28",
  revokeTrackedObjectUrl: jest.fn(),
}));
jest.mock("@/lib/toast", () => ({
  toast: {
    error: jest.fn(),
    info: jest.fn(),
  },
}));
jest.mock("@ai-matrx/browser-audio/core", () => ({
  toAudioFile: jest.fn(),
}));
jest.mock("@/features/audio/services/speechApi", () => ({
  transcribeCloudFile: jest.fn(),
}));
jest.mock("../service", () => ({
  appendToItemNotes: jest.fn(),
  closeItem: (...args: unknown[]) => mockCloseItem(...args),
  createItem: (...args: unknown[]) => mockCreateItem(...args),
  listItemFiles: jest.fn().mockResolvedValue([]),
  loadItem: (...args: unknown[]) => mockLoadItem(...args),
  reopenItem: (...args: unknown[]) => mockReopenItem(...args),
  setItemCode: (...args: unknown[]) => mockSetItemCode(...args),
  setItemNotes: jest.fn(),
}));
jest.mock("../uploads", () => ({
  removeItemFile: jest.fn(),
  uploadItemFile: (...args: unknown[]) => mockUploadItemFile(...args),
}));

import type {
  CaptureItem,
  CaptureVideoFacts,
  ProductCaptureFileKind,
} from "../types";
import type { UploadItemFileResult } from "../uploads";
import {
  useProductCaptureSession,
  type UseProductCaptureSessionResult,
} from "./useProductCaptureSession";

const RESUME_KEY = "product-capture:current-item:org-q28";

function item(id: string, code: string): CaptureItem {
  return {
    id,
    organizationId: "org-q28",
    code,
    codeSource: "qr",
    notes: "",
    folderPath: `Product Captures/org-q28/${id}`,
    status: "capturing",
    createdAt: "2026-08-30T00:00:00.000Z",
    version: 1,
  };
}

function uploadResult(args: {
  itemId: string;
  fileId: string;
  kind: ProductCaptureFileKind;
  video?: CaptureVideoFacts;
}): UploadItemFileResult {
  const uploaded = {
    fileId: args.fileId,
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
      fileName: `${args.kind}-capture`,
      mime: args.video?.mime ?? "image/jpeg",
      category: "VIDEO",
      previewKind: "video",
      thumbnailStrategy: "video-poster",
    },
    lifecycle: { refreshable: true, persisted: true },
    scope: { organizationId: "org-q28" },
    __source: {
      kind: "file",
      file: new File([args.kind], `${args.kind}-capture`, {
        type: args.video?.mime ?? "image/jpeg",
      }),
    },
  } satisfies NormalizedFile;
  return {
    uploaded,
    link: {
      id: `link-${args.fileId}`,
      itemId: args.itemId,
      fileId: args.fileId,
      kind: args.kind,
      video: args.video ?? null,
      createdAt: "2026-09-01T00:00:00.000Z",
    },
  };
}

/**
 * Crosses one macrotask boundary inside act: every microtask chain the hook
 * started (upload settle, the fire-and-forget finish-item close, reopen)
 * drains before it returns. The standard-lane tests prove this drain observes
 * the writes, which is what makes the instant-lane "never written" assertions
 * meaningful.
 */
async function drainAsyncWork(
  hook: HookHandle<UseProductCaptureSessionResult>,
): Promise<void> {
  await hook.act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Scan a QR to create the item, add one photo, and wait for its upload to settle. */
async function captureOnePhoto(
  hook: HookHandle<UseProductCaptureSessionResult>,
  code: string,
): Promise<void> {
  await hook.act(async () => {
    await hook.current.onQrCode(code);
  });
  await hook.act(async () => {
    hook.current.addPhoto(new Blob(["jpeg"], { type: "image/jpeg" }));
  });
  await settle(
    hook,
    (s) => s.artifacts.length === 1 && s.artifacts[0].status !== "uploading",
    "the photo upload to settle",
  );
}

describe("useProductCaptureSession QR adoption", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    mockCloseItem.mockImplementation(async (value: CaptureItem) => value);
    mockReopenItem.mockImplementation(async (value: CaptureItem) => ({
      ...value,
      status: "capturing",
      version: value.version + 1,
    }));
    mockSetItemCode.mockImplementation(
      async (value: CaptureItem, code: string) => ({
        ...value,
        code,
        codeSource: "manual",
        version: value.version + 1,
      }),
    );
  });

  it("waits for the persisted current item before applying a decoded QR", async () => {
    let resolveStored!: (value: CaptureItem) => void;
    mockLoadItem.mockReturnValueOnce(
      new Promise<CaptureItem>((resolve) => {
        resolveStored = resolve;
      }),
    );
    mockCreateItem.mockResolvedValueOnce(item("item-new", "QR-Q28-NEW"));
    window.localStorage.setItem(RESUME_KEY, "item-stored");

    const hook = await renderHook(() => useProductCaptureSession());
    let scan!: Promise<"assigned" | "switched">;
    await hook.act(async () => {
      scan = hook.current.onQrCode("QR-Q28-NEW");
      await Promise.resolve();
    });

    expect(mockCreateItem).not.toHaveBeenCalled();

    await hook.act(async () => {
      resolveStored(item("item-stored", "QR-Q28-STORED"));
      await scan;
    });

    expect(mockCloseItem).toHaveBeenCalledWith(
      expect.objectContaining({ id: "item-stored", code: "QR-Q28-STORED" }),
    );
    expect(hook.current.currentItem).toEqual(
      expect.objectContaining({ id: "item-new", code: "QR-Q28-NEW" }),
    );
    await hook.unmount();
  });

  it("forgets a persisted item id after the row no longer exists", async () => {
    window.localStorage.setItem(RESUME_KEY, "item-deleted");
    mockLoadItem.mockResolvedValueOnce(null);

    const hook = await renderHook(() => useProductCaptureSession());
    await settle(
      hook,
      () => window.localStorage.getItem(RESUME_KEY) === null,
      "the dead resume slot to be cleared",
    );

    expect(mockLoadItem).toHaveBeenCalledWith("item-deleted");
    expect(window.localStorage.getItem(RESUME_KEY)).toBeNull();
    await hook.unmount();
  });

  it("serializes sequential scans and leaves the latest created item current", async () => {
    let resolveFirst!: (value: CaptureItem) => void;
    const firstCreate = new Promise<CaptureItem>((resolve) => {
      resolveFirst = resolve;
    });
    mockCreateItem
      .mockReturnValueOnce(firstCreate)
      .mockResolvedValueOnce(item("item-004", "QR-Q28-004"));

    const hook = await renderHook(() => useProductCaptureSession());
    let firstScan!: Promise<"assigned" | "switched">;
    let secondScan!: Promise<"assigned" | "switched">;
    await hook.act(async () => {
      firstScan = hook.current.onQrCode("QR-Q28-003");
      secondScan = hook.current.onQrCode("QR-Q28-004");
      await Promise.resolve();
    });

    expect(mockCreateItem).toHaveBeenCalledTimes(1);
    expect(mockCreateItem).toHaveBeenNthCalledWith(1, {
      organizationId: "org-q28",
      code: "QR-Q28-003",
      codeSource: "qr",
    });

    await hook.act(async () => {
      resolveFirst(item("item-003", "QR-Q28-003"));
      await Promise.all([firstScan, secondScan]);
    });

    expect(mockCreateItem).toHaveBeenCalledTimes(2);
    expect(mockCreateItem).toHaveBeenNthCalledWith(2, {
      organizationId: "org-q28",
      code: "QR-Q28-004",
      codeSource: "qr",
    });
    expect(mockCloseItem).toHaveBeenCalledWith(
      expect.objectContaining({ id: "item-003", code: "QR-Q28-003" }),
    );
    expect(hook.current.currentItem).toEqual(
      expect.objectContaining({ id: "item-004", code: "QR-Q28-004" }),
    );
    await hook.unmount();
  });

  it("refuses a programmatic Next when the item has no artifact", async () => {
    mockCreateItem.mockResolvedValueOnce(item("item-empty", "QR-Q28-EMPTY"));
    const hook = await renderHook(() => useProductCaptureSession());
    await hook.act(async () => {
      await hook.current.onQrCode("QR-Q28-EMPTY");
    });

    expect(hook.current.canAdvanceItem).toBe(false);
    expect(hook.current.nextItem()).toBe(false);
    expect(mockCloseItem).not.toHaveBeenCalled();
    expect(hook.current.currentItem?.id).toBe("item-empty");
    await hook.unmount();
  });

  it("refreshes the already-current item without closing it before the next guarded write", async () => {
    mockCreateItem.mockResolvedValueOnce(item("item-current", "QR-CURRENT"));
    mockLoadItem.mockResolvedValueOnce({
      ...item("item-current", "QR-CURRENT"),
      version: 7,
    });

    const hook = await renderHook(() => useProductCaptureSession());
    await hook.act(async () => {
      await hook.current.onQrCode("QR-CURRENT");
      await hook.current.resumeItem("item-current");
      await hook.current.setCode("SKU-AFTER-RESUME");
    });

    expect(mockCloseItem).not.toHaveBeenCalled();
    expect(mockSetItemCode).toHaveBeenCalledWith(
      expect.objectContaining({ id: "item-current", version: 7 }),
      "SKU-AFTER-RESUME",
      "manual",
    );
    await hook.unmount();
  });

  it("preserves the host-normalized video MIME and duration through upload", async () => {
    const video = { mime: "video/webm;codecs=vp8,opus", durationMs: 1_235 };
    mockCreateItem.mockResolvedValueOnce(item("item-video", "QR-VIDEO"));
    mockUploadItemFile.mockResolvedValueOnce(
      uploadResult({ itemId: "item-video", fileId: "file-video", kind: "video", video }),
    );
    const hook = await renderHook(() => useProductCaptureSession());
    await hook.act(async () => {
      await hook.current.onQrCode("QR-VIDEO");
      hook.current.addVideo(
        new Blob(["video"], { type: "video/webm;codecs=vp8,opus" }),
        "product-video-42.webm",
        1_235,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockUploadItemFile).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "video",
        file: expect.objectContaining({
          name: "product-video-42.webm",
          type: "video/webm;codecs=vp8,opus",
        }),
        video: {
          mime: "video/webm;codecs=vp8,opus",
          durationMs: 1_235,
        },
      }),
    );
    await hook.unmount();
  });
});

describe("useProductCaptureSession artifacts and terminal writes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    mockCloseItem.mockImplementation(async (value: CaptureItem) => value);
    mockReopenItem.mockImplementation(async (value: CaptureItem) => ({
      ...value,
      status: "capturing",
      version: value.version + 1,
    }));
  });

  it("marks an artifact uploaded with its cloud fileId once the upload lands, which unlocks Next", async () => {
    mockCreateItem.mockResolvedValueOnce(item("item-photo", "QR-PHOTO"));
    mockUploadItemFile.mockResolvedValueOnce(
      uploadResult({ itemId: "item-photo", fileId: "file-photo", kind: "photo" }),
    );
    const hook = await renderHook(() => useProductCaptureSession());

    await captureOnePhoto(hook, "QR-PHOTO");

    expect(hook.current.artifacts).toEqual([
      expect.objectContaining({
        itemId: "item-photo",
        kind: "photo",
        fileId: "file-photo",
        status: "uploaded",
      }),
    ]);
    expect(hook.current.uploadingCount).toBe(0);
    expect(hook.current.errorCount).toBe(0);
    expect(hook.current.canAdvanceItem).toBe(true);
    await hook.unmount();
  });

  it("keeps a failed upload on the item as an error artifact that does not unlock Next", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    mockCreateItem.mockResolvedValueOnce(item("item-fail", "QR-FAIL"));
    mockUploadItemFile.mockRejectedValueOnce(new Error("storage offline"));
    const hook = await renderHook(() => useProductCaptureSession());

    await captureOnePhoto(hook, "QR-FAIL");

    expect(hook.current.artifacts).toEqual([
      expect.objectContaining({ status: "error", error: "storage offline" }),
    ]);
    expect(hook.current.errorCount).toBe(1);
    expect(hook.current.canAdvanceItem).toBe(false);
    expect(hook.current.nextItem()).toBe(false);
    await drainAsyncWork(hook);
    expect(mockCloseItem).not.toHaveBeenCalled();
    await hook.unmount();
    consoleError.mockRestore();
  });

  it("Next on a captured item writes the captured close and clears the resume slot (standard lane)", async () => {
    mockCreateItem.mockResolvedValueOnce(item("item-std", "QR-STD"));
    mockUploadItemFile.mockResolvedValueOnce(
      uploadResult({ itemId: "item-std", fileId: "file-std", kind: "photo" }),
    );
    const hook = await renderHook(() => useProductCaptureSession());
    await captureOnePhoto(hook, "QR-STD");
    expect(window.localStorage.getItem(RESUME_KEY)).toBe("item-std");

    let advanced = false;
    await hook.act(async () => {
      advanced = hook.current.nextItem();
    });
    await drainAsyncWork(hook);

    expect(advanced).toBe(true);
    expect(mockCloseItem).toHaveBeenCalledTimes(1);
    expect(mockCloseItem).toHaveBeenCalledWith(
      expect.objectContaining({ id: "item-std" }),
    );
    expect(window.localStorage.getItem(RESUME_KEY)).toBeNull();
    expect(hook.current.currentItem).toBeNull();
    await hook.unmount();
  });

  it("the instant lane never writes the captured close on Next (no double processing)", async () => {
    mockCreateItem.mockResolvedValueOnce(item("item-instant", "QR-INSTANT"));
    mockUploadItemFile.mockResolvedValueOnce(
      uploadResult({ itemId: "item-instant", fileId: "file-instant", kind: "photo" }),
    );
    const hook = await renderHook(() =>
      useProductCaptureSession({ lane: "instant" }),
    );
    await captureOnePhoto(hook, "QR-INSTANT");

    let advanced = false;
    await hook.act(async () => {
      advanced = hook.current.nextItem();
    });
    await drainAsyncWork(hook);

    expect(advanced).toBe(true);
    expect(hook.current.currentItem).toBeNull();
    expect(mockCloseItem).not.toHaveBeenCalled();
    await hook.unmount();
  });

  it.each([
    ["standard", 1, "capturing"],
    ["instant", 0, "processed"],
  ] as const)(
    "resuming a processed item on the %s lane reopens it %i time(s)",
    async (lane, reopenCalls, statusAfter) => {
      mockLoadItem.mockResolvedValueOnce({
        ...item("item-done", "QR-DONE"),
        status: "processed",
      });
      const hook = await renderHook(() => useProductCaptureSession({ lane }));

      await hook.act(async () => {
        await hook.current.resumeItem("item-done");
      });
      await drainAsyncWork(hook);

      expect(mockReopenItem).toHaveBeenCalledTimes(reopenCalls);
      expect(hook.current.currentItem).toEqual(
        expect.objectContaining({ id: "item-done", status: statusAfter }),
      );
      await hook.unmount();
    },
  );
});
