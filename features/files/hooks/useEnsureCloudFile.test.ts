import { BackendApiError } from "@/lib/api/errors";
import { isExpectedUnavailableFileRead } from "./useEnsureCloudFile";

describe("isExpectedUnavailableFileRead", () => {
  it("downgrades only the file service's deliberate access and missing states", () => {
    expect(
      isExpectedUnavailableFileRead(
        new BackendApiError({
          code: "permission_denied",
          detail: "access denied",
          userMessage: "This file isn't available to you.",
          status: 403,
        }),
      ),
    ).toBe(true);
    expect(
      isExpectedUnavailableFileRead(
        new BackendApiError({
          code: "internal",
          detail: "backend failed",
          userMessage: "Try again later.",
          status: 500,
        }),
      ),
    ).toBe(false);
  });
});
