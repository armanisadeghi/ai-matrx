const mockAs = jest.fn();
const mockUse = jest.fn();

jest.mock("@/features/files/handler/handler", () => ({
  fileHandler: { use: mockUse },
}));

import { downloadMediaSource } from "./download";

describe("downloadMediaSource", () => {
  let clickedHref = "";
  let clickedDownload = "";

  beforeEach(() => {
    jest.useFakeTimers();
    mockAs.mockImplementation(async (target: { kind: string }) => {
      if (target.kind === "anchor_download") {
        return { url: "https://cdn.example/video", filename: "episode.mp4" };
      }
      if (target.kind === "blob") {
        return new Blob(["video bytes"], { type: "video/mp4" });
      }
      throw new Error(`unexpected target ${target.kind}`);
    });
    mockUse.mockReturnValue({ as: mockAs });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: jest.fn(() => "blob:q13-download"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: jest.fn(),
    });
    clickedHref = "";
    clickedDownload = "";
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    mockAs.mockReset();
    mockUse.mockReset();
  });

  it("fetches canonical bytes and clicks a same-origin download anchor", async () => {
    const click = jest
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        clickedHref = this.href;
        clickedDownload = this.download;
      });

    await downloadMediaSource(
      { kind: "external_url", url: "https://cdn.example/video" },
      "episode.mp4",
    );

    expect(mockUse).toHaveBeenCalledWith({
      kind: "external_url",
      url: "https://cdn.example/video",
    });
    expect(mockAs).toHaveBeenNthCalledWith(1, {
      kind: "anchor_download",
      suggestedName: "episode.mp4",
    });
    expect(mockAs).toHaveBeenNthCalledWith(2, { kind: "blob" });
    expect(click).toHaveBeenCalledTimes(1);
    expect(clickedHref).toBe("blob:q13-download");
    expect(clickedDownload).toBe("episode.mp4");
    expect(document.querySelector('a[href="blob:q13-download"]')).toBeNull();

    jest.advanceTimersByTime(1_000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:q13-download");
  });
});
