import {
  DEFAULT_GOOGLE_SHEET_RANGE,
  isGoogleWorkspaceInputError,
} from "@/features/google-workspace/service";
import { BackendApiError } from "@/lib/api/errors";

describe("Google Workspace request boundaries", () => {
  it("defaults to the first sheet instead of assuming a tab name", () => {
    expect(DEFAULT_GOOGLE_SHEET_RANGE).toBe("A1:C10");
    expect(DEFAULT_GOOGLE_SHEET_RANGE).not.toContain("!");
  });

  it("keeps expected input failures inline without hiding server failures", () => {
    expect(
      isGoogleWorkspaceInputError(
        new BackendApiError({
          code: "validation_error",
          detail: "Invalid range",
          userMessage: "Choose a range that exists.",
          status: 422,
        }),
      ),
    ).toBe(true);
    expect(
      isGoogleWorkspaceInputError(
        new BackendApiError({
          code: "internal_error",
          detail: "Google failed",
          userMessage: "Google failed",
          status: 500,
        }),
      ),
    ).toBe(false);
    expect(isGoogleWorkspaceInputError(new Error("Network failed"))).toBe(false);
  });
});
