import { renderHook } from "@/test-utils/renderHook";

const mockCreateItem = jest.fn();
const mockCloseItem = jest.fn();

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
  loadItem: jest.fn(),
  reopenItem: jest.fn(),
  setItemCode: jest.fn(),
  setItemNotes: jest.fn(),
}));
jest.mock("../uploads", () => ({
  removeItemFile: jest.fn(),
  uploadItemFile: jest.fn(),
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
});
