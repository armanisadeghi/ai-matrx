import {
  resolveRouteManifestSourceSha,
  ROUTE_MANIFEST_SOURCE_SHA_ENV,
} from "../lib/route-manifest-source-sha";

const RELEASE_SHA = "2cf2d9426e2ba087c558134fb883392f1ee378cf";

describe("route-manifest source SHA", () => {
  it("uses the validated release SHA instead of a checkout that has advanced", () => {
    const verifyCommit = jest.fn(() => RELEASE_SHA);
    expect(
      resolveRouteManifestSourceSha(RELEASE_SHA, () => "5d944953".padEnd(40, "0"), verifyCommit),
    ).toBe(RELEASE_SHA);
    expect(verifyCommit).toHaveBeenCalledWith(RELEASE_SHA);
  });

  it("refuses an invalid override instead of stamping an ambiguous source", () => {
    expect(() =>
      resolveRouteManifestSourceSha("5d944953", () => RELEASE_SHA, () => RELEASE_SHA),
    ).toThrow(`${ROUTE_MANIFEST_SOURCE_SHA_ENV} must be an exact 40-character commit SHA`);
  });

  it("refuses a full SHA when Git cannot verify that exact commit", () => {
    expect(() =>
      resolveRouteManifestSourceSha(RELEASE_SHA, () => RELEASE_SHA, () => "a".repeat(40)),
    ).toThrow(`${ROUTE_MANIFEST_SOURCE_SHA_ENV} must name that exact commit, not an alias`);
  });

  it("surfaces the local-commit refusal when the verifier cannot resolve the override", () => {
    expect(() =>
      resolveRouteManifestSourceSha(RELEASE_SHA, () => RELEASE_SHA, () => {
        throw new Error(`${ROUTE_MANIFEST_SOURCE_SHA_ENV} does not resolve to a local commit`);
      }),
    ).toThrow(`${ROUTE_MANIFEST_SOURCE_SHA_ENV} does not resolve to a local commit`);
  });

  it("keeps HEAD for manual non-release syncs", () => {
    expect(resolveRouteManifestSourceSha(undefined, () => RELEASE_SHA, () => "")).toBe(RELEASE_SHA);
  });
});
