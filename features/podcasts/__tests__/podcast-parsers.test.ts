/**
 * Parser tests for the podcast cluster's readers (Agent Manifest Campaign,
 * Wave 3 frontend lane): the ONE title reader, the ONE chapter reader (+ the
 * persistence wrapper), the `episode_chapters` write validator, and the small
 * pure text builders the generators use. Fixtures mirror the kinds' real
 * sample shapes (`episode_title_options`, `media_chapters`).
 */

import { readEpisodeTitleOptionsValue } from "@/features/content-ir/kinds/episode-title-options";
import { readChapterList } from "@/features/content-ir/kinds/media-chapters";
import { parseChapters } from "@/features/podcasts/types";
import { parseChaptersWrite } from "@/features/podcasts/studio/components/EpisodeChaptersPanel";
import { topicFromIdea } from "@/features/podcasts/generator/topic-idea";
import {
  episodeMetadata,
  headingTitle,
} from "@/features/podcasts/generator/useEpisodeArticles";
import type { PcEpisodeWithShow } from "@/features/podcasts/types";

// ── the unified title reader ─────────────────────────────────────────────────

const TITLE_OPTIONS_FIXTURE = {
  __kind: "episode_title_options",
  working_title: "Episode 12: The Old Title",
  options: [
    {
      __kind: "episode_title_option",
      title: "The Quiet Boom Nobody Reported",
      subtitle: "An economy growing off-camera",
      rationale: "Curiosity gap plus a concrete search phrase.",
    },
    // Mid-stream partial: no title yet — must be dropped, not blanked in.
    { __kind: "episode_title_option", subtitle: "half-parsed" },
    // Whitespace title is not a title; absent subtitle/rationale stay null.
    { __kind: "episode_title_option", title: "   " },
    { __kind: "episode_title_option", title: "Growth They Didn't Show You" },
  ],
};

describe("readEpisodeTitleOptionsValue (the ONE title reader)", () => {
  it("keeps working_title and preserves null (not \"\") for absent fields", () => {
    const parsed = readEpisodeTitleOptionsValue(TITLE_OPTIONS_FIXTURE);
    expect(parsed.workingTitle).toBe("Episode 12: The Old Title");
    expect(parsed.options).toHaveLength(2);
    expect(parsed.options[0]).toMatchObject({
      title: "The Quiet Boom Nobody Reported",
      subtitle: "An economy growing off-camera",
      rationale: "Curiosity gap plus a concrete search phrase.",
      index: 0,
    });
    expect(parsed.options[1].subtitle).toBeNull();
    expect(parsed.options[1].rationale).toBeNull();
    // Raw index survives filtering — it is the envelope nodeIndex key.
    expect(parsed.options[1].index).toBe(3);
  });

  it("returns an empty, null-titled result for junk input", () => {
    expect(readEpisodeTitleOptionsValue(null)).toEqual({
      workingTitle: null,
      options: [],
    });
    expect(readEpisodeTitleOptionsValue({ options: "nope" }).options).toEqual([]);
  });
});

// ── the unified chapter reader + persistence wrapper ─────────────────────────

const CHAPTERS_FIXTURE = [
  { __kind: "media_chapter", start_hint: "00:00", title: "Cold open", summary: "Why this story matters." },
  // Title not closed yet mid-stream — dropped.
  { __kind: "media_chapter", start_hint: "03:15" },
  { __kind: "media_chapter", start_hint: "07:42", title: "The numbers", summary: "" },
];

describe("readChapterList (the ONE chapter reader)", () => {
  it("reads well-formed chapters and drops title-less partials", () => {
    const list = readChapterList(CHAPTERS_FIXTURE);
    expect(list).toEqual([
      { start_hint: "00:00", title: "Cold open", summary: "Why this story matters." },
      { start_hint: "07:42", title: "The numbers", summary: "" },
    ]);
  });

  it("returns [] for non-arrays", () => {
    expect(readChapterList({ chapters: CHAPTERS_FIXTURE })).toEqual([]);
  });
});

describe("parseChapters (persistence wrapper over readChapterList)", () => {
  it("unwraps { chapters } and null-collapses empty results", () => {
    expect(parseChapters({ chapters: CHAPTERS_FIXTURE })).toHaveLength(2);
    expect(parseChapters({ chapters: [] })).toBeNull();
    expect(parseChapters("not-an-object")).toBeNull();
    expect(parseChapters(CHAPTERS_FIXTURE)).toBeNull(); // bare array: no wrapper key
  });
});

// ── the episode_chapters write validator ─────────────────────────────────────

const validChapter = (i: number) => ({
  start_hint: `${String(i).padStart(2, "0")}:00`,
  title: `Chapter ${i}`,
  summary: `Summary ${i}`,
});

describe("parseChaptersWrite (episode_chapters validator)", () => {
  it("accepts a valid list and trims fields", () => {
    const out = parseChaptersWrite({
      chapters: [
        { start_hint: " 00:00 ", title: " Intro ", summary: " Hello. " },
        { start_hint: "1:02:03", title: "Deep dive" },
      ],
    });
    expect(out).toEqual([
      { start_hint: "00:00", title: "Intro", summary: "Hello." },
      { start_hint: "1:02:03", title: "Deep dive", summary: "" },
    ]);
  });

  it("enforces MAX_CHAPTERS", () => {
    const chapters = Array.from({ length: 25 }, (_, i) => validChapter(i));
    expect(() => parseChaptersWrite({ chapters })).toThrow(/at most 24/);
  });

  it("enforces the title and summary char caps", () => {
    expect(() =>
      parseChaptersWrite({
        chapters: [{ start_hint: "00:00", title: "x".repeat(121) }],
      }),
    ).toThrow(/120 characters or fewer/);
    expect(() =>
      parseChaptersWrite({
        chapters: [
          { start_hint: "00:00", title: "ok", summary: "y".repeat(301) },
        ],
      }),
    ).toThrow(/300 characters or fewer/);
  });

  it("enforces the MM:SS / HH:MM:SS start_hint shape", () => {
    for (const bad of ["90 seconds", "1:2:3:4", "00:79", ""]) {
      expect(() =>
        parseChaptersWrite({ chapters: [{ start_hint: bad, title: "T" }] }),
      ).toThrow(/MM:SS or HH:MM:SS/);
    }
    expect(
      parseChaptersWrite({
        chapters: [{ start_hint: "59:59", title: "edge" }],
      })[0].start_hint,
    ).toBe("59:59");
  });

  it("rejects an empty or missing list", () => {
    expect(() => parseChaptersWrite({ chapters: [] })).toThrow(/non-empty/);
    expect(() => parseChaptersWrite({})).toThrow(/non-empty/);
  });
});

// ── topicFromIdea — the WHOLE idea comes across (D151) ───────────────────────

describe("topicFromIdea", () => {
  it("flattens title + hook + every other field as labeled lines, skipping meta", () => {
    const topic = topicFromIdea({
      __kind: "topic_idea",
      id: "idea-3",
      index: 3,
      selected: true,
      title: "The Comeback Nobody Covered",
      hook: "A collapsing industry quietly tripled.",
      angle: "Contrarian data story",
      why_now: "New Q2 numbers just landed",
      suggested_segments: ["The fall", "The pivot", "The numbers"],
    });
    expect(topic).toBe(
      "The Comeback Nobody Covered\n\n" +
        "A collapsing industry quietly tripled.\n\n" +
        "Angle: Contrarian data story\n" +
        "Why now: New Q2 numbers just landed\n" +
        "Suggested segments: The fall; The pivot; The numbers",
    );
  });

  it("passes strings through and returns \"\" for junk", () => {
    expect(topicFromIdea("just a topic")).toBe("just a topic");
    expect(topicFromIdea(["not", "an", "idea"])).toBe("");
  });
});

// ── headingTitle + episodeMetadata ───────────────────────────────────────────

describe("headingTitle", () => {
  it("reads the leading H1 and returns null when the first line is not one", () => {
    expect(headingTitle("\n\n# My Article Title\n\nBody…")).toBe(
      "My Article Title",
    );
    expect(headingTitle("Intro paragraph first\n# Late H1")).toBeNull();
    expect(headingTitle("## Only an H2")).toBeNull();
  });
});

describe("episodeMetadata", () => {
  it("builds the shared show/episode context JSON off the episode row", () => {
    const episode = {
      id: "ep-1",
      title: "Episode 7: Signals",
      description: "What the data says.",
      episode_number: 7,
      slug: "signals",
      speakers: [
        { name: "Ava", voice: "voice-a" },
        { name: "Ben", voice: "voice-b" },
      ],
      show: {
        title: "Underreported",
        description: "Good news, sourced.",
        slug: "underreported",
      },
    } as unknown as PcEpisodeWithShow;

    expect(episodeMetadata(episode)).toEqual({
      show_name: "Underreported",
      show_description: "Good news, sourced.",
      show_url: "/podcast/underreported",
      host_names: ["Ava", "Ben"],
      episode_title: "Episode 7: Signals",
      episode_description: "What the data says.",
      episode_number: 7,
      guest_names: [],
      episode_url: "/podcast/signals",
      referenced_links: [],
      keywords: [],
      related_episodes: [],
    });
  });
});
