/**
 * Shared transcript-kind fixtures — the SINGLE source for the examples seeded
 * into `content_ir.kind_example` (migrations/kind_transcript_full.sql) and
 * validated by kind-transcript.test.ts. The test validates EXACTLY what the
 * migration seeds; if these drift from the migration file, the migration is
 * wrong (it is generated from this module).
 */

/**
 * Canonical example — the "Transcript With Speakers" union member: headers,
 * speaker dialogue, a speakerless bracketed sound annotation, a highlighted
 * segment. Mirrors the live `skill.render_definition` palette template.
 */
export const TRANSCRIPT_CANONICAL_EXAMPLE = {
  __kind: "transcript",
  title: "Quarterly Planning Meeting",
  subtitle: "Q3 Kickoff",
  segments: [
    {
      __kind: "transcript_segment",
      id: "segment-0",
      timecode: "00:05",
      seconds: 5,
      speaker: "Speaker A",
      text: "Hello and welcome to the meeting.",
    },
    {
      __kind: "transcript_segment",
      id: "segment-1",
      timecode: "00:12",
      seconds: 12,
      speaker: "Speaker B",
      text: "Thanks for having me. Glad to be here.",
    },
    {
      __kind: "transcript_segment",
      id: "segment-2",
      timecode: "00:20",
      seconds: 20,
      text: "[Sound of paper shuffling]",
    },
    {
      __kind: "transcript_segment",
      id: "segment-3",
      timecode: "00:26",
      seconds: 26,
      speaker: "Speaker A",
      text: "Let's start with the quarterly results.",
      isHighlighted: true,
    },
  ],
};

/**
 * Second example — the "Simple Transcript" union member: timecoded narration,
 * no speakers, no headers, minimal optional fields (no ids).
 */
export const TRANSCRIPT_SIMPLE_EXAMPLE = {
  __kind: "transcript",
  segments: [
    {
      __kind: "transcript_segment",
      timecode: "00:00",
      seconds: 0,
      text: "Text for the first thirty seconds of the recording.",
    },
    {
      __kind: "transcript_segment",
      timecode: "00:30",
      seconds: 30,
      text: "Text for the next thirty seconds of the recording.",
    },
  ],
};

/**
 * A REAL ```transcript fence BODY (inner text), shaped exactly like the live
 * "Transcript With Speakers" palette template output: boilerplate
 * "**Audio Transcription**" label (the legacy parser skips it), bracketed
 * `[HH:MM:SS]` timecodes, `Speaker X:` prefixes, and one speakerless sound
 * annotation line.
 */
export const TRANSCRIPT_REAL_FENCE_BODY = [
  "**Audio Transcription**",
  "",
  "[00:00:05] Speaker A: Hello and welcome to the meeting.",
  "[00:00:08] Speaker B: Thanks for having me.",
  "[00:00:30] Speaker B: And that's why the rollout slipped.",
  "[00:00:45] Speaker Unknown: Let's start with the first item.",
  "[00:00:52] [Sound of paper shuffling]",
  "[00:01:00] Speaker A: The quarterly results are looking positive.",
].join("\n");

/** The same region as a full fenced block (host framing tolerance). */
export const TRANSCRIPT_REAL_FENCE_REGION = [
  "```transcript",
  TRANSCRIPT_REAL_FENCE_BODY,
  "```",
].join("\n");

/** A titled fence body (headers + time-range sections, no speakers). */
export const TRANSCRIPT_TITLED_FENCE_BODY = [
  "# Budget Review Meeting",
  "",
  "## Finance Team Q4 Summary",
  "",
  "**0:00 - 2:30**",
  "Introduction and opening remarks.",
  "",
  "**2:30 - 5:45**",
  "Technical discussion about system architecture.",
].join("\n");
