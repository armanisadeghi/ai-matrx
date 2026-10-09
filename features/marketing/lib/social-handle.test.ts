import { formatSocialHandle } from "./social-handle";

describe("formatSocialHandle", () => {
  it("writes ordinary handles with @", () => {
    expect(formatSocialHandle({ platform: "instagram", handle: "lajollakayak" })).toBe("@lajollakayak");
    expect(formatSocialHandle({ platform: "x", handle: "@acme" })).toBe("@acme");
  });
  it("tells a subreddit from a user on Reddit, never @", () => {
    expect(formatSocialHandle({ platform: "reddit", handle: "r/sandiegokayaking" })).toBe("r/sandiegokayaking");
    expect(formatSocialHandle({ platform: "reddit", handle: "u/harborlightkayak" })).toBe("u/harborlightkayak");
    expect(formatSocialHandle({ platform: "reddit", handle: "/user/harborlightkayak" })).toBe("u/harborlightkayak");
  });
  it("uses the profile link to classify a bare Reddit name", () => {
    expect(
      formatSocialHandle({ platform: "reddit", handle: "sandiegokayaking", url: "https://www.reddit.com/r/sandiegokayaking" }),
    ).toBe("r/sandiegokayaking");
    expect(
      formatSocialHandle({ platform: "reddit", handle: "harborlightkayak", url: "https://www.reddit.com/user/harborlightkayak/" }),
    ).toBe("u/harborlightkayak");
  });
  it("is empty for no handle", () => {
    expect(formatSocialHandle({ platform: "reddit", handle: "" })).toBe("");
  });
});
