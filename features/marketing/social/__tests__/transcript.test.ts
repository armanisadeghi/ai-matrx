import { formatTimestamp, languageName, parseTranscript, plainTranscript, wordCountOf } from "../transcript";

const VTT = `WEBVTT
Kind: captions
Language: en

00:00:00.160 --> 00:00:03.000
You have to stop waiting
for permission.

00:00:03.000 --> 00:00:05.500 align:start
for permission.
Nobody is coming.

NOTE rolling

00:00:05.500 --> 00:00:09.000
<00:00:05.600><c>Nobody is coming.</c>
Start today.`;

describe("parseTranscript", () => {
  it("never leaks WebVTT header, timings or tags, and drops rolling repeats", () => {
    const p = parseTranscript(VTT);
    const joined = plainTranscript(p);
    expect(joined).not.toMatch(/WEBVTT|-->|<c>|Kind:/);
    expect(joined).toBe("You have to stop waiting for permission. Nobody is coming. Start today.");
    expect(p[0]!.start).toBeCloseTo(0.16);
  });
  it("splits plain text into paragraphs without timings", () => {
    const p = parseTranscript("First.\n\nSecond one.");
    expect(p).toEqual([{ start: null, text: "First." }, { start: null, text: "Second one." }]);
    expect(wordCountOf(p)).toBe(3);
  });
  it("is empty for empty input", () => {
    expect(parseTranscript("  ")).toEqual([]);
  });
});

describe("languageName / formatTimestamp", () => {
  it("hides unknown codes and names real ones", () => {
    expect(languageName("und")).toBeNull();
    expect(languageName("")).toBeNull();
    expect(languageName("en")).toBe("English");
  });
  it("formats timestamps", () => {
    expect(formatTimestamp(65)).toBe("1:05");
    expect(formatTimestamp(3723)).toBe("1:02:03");
  });
});
