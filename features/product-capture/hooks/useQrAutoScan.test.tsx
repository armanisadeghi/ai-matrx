import { renderHook } from "@/test-utils/renderHook";

const mockDecodeQrFromElement = jest.fn();

jest.mock("@ai-matrx/kit/qr", () => ({
  decodeQrFromElement: (...args: unknown[]) => mockDecodeQrFromElement(...args),
}));

import { useQrAutoScan } from "./useQrAutoScan";

const videoRef = {
  current: { videoWidth: 640 } as HTMLVideoElement,
};

describe("useQrAutoScan", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("delivers a newly decoded code to the item switch handler", async () => {
    mockDecodeQrFromElement.mockResolvedValue("QR-Q28-001");
    const onCode = jest.fn();

    const hook = await renderHook(() =>
      useQrAutoScan({
        videoRef,
        enabled: true,
        currentCode: null,
        onCode,
      }),
    );
    await hook.act(async () => {
      await Promise.resolve();
    });

    expect(mockDecodeQrFromElement).toHaveBeenCalledWith(videoRef.current);
    expect(onCode).toHaveBeenCalledWith("QR-Q28-001");
    await hook.unmount();
  });

  it("does not re-fire the current item code or an in-frame repeat", async () => {
    mockDecodeQrFromElement.mockResolvedValue("QR-Q28-002");
    const onCode = jest.fn();

    const currentHook = await renderHook(() =>
      useQrAutoScan({
        videoRef,
        enabled: true,
        currentCode: "QR-Q28-002",
        onCode,
      }),
    );
    await currentHook.act(async () => {
      await Promise.resolve();
    });
    expect(onCode).not.toHaveBeenCalled();
    await currentHook.unmount();

    const repeatHook = await renderHook(() =>
      useQrAutoScan({
        videoRef,
        enabled: true,
        currentCode: null,
        onCode,
      }),
    );
    await repeatHook.act(async () => {
      await Promise.resolve();
    });
    await repeatHook.act(async () => {
      jest.advanceTimersByTime(250);
      await Promise.resolve();
    });
    expect(onCode).toHaveBeenCalledTimes(1);
    await repeatHook.unmount();
  });

  it("does not decode the next frame until current-item adoption finishes", async () => {
    mockDecodeQrFromElement
      .mockResolvedValueOnce("QR-Q28-003")
      .mockResolvedValueOnce("QR-Q28-004");
    let finishAdoption!: () => void;
    const adoption = new Promise<void>((resolve) => {
      finishAdoption = resolve;
    });
    const onCode = jest
      .fn<Promise<void>, [string]>()
      .mockReturnValueOnce(adoption)
      .mockResolvedValueOnce();

    const hook = await renderHook(() =>
      useQrAutoScan({
        videoRef,
        enabled: true,
        currentCode: null,
        onCode,
      }),
    );
    await hook.act(async () => {
      await Promise.resolve();
    });
    expect(onCode).toHaveBeenCalledWith("QR-Q28-003");

    await hook.act(async () => {
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    expect(mockDecodeQrFromElement).toHaveBeenCalledTimes(1);

    await hook.act(async () => {
      finishAdoption();
      await adoption;
      await Promise.resolve();
      jest.advanceTimersByTime(250);
      await Promise.resolve();
    });
    expect(onCode).toHaveBeenLastCalledWith("QR-Q28-004");
    await hook.unmount();
  });
});
