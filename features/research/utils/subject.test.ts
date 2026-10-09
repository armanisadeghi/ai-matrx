import { researchThisHref } from "./init-route";
import {
  SOCIAL_PLATFORMS,
  subjectColumns,
  subjectFromBrandProperties,
  subjectFromParams,
} from "./subject";

describe("typed research subject", () => {
  it("round-trips a creator subject through the intake URL", () => {
    const href = researchThisHref({
      name: "Alex Hormozi",
      subject: { type: "creator", domain: "acquisition.com", handles: { instagram: "hormozi", tiktok: " " } },
    });
    const url = new URL(href, "https://aimatrx.local");
    expect(url.searchParams.get("topic")).toBe("Alex Hormozi");
    const back = subjectFromParams(url.searchParams);
    expect(back.type).toBe("creator");
    expect(back.domain).toBe("acquisition.com");
    expect(back.handles).toEqual({ instagram: "hormozi" });
  });

  it("writes null type for an untyped topic and drops blank handles", () => {
    expect(subjectColumns({ type: "topic" })).toEqual({ subject_type: null, subject: {} });
    expect(subjectColumns({ type: "person", handles: { x: "  " } })).toEqual({
      subject_type: "person",
      subject: {},
    });
  });

  it("reads a brand's website and social properties", () => {
    const s = subjectFromBrandProperties("b1", [
      { kind: "website", url: "https://www.example.com/about", handle: null },
      { kind: "instagram", url: null, handle: "@example" },
      { kind: "google_business_profile", url: "https://g.page/x", handle: null },
    ]);
    expect(s).toEqual({ type: "brand", brandId: "b1", domain: "example.com", handles: { instagram: "example" } });
  });

  it("normalizes prefilled profile URLs to bare handles for every platform, Reddit and Snapchat included", () => {
    const s = subjectFromBrandProperties("b1", [
      { kind: "instagram", url: "https://www.instagram.com/allgreen_itad/?hl=en", handle: null },
      { kind: "reddit", url: "https://www.reddit.com/user/allgreen/", handle: null },
      { kind: "snapchat", url: "https://www.snapchat.com/add/allgreen", handle: null },
      { kind: "x", url: null, handle: "@allgreen" },
    ]);
    expect(s.handles).toEqual({ instagram: "allgreen_itad", reddit: "allgreen", snapchat: "allgreen", x: "allgreen" });
  });

  it("a brand with a subreddit and a u/ account is identified by the u/ account, in either order", () => {
    const sub = { kind: "reddit", url: "https://www.reddit.com/r/sandiegokayaking", handle: null };
    const user = { kind: "reddit", url: null, handle: "u/harborlightkayak" };
    expect(subjectFromBrandProperties("b1", [sub, user]).handles?.reddit).toBe("harborlightkayak");
    expect(subjectFromBrandProperties("b1", [user, sub]).handles?.reddit).toBe("harborlightkayak");
  });

  it("a brand with only a subreddit carries it as a community, not a person", () => {
    const s = subjectFromBrandProperties("b1", [{ kind: "reddit", url: null, handle: "r/sandiegokayaking" }]);
    expect(s.handles?.reddit).toBe("r/sandiegokayaking");
  });

  it("offers a handle field for Reddit and Snapchat", () => {
    const values = SOCIAL_PLATFORMS.map((p) => p.value);
    expect(values).toEqual(expect.arrayContaining(["reddit", "snapchat"]));
  });

  it("stores normalized handles when a URL is pasted into the intake", () => {
    const cols = subjectColumns({ type: "brand", handles: { instagram: "https://www.instagram.com/allgreen_itad/?hl=en" } });
    expect(cols.subject.handles).toEqual({ instagram: "allgreen_itad" });
  });
});
