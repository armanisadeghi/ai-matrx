/**
 * THE LINK DOOR TAKES A YOUTUBE VIDEO, AND THERE IS ONE YOUTUBE DETECTOR.
 *
 * The defect (teach-recent-interview trial, 2026-09-15): a non-technical
 * Expert pasted a 68-minute interview's YouTube URL into a Rulebook's
 * "Add a link" box — the most obvious door in the product — and was refused:
 *
 *   "This appears to be a YouTube video — this box reads web pages only.
 *    Use Upload or Add file to bring it in."
 *
 * Both halves were wrong. The advice was false (neither Upload nor Add file
 * takes a URL), and the refusal was unnecessary: the very panel hosting that
 * box stages URLs into `/masterworks/ingest-dump`, whose server path already
 * branches on a YouTube URL to `capture_youtube_transcript` and comes back
 * with a transcript AND its time anchors. The capability was there; only the
 * client said no. She could not get the video in at all, and the trial ended
 * with 0 rules.
 *
 * The refusal came from a LOCAL copy of YouTube detection — one of several in
 * this directory, each subtly different, none of them the canonical parser in
 * `lib/media/youtube.ts` whose own header says not to re-implement it.
 *
 * These tests hold both halves: the acceptance decision, and the census.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { detectUrlType } from "./WebpageResourcePicker";

const WATCH_URL = "https://www.youtube.com/watch?v=JOh-9iaPcGU";
const DIR = __dirname;

describe("the Rulebook link door and a YouTube video", () => {
  it("recognizes a watch URL as a video, in every shape a person pastes", () => {
    expect(detectUrlType(WATCH_URL)).toBe("youtube");
    expect(detectUrlType("youtube.com/watch?v=JOh-9iaPcGU")).toBe("youtube");
    expect(detectUrlType("https://youtu.be/JOh-9iaPcGU")).toBe("youtube");
    expect(detectUrlType("https://www.youtube.com/shorts/JOh-9iaPcGU")).toBe(
      "youtube",
    );
  });

  it("tells a channel page apart from a video, instead of refusing both the same way", () => {
    expect(detectUrlType("https://www.youtube.com/@theknowledgeproject")).toBe(
      "youtube_channel",
    );
    expect(detectUrlType("https://example.com/an-article")).toBe("webpage");
  });

  it("stages the video instead of dead-ending, when the host can take a URL", () => {
    // The host contract: a panel that passes `onFileUrl` sends the URL to the
    // same server ingest lane that reads YouTube transcripts. The picker must
    // hand the video over rather than refuse it.
    const source = readFileSync(join(DIR, "WebpageResourcePicker.tsx"), "utf8");
    const youtubeBranch = source.slice(
      source.indexOf('if (detectedType === "youtube") {'),
      source.indexOf('if (detectedType === "youtube_channel")'),
    );
    expect(youtubeBranch).toContain("onFileUrl");
    expect(youtubeBranch).toContain("setStagedYouTube(true)");
  });

  it("never ships the advice that sent people to doors which do not take a URL", () => {
    const source = readFileSync(join(DIR, "WebpageResourcePicker.tsx"), "utf8");
    // Comments recording WHY the copy changed are not the copy.
    const shipped = source
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join("\n");
    expect(shipped).not.toContain("Use Upload or Add file to bring it in");
  });
});

describe("there is ONE YouTube detector", () => {
  it("no resource picker re-implements YouTube host or id extraction", () => {
    const offenders: string[] = [];
    for (const file of readdirSync(DIR)) {
      if (!/\.(ts|tsx)$/.test(file) || file.endsWith(".test.ts")) continue;
      const source = readFileSync(join(DIR, file), "utf8");
      for (const [index, line] of source.split("\n").entries()) {
        // Comments explaining the rule are not violations of it.
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
        // A user-facing example URL or a thumbnail/oembed endpoint is not a
        // detector; a hostname TEST is.
        if (/hostname[^\n]*(youtube\.com|youtu\.be)/.test(line)) {
          offenders.push(`${file}:${index + 1}`);
        }
        if (/\/\s*\(\?:youtube\\?\.com|youtu\\?\.be\)/.test(line)) {
          offenders.push(`${file}:${index + 1}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
