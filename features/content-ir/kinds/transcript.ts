/**
 * transcript kind → TranscriptBlock bridge + (unregistered) KindDefinitions.
 *
 * The chat TRANSCRIPT render block (fence language `transcript`;
 * components/mardown-display/blocks/transcripts/) — NOT the
 * features/transcripts audio-transcription domain. One kind covers the union
 * of both live palette variants (skill.render_definition rows `transcript`
 * "Transcript With Speakers" and `simple-transcript` "Simple Transcript" —
 * both emit the SAME ```transcript fence): a segment's `speaker` is optional,
 * so timecoded narration and speaker dialogue are the same shape. Bracketed
 * sound/action annotations (e.g. "[Sound of paper shuffling]") are segments
 * whose `text` carries the bracketed cue and whose `speaker` is omitted —
 * exactly what the legacy parser produces for those lines.
 *
 * Field inventory mirrors the REAL component contract
 * (`ParsedTranscript` in transcript-parser.ts + `TranscriptSegment` in
 * AdvancedTranscriptViewer.tsx): title/subtitle headers + segments carrying
 * id/timecode/seconds/text/speaker/isHighlighted. The bridge builds that
 * exact `ParsedTranscript` shape (typed against the real component imports,
 * so drift is a compile error), defaulting the parser-guaranteed fields the
 * kind leaves optional (`id` → "segment-<i>", `timecode` → "00:00",
 * `seconds` → 0 — the parser's own conventions).
 *
 * NOT registered in system-kinds.ts yet — the central integration pass
 * spreads TRANSCRIPT_KIND_DEFINITIONS into the compiled registry (and wires
 * the fence-finalize host, which does not exist yet; XML only today).
 */

import type { ParsedTranscript } from "@/components/mardown-display/blocks/transcripts/transcript-parser";
import type { TranscriptSegment } from "@/components/mardown-display/blocks/transcripts/AdvancedTranscriptViewer";
import { KIND_KEY } from "../core/kind-schema.types";
import type { KindDefinition } from "../registry/kind-registry.types";
import {
  additionalDetailsSection,
  collectExtras,
  extrasList,
  isRecordValue,
  joinBlocks,
} from "./kind-markdown-utils";
import { isRecord, makeCompleteEnvelopeBridge } from "./legacy-bridge-utils";

// ---------------------------------------------------------------------------
// Legacy-bridge facet — kind value → the component's ParsedTranscript.
// ---------------------------------------------------------------------------

/** The component's fallback anchor for segments with no time marker. */
const DEFAULT_TIMECODE = "00:00";

type BridgeSegment = TranscriptSegment & Record<string, unknown>;

function mapSegment(
  segment: Record<string, unknown>,
  index: number,
): BridgeSegment | null {
  // The legacy parser's pushSegment law: a segment with no text is dropped.
  const text = typeof segment.text === "string" ? segment.text.trim() : "";
  if (text === "") return null;

  const mapped: BridgeSegment = {
    id:
      typeof segment.id === "string" && segment.id !== ""
        ? segment.id
        : `segment-${index}`, // the parser's own id convention
    timecode:
      typeof segment.timecode === "string" && segment.timecode !== ""
        ? segment.timecode
        : DEFAULT_TIMECODE,
    seconds: typeof segment.seconds === "number" ? segment.seconds : 0,
    text,
  };
  if (typeof segment.speaker === "string" && segment.speaker.trim() !== "") {
    mapped.speaker = segment.speaker.trim();
  }
  if (typeof segment.isHighlighted === "boolean") {
    mapped.isHighlighted = segment.isHighlighted;
  }

  // Zero data loss: unknown segment keys ride along (the viewer ignores
  // them). `__kind` is transport metadata — never forwarded.
  for (const [key, value] of Object.entries(segment)) {
    if (key === KIND_KEY) continue;
    if (key in mapped || key === "speaker" || key === "isHighlighted") continue;
    mapped[key] = value;
  }

  return mapped;
}

/**
 * Reconstructed, kind-stripped transcript value → the EXACT
 * `ParsedTranscript` the real viewer consumes (typed against the component
 * imports). Undefined when no renderable segment exists — the caller
 * declines and the raw-content parse path stands.
 */
export function transcriptParsedFromValue(
  value: Record<string, unknown>,
): (ParsedTranscript & Record<string, unknown>) | undefined {
  const rawSegments = value.segments;
  if (!Array.isArray(rawSegments)) return undefined;

  const segments: TranscriptSegment[] = [];
  for (let i = 0; i < rawSegments.length; i++) {
    const raw = rawSegments[i];
    if (!isRecord(raw)) continue;
    const mapped = mapSegment(raw, segments.length);
    if (mapped) segments.push(mapped);
  }
  if (segments.length === 0) return undefined;

  const parsed: ParsedTranscript & Record<string, unknown> = {
    title:
      typeof value.title === "string" && value.title.trim() !== ""
        ? value.title
        : null,
    subtitle:
      typeof value.subtitle === "string" && value.subtitle.trim() !== ""
        ? value.subtitle
        : null,
    segments,
  };

  // Zero data loss at the top level too (`__kind` never forwarded).
  for (const [key, child] of Object.entries(value)) {
    if (key === KIND_KEY) continue;
    if (key === "title" || key === "subtitle" || key === "segments") continue;
    parsed[key] = child;
  }

  return parsed;
}

/**
 * Complete-only bridge (family recipe: legacy-bridge-utils). While a fence
 * region streams, TranscriptBlock keeps parsing the partial `content` text
 * exactly as today; the envelope-derived serverData exists for the routed
 * `__kind` JSON arrival and the dual gate's render leg.
 */
export const transcriptServerDataFromEnvelope = makeCompleteEnvelopeBridge(
  "transcript",
  (value) => transcriptParsedFromValue(value),
);

// ---------------------------------------------------------------------------
// toMarkdown facet — transcript → readable timecoded dialogue markdown.
// ---------------------------------------------------------------------------

const SEGMENT_KNOWN_KEYS = [
  "id",
  "timecode",
  "seconds",
  "text",
  "speaker",
  "isHighlighted",
];

const ROOT_KNOWN_KEYS = ["title", "subtitle", "segments"];

function segmentLine(segment: Record<string, unknown>): string | null {
  const text = typeof segment.text === "string" ? segment.text.trim() : "";
  if (text === "") return null;

  const labelParts: string[] = [];
  if (typeof segment.timecode === "string" && segment.timecode !== "") {
    labelParts.push(`[${segment.timecode}]`);
  }
  if (typeof segment.speaker === "string" && segment.speaker.trim() !== "") {
    labelParts.push(`${segment.speaker.trim()}:`);
  }

  const line =
    labelParts.length > 0
      ? `- **${labelParts.join(" ")}** ${text}`
      : `- ${text}`;

  const meta = extrasList(collectExtras(segment, SEGMENT_KNOWN_KEYS));
  if (!meta) return line;
  // Nested bullets stay inside the parent list item (no blank lines).
  return [line, meta.replace(/^- /gm, "  - ")].join("\n");
}

export function transcriptMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const title =
    typeof value.title === "string" && value.title.trim() !== ""
      ? value.title
      : "Transcript";
  const subtitle =
    typeof value.subtitle === "string" && value.subtitle.trim() !== ""
      ? `## ${value.subtitle}`
      : null;

  const segments = Array.isArray(value.segments)
    ? value.segments.filter(isRecordValue)
    : [];
  const lines = segments
    .map(segmentLine)
    .filter((line): line is string => line !== null);

  return joinBlocks([
    `# ${title}`,
    subtitle,
    lines.length > 0 ? lines.join("\n") : null,
    additionalDetailsSection(collectExtras(value, ROOT_KNOWN_KEYS)),
  ]);
}

// ---------------------------------------------------------------------------
// KindDefinitions — exported for the central integration pass to spread into
// SYSTEM_KIND_DEFINITIONS (this file makes NO registration edits).
// ---------------------------------------------------------------------------

export const TRANSCRIPT_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: "transcript",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "transcript",
    toLegacyServerData: transcriptServerDataFromEnvelope,
    toMarkdown: transcriptMarkdownFromValue,
    artifact: { canvasType: "transcript" },
    persistence: { persistStructured: true },
    schema: {
      kind: "transcript",
      fields: {
        // The legacy parser emits `string | null` for both headers — nullable
        // AND optional so every arrival shape validates.
        title: { type: "string", nullable: true },
        subtitle: { type: "string", nullable: true },
        segments: {
          type: "array",
          itemKinds: ["transcript_segment"],
          required: true,
        },
        additionalDetails: { type: "inline_object", fields: {} },
      },
    },
  },
  {
    kind: "transcript_segment",
    schemaSource: "system",
    tier: "eager",
    schema: {
      kind: "transcript_segment",
      fields: {
        // The spoken text — or a bracketed sound/action annotation (e.g.
        // "[Sound of paper shuffling]") when no one is speaking.
        text: { type: "string", required: true },
        // Omitted for the "simple" (narration-only) variant and annotations.
        speaker: { type: "string" },
        // Display timecode: "MM:SS", "HH:MM:SS", or a range "MM:SS - MM:SS".
        timecode: { type: "string" },
        // Start offset in seconds (drives seek-on-click in the viewer).
        seconds: { type: "number" },
        id: { type: "string" },
        isHighlighted: { type: "boolean" },
      },
    },
  },
];
