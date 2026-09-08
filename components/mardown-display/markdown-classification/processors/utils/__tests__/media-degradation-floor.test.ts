/**
 * THE DEGRADATION FLOOR — HALF TWO of the acceptance test for Arman's
 * 2026-09-08 media-kind ruling, in his words:
 *
 *   "we don't want to lose the ability to handle text and still process it in
 *    the same way by putting it into a specific structured kind. We're
 *    providing our user interface and the rest of the code base more specific
 *    instructions. But in case those instructions are not included, the system
 *    should still do its best to handle them as it does now."
 *
 * "as it does now" is what this file pins. These detectors are what turns a
 * BARE URL — no kind, no schema, no structure — into a playable/viewable
 * block, and they had NO tests when the `media_asset` kind was added. The kind
 * is a purely ADDITIONAL richer path; if any expectation below changes, the
 * floor moved and the ruling was broken.
 *
 * Deliberately NOT asserted: bare-video sniffing. There is no
 * extension-based video detector today (only the `[Video URL: …]` custom
 * form), and that asymmetry with audio is left exactly as found, pending
 * Arman's answer. Adding one here would itself be a change to the floor.
 */

import {
  AUDIO_URL_EXT,
  countInlineImages,
  detectImageMarkdown,
  detectVideoMarkdown,
  extractAudioLink,
} from "../content-splitter-v2";

describe("floor: markdown image detection (bare string, no kind)", () => {
  it("standard ![alt](url)", () => {
    expect(detectImageMarkdown("![A cat](https://x.test/cat.png)")).toEqual({
      isImage: true,
      alt: "A cat",
      src: "https://x.test/cat.png",
    });
  });

  it("keeps working with a markdown title after the URL", () => {
    expect(
      detectImageMarkdown('![A cat](https://x.test/cat.png "Tabby")'),
    ).toEqual({
      isImage: true,
      alt: "A cat",
      src: "https://x.test/cat.png",
    });
  });

  it("the backend custom form [Image URL: …]", () => {
    expect(detectImageMarkdown("[Image URL: https://x.test/a.jpg]")).toEqual({
      isImage: true,
      alt: "Image",
      src: "https://x.test/a.jpg",
    });
  });

  it("reference-style images stay text (their URL lives elsewhere)", () => {
    expect(detectImageMarkdown("![A cat][cat-ref]")).toEqual({ isImage: false });
  });

  it("a plain sentence is not an image", () => {
    expect(detectImageMarkdown("Here is a picture of a cat.")).toEqual({
      isImage: false,
    });
  });

  it("one image per line becomes a block; two stay inline", () => {
    expect(countInlineImages("![a](https://x.test/1.png)")).toBe(1);
    expect(
      countInlineImages("![a](https://x.test/1.png) ![b](https://x.test/2.png)"),
    ).toBe(2);
  });
});

describe("floor: audio extension sniffing (bare string, no kind)", () => {
  it("every recognized extension still matches", () => {
    for (const ext of [
      "mp3",
      "wav",
      "m4a",
      "aac",
      "ogg",
      "oga",
      "opus",
      "flac",
      "weba",
      "webm",
    ]) {
      expect(AUDIO_URL_EXT.test(`https://x.test/clip.${ext}`)).toBe(true);
    }
    expect(AUDIO_URL_EXT.test("https://x.test/clip.png")).toBe(false);
  });

  it("a signed URL still matches — the extension sits before the query", () => {
    expect(
      AUDIO_URL_EXT.test("https://x.test/clip.mp3?X-Amz-Signature=abc"),
    ).toBe(true);
  });

  it("a bare audio URL on its own line", () => {
    expect(extractAudioLink("https://x.test/clip.mp3")).toEqual({
      src: "https://x.test/clip.mp3",
      alt: "Audio",
    });
  });

  it("a whole-line markdown link to an audio file", () => {
    expect(extractAudioLink("[Episode 3](https://x.test/ep3.m4a)")).toEqual({
      src: "https://x.test/ep3.m4a",
      alt: "Episode 3",
    });
  });

  it("the backend custom form [Audio URL: …]", () => {
    expect(extractAudioLink("[Audio URL: https://x.test/a.wav]")).toEqual({
      src: "https://x.test/a.wav",
      alt: "Audio",
    });
  });

  it("an inline link inside a sentence stays an ordinary link", () => {
    expect(
      extractAudioLink("Listen to [it](https://x.test/a.mp3) when you can."),
    ).toBeNull();
  });

  it("a non-audio URL is not audio", () => {
    expect(extractAudioLink("https://x.test/page.html")).toBeNull();
  });
});

describe("floor: video detection (bare string, no kind)", () => {
  it("the backend custom form [Video URL: …]", () => {
    expect(detectVideoMarkdown("[Video URL: https://x.test/v.mp4]")).toEqual({
      isVideo: true,
      alt: "Video",
      src: "https://x.test/v.mp4",
    });
  });

  it("a bare .mp4 URL is deliberately NOT sniffed — unchanged asymmetry", () => {
    expect(detectVideoMarkdown("https://x.test/v.mp4")).toEqual({
      isVideo: false,
    });
  });
});
