import { validateFeedbackScreenshotUrls } from "@/lib/services/agent-feedback.service";

describe("agent feedback screenshot contract", () => {
  test("accepts and deduplicates durable public CDN URLs", () => {
    const url = "https://cdn.matrxserver.com/user/file?v=cache";
    expect(validateFeedbackScreenshotUrls([url, url])).toEqual([url]);
  });

  test.each([
    "file:///tmp/screenshot.png",
    "http://example.com/screenshot.png",
    "https://bucket.s3.amazonaws.com/file?X-Amz-Signature=secret",
    "https://server.app.matrxserver.com/share/token/download",
  ])("rejects non-durable screenshot URL %s", (url) => {
    expect(() => validateFeedbackScreenshotUrls([url])).toThrow(
      /durable public|durable public HTTPS/,
    );
  });
});
