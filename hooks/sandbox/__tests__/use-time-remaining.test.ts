import { computeTimeRemaining } from "@/hooks/sandbox/use-time-remaining";

describe("computeTimeRemaining", () => {
  it("renders the permanent-worker sentinel as no expiry", () => {
    expect(
      computeTimeRemaining("9999-12-31T23:59:59.999999", "minute"),
    ).toEqual({
      text: "No expiry",
      isExpired: false,
      millisRemaining: Number.POSITIVE_INFINITY,
    });
  });

  it("does not render NaN for an invalid timestamp", () => {
    expect(computeTimeRemaining("not-a-date", "minute")).toEqual({
      text: "--",
      isExpired: false,
      millisRemaining: 0,
    });
  });
});
