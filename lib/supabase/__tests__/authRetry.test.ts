import { isMissingSessionError } from "../authRetry";

describe("isMissingSessionError", () => {
  it("recognizes PostgREST's anonymous call to an authenticated-only RPC", () => {
    expect(
      isMissingSessionError({
        code: "42501",
        message: "permission denied for function get_usage_status",
      }),
    ).toBe(true);
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
