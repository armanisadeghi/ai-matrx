import { accountLabels, accountName, lastPostLabel, postedLabel, postedTitle } from "../mappers";
import { formatSocialHandle, linkedInAddress } from "../../lib/social-handle";

const NOW = Date.parse("2026-10-10T12:00:00Z");

describe("an account's name is never a generated slug or a channel id", () => {
  it("drops the generated id from a LinkedIn slug", () => {
    expect(linkedInAddress("arman-sadeghi-8b176627")).toBe("linkedin.com/in/arman-sadeghi");
    expect(linkedInAddress("@arman-sadeghi")).toBe("linkedin.com/in/arman-sadeghi");
    expect(formatSocialHandle({ platform: "linkedin", handle: "arman-sadeghi-8b176627" })).toBe("linkedin.com/in/arman-sadeghi");
  });
  it("prefers a real name; falls back to the cleaned address, never @slug-id", () => {
    expect(accountLabels("Arman Sadeghi", "arman-sadeghi-8b176627", "linkedin").primary).toBe("Arman Sadeghi");
    expect(accountLabels("arman-sadeghi-8b176627", "arman-sadeghi-8b176627", "linkedin").primary).toBe("linkedin.com/in/arman-sadeghi");
    expect(accountName({ displayName: "", handle: "arman-sadeghi-8b176627", platform: "linkedin" })).not.toContain("8b176627");
  });
  it("shows a YouTube channel id as 'YouTube channel'", () => {
    expect(accountName({ displayName: "", handle: "UCF4Ku_RBslAbCdEfGhIjKlM", platform: "youtube" })).toBe("YouTube channel");
  });
});

describe("a post's date is readable at any age", () => {
  const old = "2014-03-05T10:00:00Z";
  it("relative inside a year, a date after", () => {
    expect(postedLabel("2026-10-07T12:00:00Z", NOW)).toBe("3d");
    expect(postedLabel(old, NOW)).toBe("Mar 5, 2014");
    expect(lastPostLabel(old, 15, NOW)).toBe("Mar 5, 2014");
    expect(lastPostLabel("2026-10-07T12:00:00Z", 3, NOW)).toBe("3d ago");
  });
  it("says the full date and the age in words", () => {
    expect(postedTitle(old, NOW)).toBe("March 5, 2014 · 12 years ago");
  });
});
