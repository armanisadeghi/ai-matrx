import { classifyContentVolume, formatChars } from "../contentVolume";

const stats = (
  html_len: number,
  text_len: number,
  draft_html_len = 0,
  draft_text_len = 0,
) => ({ html_len, text_len, draft_html_len, draft_text_len });

describe("classifyContentVolume", () => {
  it("returns null (claims nothing) when the computed field is absent", () => {
    expect(classifyContentVolume(null)).toBeNull();
    expect(classifyContentVolume(undefined)).toBeNull();
  });

  it("empty only when BOTH sides hold nothing", () => {
    expect(classifyContentVolume(stats(0, 0))!.stage).toBe("empty");
    expect(classifyContentVolume(stats(0, 0, 40, 5))!.stage).not.toBe("empty");
  });

  it("a coming-soon line is a stub, not a page", () => {
    // ~"<h1>Coming soon</h1>" scale
    expect(classifyContentVolume(stats(120, 11))!.stage).toBe("stub");
  });

  it("a small-but-real informational page is NOT a stub", () => {
    // half-a-screen of text with modest markup clears both stub bars
    const v = classifyContentVolume(stats(1400, 480))!;
    expect(v.stage).toBe("light");
  });

  it("style-heavy markup with thin text reads light, never full", () => {
    // the live html-preview case: 8,001 html chars, 187 visible-text chars
    expect(classifyContentVolume(stats(8001, 187))!.stage).toBe("light");
  });

  it("substantial text reads full", () => {
    expect(classifyContentVolume(stats(26496, 9932))!.stage).toBe("full");
  });

  it("grades the larger side and says so", () => {
    const v = classifyContentVolume(stats(0, 0, 5200, 900))!;
    expect(v.source).toBe("draft");
    expect(v.stage).toBe("full");
    expect(v.htmlDisplay).toBe("5.2k");
  });

  it("formatChars", () => {
    expect(formatChars(987)).toBe("987");
    expect(formatChars(1234)).toBe("1.2k");
    expect(formatChars(15600)).toBe("16k");
  });
});
