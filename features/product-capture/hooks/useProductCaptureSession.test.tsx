import { renderHook } from "@/test-utils/renderHook";

const mockCreateItem = jest.fn();
const mockCloseItem = jest.fn();
const mockLoadItem = jest.fn();
const mockSetItemCode = jest.fn();
const mockUploadItemFile = jest.fn();

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => "org-q28",
}));
jest.mock("@/lib/redux/slices/appContextSlice", () => ({
  selectEffectiveOrganizationId: Symbol("selectEffectiveOrganizationId"),
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
  reopenItem: jest.fn(),
  setItemCode: (...args: unknown[]) => mockSetItemCode(...args),
  setItemNotes: jest.fn(),
}));
jest.mock("../uploads", () => ({
  removeItemFile: jest.fn(),
  uploadItemFile: (...args: unknown[]) => mockUploadItemFile(...args),
}));

import type { CaptureItem } from "../types";
import { useProductCaptureSession } from "./useProductCaptureSession";

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

describe("useProductCaptureSession QR adoption", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    mockCloseItem.mockImplementation(async (value: CaptureItem) => value);
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
    window.localStorage.setItem(
      "product-capture:current-item:org-q28",
      "item-stored",
    );

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
    const key = "product-capture:current-item:org-q28";
    window.localStorage.setItem(key, "item-deleted");
    mockLoadItem.mockResolvedValueOnce(null);

    const hook = await renderHook(() => useProductCaptureSession());
    await hook.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockLoadItem).toHaveBeenCalledWith("item-deleted");
    expect(window.localStorage.getItem(key)).toBeNull();
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
    mockCreateItem.mockResolvedValueOnce(item("item-video", "QR-VIDEO"));
    mockUploadItemFile.mockResolvedValueOnce({
      link: {
        id: "link-video",
        itemId: "item-video",
        fileId: "file-video",
        kind: "video",
        video: {
          mime: "video/webm;codecs=vp8,opus",
          durationMs: 1_235,
        },
        createdAt: "2026-09-01T00:00:00.000Z",
      },
    });
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
