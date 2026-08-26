import { shouldCaptureApiError } from "@/lib/api/call-api";

describe("callApi capture policy", () => {
  it("does not file an expected domain error as a system incident", () => {
    expect(shouldCaptureApiError(404, [404])).toBe(false);
  });

  it("still captures unexpected and statusless failures", () => {
    expect(shouldCaptureApiError(503, [404])).toBe(true);
    expect(shouldCaptureApiError(undefined, [404])).toBe(true);
  });
});
