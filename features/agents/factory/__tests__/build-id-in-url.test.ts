/**
 * Agent Factory R59: a full reload mid-build on /agents/new/generate lost the build view while
 * the build kept running server-side. The build id rides the URL (`?build=<id>`), so a reload
 * re-attaches BuildProgress to it.
 */
import { BUILD_PARAM, buildIdFromSearch, hrefWithBuild } from "../build-id-in-url";

const ID = "6f1c2a3e-9b0d-4c55-8a41-0d6a3c7b9e12";

describe("buildIdFromSearch", () => {
  it("reads the build id from the query", () => {
    expect(buildIdFromSearch(`?${BUILD_PARAM}=${ID}`)).toBe(ID);
    expect(buildIdFromSearch(`?x=1&${BUILD_PARAM}=${ID}`)).toBe(ID);
  });
  it("accepts the server's real build id shape: 32 hex characters, no dashes", () => {
    expect(buildIdFromSearch("?build=4d7ae5ffb96740b896887ac7e41f453d")).toBe("4d7ae5ffb96740b896887ac7e41f453d");
  });
  it("is null when absent or not an id (never attach to a guess)", () => {
    expect(buildIdFromSearch("")).toBeNull();
    expect(buildIdFromSearch("?build=")).toBeNull();
    expect(buildIdFromSearch("?build=not-an-id")).toBeNull();
    expect(buildIdFromSearch("?build=../../etc")).toBeNull();
  });
});

describe("hrefWithBuild", () => {
  it("sets the build id and keeps the rest of the address", () => {
    expect(hrefWithBuild("/agents/new/generate", "", ID)).toBe(`/agents/new/generate?build=${ID}`);
    expect(hrefWithBuild("/agents/new/generate", "?a=1", ID)).toBe(`/agents/new/generate?a=1&build=${ID}`);
  });
  it("replaces an earlier build id (a rebuild)", () => {
    const other = "11111111-2222-4333-8444-555555555555";
    expect(hrefWithBuild("/agents/new/generate", `?build=${other}`, ID)).toBe(`/agents/new/generate?build=${ID}`);
  });
  it("round-trips through buildIdFromSearch", () => {
    const href = hrefWithBuild("/agents/new/generate", "", ID);
    expect(buildIdFromSearch(href.slice(href.indexOf("?")))).toBe(ID);
  });
});
