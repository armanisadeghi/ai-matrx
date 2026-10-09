import { researchThisHref } from "./init-route";
import {
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
    expect(s).toEqual({ type: "brand", brandId: "b1", domain: "example.com", handles: { instagram: "@example" } });
  });
});
