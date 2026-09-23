import { reachabilityCoverage } from "./reachability-coverage";

describe("reachability source boundary", () => {
  it("reports an exact short RPC answer but not a response at the cap", () => {
    expect(reachabilityCoverage("reachable item", 999)).toEqual({
      loaded: 999,
      total: 999,
      answeredBy: "client",
      noun: "reachable item",
    });
    expect(reachabilityCoverage("reachable item", 1_000)).toEqual({
      loaded: 1_000,
      cap: 1_000,
      answeredBy: "client",
      noun: "reachable item",
    });
  });
});
