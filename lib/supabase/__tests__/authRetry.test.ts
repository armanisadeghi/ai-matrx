import { isMissingSessionError } from "../authRetry";

describe("isMissingSessionError", () => {
  it("recognizes PostgREST's anonymous call to an authenticated-only RPC", () => {
    expect(
      isMissingSessionError(
        {
          code: "42501",
          message: "permission denied for function get_usage_status",
        },
        401,
      ),
    ).toBe(true);
  });

  it("does not misclassify an authenticated execute-grant defect", () => {
    expect(
      isMissingSessionError(
        {
          code: "42501",
          message: "permission denied for function get_usage_status",
        },
        403,
      ),
    ).toBe(false);
  });

  it("does not retry an ordinary authorization denial", () => {
    expect(
      isMissingSessionError({
        code: "42501",
        message: "viewer access required",
      }),
    ).toBe(false);
  });
});
