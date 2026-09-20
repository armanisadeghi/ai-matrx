import { whenPhrase } from "./labels";

describe("whenPhrase", () => {
  test.each([
    [-2, "eligible for deletion"],
    [-1, "eligible for deletion"],
    [0, "today"],
    [1, "tomorrow"],
    [6, "in 6 days"],
  ])("reports %i days as %s", (daysLeft, expected) => {
    expect(whenPhrase(daysLeft)).toBe(expected);
  });
});
