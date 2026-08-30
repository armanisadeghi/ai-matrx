import { defaultTraySnapshotCapture } from "@/features/window-panels/WindowTray/defaultTraySnapshotCapture";
import { captureElementThumbnail } from "@/hooks/useScreenCapture";

jest.mock("@/hooks/useScreenCapture", () => ({
  captureElementThumbnail: jest.fn(),
}));

const mockedCapture = jest.mocked(captureElementThumbnail);

function sizedElement(width: number, height: number): HTMLElement {
  const el = document.createElement("div");
  Object.defineProperties(el, {
    offsetWidth: { configurable: true, value: width },
    offsetHeight: { configurable: true, value: height },
  });
  return el;
}

describe("defaultTraySnapshotCapture", () => {
  beforeEach(() => {
    mockedCapture.mockReset();
  });

  it("delegates to captureElementThumbnail for a normal body", async () => {
    const blob = new Blob(["img"], { type: "image/webp" });
    mockedCapture.mockResolvedValue(blob);
    const el = sizedElement(640, 480);

    await expect(defaultTraySnapshotCapture(el)).resolves.toBe(blob);
    expect(mockedCapture).toHaveBeenCalledWith(el);
  });

  it("skips capture for an oversized DOM subtree", async () => {
    const el = sizedElement(640, 480);
    for (let i = 0; i < 3001; i += 1) {
      el.appendChild(document.createElement("span"));
    }

    await expect(defaultTraySnapshotCapture(el)).resolves.toBeNull();
    expect(mockedCapture).not.toHaveBeenCalled();
  });

  it("skips capture for a collapsed body", async () => {
    await expect(
      defaultTraySnapshotCapture(sizedElement(0, 0)),
    ).resolves.toBeNull();
    expect(mockedCapture).not.toHaveBeenCalled();
  });

  it("swallows renderer failures and resolves null", async () => {
    mockedCapture.mockRejectedValue(new Error("render failed"));

    await expect(
      defaultTraySnapshotCapture(sizedElement(640, 480)),
    ).resolves.toBeNull();
  });
});
