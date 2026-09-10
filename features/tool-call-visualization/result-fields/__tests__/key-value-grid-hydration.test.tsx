import React, { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { KeyValueGrid, formatMetaNumber } from "../KeyValueGrid";
import { ResultTable } from "../ResultTable";

jest.mock("@ai-matrx/media/react", () => ({
  InlineMediaRef: ({
    ref,
    as,
  }: {
    ref?: { file_id?: string };
    as?: "img" | "video" | "audio";
  }) => (
    <div
      data-testid="inline-media"
      data-file-id={ref?.file_id}
      data-as={as ?? "inferred"}
    />
  ),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("KeyValueGrid hydration", () => {
  let container: HTMLDivElement;
  let root: Root | undefined;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
    }
    root = undefined;
    container.remove();
    jest.restoreAllMocks();
  });

  it("formats metadata with the fixed server/browser locale", () => {
    expect(formatMetaNumber(1_234)).toBe("1,234");
    expect(formatMetaNumber(12_345)).toBe("12.3K");
  });

  it("hydrates numeric metadata without recoverable text mismatches", async () => {
    const value = { row_count: 1_234, total_chars: 12_345 };
    container.innerHTML = renderToString(<KeyValueGrid value={value} />);
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);

    await act(async () => {
      root = hydrateRoot(container, <KeyValueGrid value={value} />);
    });

    expect(consoleError).not.toHaveBeenCalled();
    expect(container.textContent).toContain("1,234");
    expect(container.textContent).toContain("12.3K");
  });

  it("renders an ID-backed scalar audio_url as audio before metadata hydration", () => {
    const audioFileId = "74e43cbd-db1a-4aea-ad67-cee6fdb946ac";
    const audioUrl =
      `https://matrx-user-files.s3.amazonaws.com/user/${audioFileId}` +
      "?AWSAccessKeyId=test&Signature=test&Expires=1786485620";

    container.innerHTML = renderToString(
      <KeyValueGrid value={{ audio_url: audioUrl }} density="full" />,
    );

    const media = container.querySelector('[data-testid="inline-media"]');
    expect(media?.getAttribute("data-file-id")).toBe(audioFileId);
    expect(media?.getAttribute("data-as")).toBe("audio");
  });

  it("keeps the same audio_url behavior inside a result table", () => {
    const audioFileId = "74e43cbd-db1a-4aea-ad67-cee6fdb946ac";
    const audioUrl =
      `https://matrx-user-files.s3.amazonaws.com/user/${audioFileId}` +
      "?AWSAccessKeyId=test&Signature=test&Expires=1786485620";

    container.innerHTML = renderToString(
      <ResultTable
        rows={[{ audio_url: audioUrl }]}
        columns={[{ key: "audio_url", label: "Audio URL" }]}
      />,
    );

    const media = container.querySelector('[data-testid="inline-media"]');
    expect(media?.getAttribute("data-file-id")).toBe(audioFileId);
    expect(media?.getAttribute("data-as")).toBe("audio");
  });

  it("renders every ID-backed item in video_urls as video", () => {
    const videoFileIds = [
      "ba0a1f40-c524-4c36-99f9-cb3e9d4beeeb",
      "33e90a97-d9e8-4eb0-a7d8-0f851cfb6339",
    ];
    const videoUrls = videoFileIds.map(
      (fileId) =>
        `https://matrx-user-files.s3.amazonaws.com/user/${fileId}` +
        "?AWSAccessKeyId=test&Signature=test&Expires=1786485620",
    );

    container.innerHTML = renderToString(
      <KeyValueGrid value={{ video_urls: videoUrls }} density="full" />,
    );

    const media = [...container.querySelectorAll('[data-testid="inline-media"]')];
    expect(media.map((item) => item.getAttribute("data-file-id"))).toEqual(
      videoFileIds,
    );
    expect(media.map((item) => item.getAttribute("data-as"))).toEqual([
      "video",
      "video",
    ]);
  });
});
