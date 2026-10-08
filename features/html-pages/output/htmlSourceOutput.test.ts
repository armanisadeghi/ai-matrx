/** Copy HTML / Download .html go through the kit doors and hand over the version the surface shows. */
const copyText = jest.fn().mockResolvedValue(true);
const downloadFile = jest.fn();
jest.mock("@ai-matrx/kit/clipboard", () => ({ copyText: (...a: unknown[]) => copyText(...a) }));
jest.mock("@ai-matrx/kit/download", () => ({ downloadFile: (...a: unknown[]) => downloadFile(...a) }));
jest.mock("@/lib/toast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
const resolve = jest.fn();
jest.mock("@/features/html-pages/services/canvasVersionPage", () => ({ resolveHtmlCanvasPage: (...a: unknown[]) => resolve(...a) }));
jest.mock("@/features/canvas/artifact-types/artifactId", () => ({ isMaterializedArtifactId: (id: string) => id.startsWith("ok-") }));

import { copyHtmlSource, downloadHtmlSource, htmlPageFileName, resolveShownHtml } from "./htmlSourceOutput";

describe("html source output", () => {
  it("the canvas tab hands over the chain's latest version, not the held text", async () => {
    resolve.mockResolvedValue({ shown: { html: "<p>v2</p>" } });
    expect(await resolveShownHtml({ canvasItemId: "ok-1", version: "latest", held: "<p>v1</p>" })).toBe("<p>v2</p>");
    expect(resolve).toHaveBeenCalledWith("ok-1", "latest");
  });
  it("an unsaved page hands over what it holds", async () => {
    expect(await resolveShownHtml({ canvasItemId: "tmp", version: "latest", held: "<p>held</p>" })).toBe("<p>held</p>");
  });
  it("copy and download use the kit doors", async () => {
    await copyHtmlSource("<b>x</b>");
    expect(copyText).toHaveBeenCalledWith("<b>x</b>", expect.objectContaining({ successMessage: "Copied HTML" }));
    downloadHtmlSource("My Page!", "<b>x</b>");
    expect(downloadFile).toHaveBeenCalledWith("my-page.html", "<b>x</b>", "text/html");
    expect(htmlPageFileName("")).toBe("page.html");
  });
});
