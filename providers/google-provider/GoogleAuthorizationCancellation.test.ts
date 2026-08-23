import {
  GoogleAuthorizationCancelledError,
  isGoogleAuthorizationCancelled,
} from "./GoogleApiProvider";

describe("Google authorization cancellation", () => {
  it("distinguishes an expected popup close from authentication failures", () => {
    expect(isGoogleAuthorizationCancelled(new GoogleAuthorizationCancelledError())).toBe(true);
    expect(isGoogleAuthorizationCancelled(new Error("network failed"))).toBe(false);
  });
});
