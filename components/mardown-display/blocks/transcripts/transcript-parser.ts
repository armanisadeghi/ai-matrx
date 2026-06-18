import { TranscriptSegment } from "./AdvancedTranscriptViewer";

export type ParsedTranscript = {
  /** Main title: `# …` or standalone `**…**` (exact text, not modified). */
  title: string | null;
  /** Secondary header: first `##` or `###` after a main title (exact text). */
  subtitle: string | null;
  segments: TranscriptSegment[];
};

type TimeAnchor = {
  timecode: string;
  seconds: number;
};

function parseTimeToken(raw: string): TimeAnchor {
  const parts = raw
    .trim()
    .split(":")
    .map((p) => parseInt(p, 10));
  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  if (parts.some((p) => Number.isNaN(p))) {
    return { timecode: "00:00", seconds: 0 };
  }

  if (parts.length === 3) {
    hours = parts[0];
    minutes = parts[1];
    seconds = parts[2];
  } else if (parts.length === 2) {
    minutes = parts[0];
    seconds = parts[1];
  } else {
    return { timecode: "00:00", seconds: 0 };
  }

  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  const timecode =
    hours > 0
      ? `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
      : `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

  return { timecode, seconds: totalSeconds };
}

/** Legacy bracket lines use unpadded minutes when under one hour (e.g. `0:30`). */
function formatLegacyBracketTimecode(
  hours: number,
  minutes: number,
  seconds: number,
): string {
  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

const BOILERPLATE_TITLE_RE = /^(?:audio transcription|full transcription)$/i;

const TIME_RANGE_BOLD_RE =
  /^\*\*(\d{1,2}:\d{2}(?::\d{2})?)\s*-\s*(\d{1,2}:\d{2}(?::\d{2})?)\*\*$/;

const TIME_RANGE_PLAIN_RE =
  /^(\d{1,2}:\d{2}(?::\d{2})?)\s*-\s*(\d{1,2}:\d{2}(?::\d{2})?)$/;

const BOLD_SPEAKER_LINE_RE = /^\*\*([^*]+?):\*\*\s*(.*)$/;

const H1_HEADING_RE = /^#\s+(.+)$/;
const SECONDARY_HEADING_RE = /^#{2,3}\s+(.+)$/;

function isBoilerplateLabel(text: string): boolean {
  return BOILERPLATE_TITLE_RE.test(text.trim());
}

function isBoilerplateTitleLine(line: string): boolean {
  const h1Match = line.match(H1_HEADING_RE);
  if (h1Match) return isBoilerplateLabel(h1Match[1]);

  const secondaryMatch = line.match(SECONDARY_HEADING_RE);
  if (secondaryMatch) return isBoilerplateLabel(secondaryMatch[1]);

  const boldMatch = line.match(/^\*\*(.+)\*\*$/);
  if (boldMatch) return isBoilerplateLabel(boldMatch[1]);

  return false;
}

function parseMainBoldTitleLine(line: string): string | null {
  const match = line.match(/^\*\*(.+)\*\*$/);
  if (!match) return null;

  const inner = match[1];
  if (!inner || inner.includes(":") || isBoilerplateLabel(inner)) {
    return null;
  }

  if (TIME_RANGE_BOLD_RE.test(line)) return null;

  return inner;
}

function parseMainH1Title(line: string): string | null {
  const match = line.match(H1_HEADING_RE);
  if (!match) return null;

  const title = match[1];
  if (!title || isBoilerplateLabel(title)) return null;

  return title;
}

function parseSecondaryHeading(line: string): string | null {
  const match = line.match(SECONDARY_HEADING_RE);
  if (!match) return null;

  const subtitle = match[1];
  if (!subtitle || isBoilerplateLabel(subtitle)) return null;

  return subtitle;
}

/**
 * Main title: first `# …` or standalone `**…**`.
 * Subtitle: first `##` / `###` after a main title, before transcript body.
 */
function extractLeadingHeaders(lines: string[]): {
  title: string | null;
  subtitle: string | null;
  startIndex: number;
} {
  let title: string | null = null;
  let subtitle: string | null = null;
  let startIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "") continue;

    if (isBoilerplateTitleLine(line)) continue;

    if (title === null) {
      const h1Title = parseMainH1Title(line);
      if (h1Title) {
        title = h1Title;
        startIndex = i + 1;
        continue;
      }

      const boldTitle = parseMainBoldTitleLine(line);
      if (boldTitle) {
        title = boldTitle;
        startIndex = i + 1;
        continue;
      }

      break;
    }

    const secondary = parseSecondaryHeading(line);
    if (secondary) {
      subtitle = secondary;
      startIndex = i + 1;
    }

    break;
  }

  return { title, subtitle, startIndex };
}

/** Inner card header label — never duplicates the collapsible main title. */
export function resolveTranscriptInnerHeaderLabel(
  parsed: Pick<ParsedTranscript, "title" | "subtitle">,
): string {
  if (!parsed.title) return "Audio Transcript";

  if (parsed.subtitle && parsed.subtitle !== parsed.title) {
    return parsed.subtitle;
  }

  return "Audio Transcript";
}

function parseTimeRangeLine(line: string): TimeAnchor | null {
  const match =
    line.match(TIME_RANGE_BOLD_RE) ?? line.match(TIME_RANGE_PLAIN_RE);
  if (!match) return null;

  const start = parseTimeToken(match[1]);
  const end = parseTimeToken(match[2]);
  return {
    seconds: start.seconds,
    timecode: `${start.timecode} - ${end.timecode}`,
  };
}

function parseBoldSpeakerLine(
  line: string,
): { speaker: string; text: string } | null {
  const match = line.match(BOLD_SPEAKER_LINE_RE);
  if (!match) return null;

  const speaker = match[1].trim();
  const text = match[2].trim();
  if (!speaker) return null;

  return { speaker, text };
}

function pushSegment(
  segments: TranscriptSegment[],
  segment: Omit<TranscriptSegment, "id">,
): void {
  if (!segment.text.trim()) return;
  segments.push({
    id: `segment-${segments.length}`,
    ...segment,
    text: segment.text.trim(),
  });
}

function parseTranscriptSegments(
  lines: string[],
  startIndex: number,
): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  let currentSegment: Partial<TranscriptSegment> = {};
  let buffer = "";
  let sectionAnchor: TimeAnchor = { timecode: "00:00", seconds: 0 };

  const flushLegacySegment = () => {
    if (!buffer.trim() || !currentSegment.timecode) return;
    pushSegment(segments, {
      timecode: currentSegment.timecode,
      seconds: currentSegment.seconds ?? 0,
      text: buffer.trim(),
      speaker: currentSegment.speaker,
    });
    buffer = "";
    currentSegment = {};
  };

  /** Plain text with no time marker — one segment at the current/default anchor. */
  const flushOrphanPlainText = () => {
    if (!buffer.trim() || currentSegment.timecode) return;
    pushSegment(segments, {
      timecode: sectionAnchor.timecode,
      seconds: sectionAnchor.seconds,
      text: buffer.trim(),
    });
    buffer = "";
  };

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line === "") continue;

    if (isBoilerplateTitleLine(line)) continue;

    if (parseMainH1Title(line) || parseMainBoldTitleLine(line)) continue;

    if (parseSecondaryHeading(line)) continue;

    const rangeAnchor = parseTimeRangeLine(line);
    if (rangeAnchor) {
      flushLegacySegment();
      sectionAnchor = rangeAnchor;
      // Plain text lines after a range use the legacy buffer — anchor it here.
      currentSegment = {
        timecode: sectionAnchor.timecode,
        seconds: sectionAnchor.seconds,
      };
      buffer = "";
      continue;
    }

    const timecodeMatch = line.match(/^\[(\d+):(\d+)(?::(\d+))?\]/);
    if (timecodeMatch) {
      flushLegacySegment();

      let hours = 0;
      let minutes = 0;
      let seconds = 0;

      if (timecodeMatch[3]) {
        hours = parseInt(timecodeMatch[1], 10);
        minutes = parseInt(timecodeMatch[2], 10);
        seconds = parseInt(timecodeMatch[3], 10);
      } else {
        minutes = parseInt(timecodeMatch[1], 10);
        seconds = parseInt(timecodeMatch[2], 10);
      }

      const totalSeconds = hours * 3600 + minutes * 60 + seconds;
      const timecodeStr = formatLegacyBracketTimecode(hours, minutes, seconds);

      currentSegment = {
        timecode: timecodeStr,
        seconds: totalSeconds,
      };
      sectionAnchor = { timecode: timecodeStr, seconds: totalSeconds };

      const restOfLine = line.replace(timecodeMatch[0], "").trim();

      if (restOfLine) {
        const speakerMatch = restOfLine.match(/^([^:]+):\s*/);
        const boldSpeakerMatch = restOfLine.match(/^(\*\*[^*]+\*\*)/);

        if (speakerMatch) {
          currentSegment.speaker = speakerMatch[1].trim();
          buffer += restOfLine.substring(speakerMatch[0].length) + " ";
        } else if (boldSpeakerMatch) {
          currentSegment.speaker = boldSpeakerMatch[1]
            .replace(/\*/g, "")
            .trim();
          buffer += restOfLine.replace(boldSpeakerMatch[0], "") + " ";
        } else {
          buffer += restOfLine + " ";
        }
      }
      continue;
    }

    const boldSpeaker = parseBoldSpeakerLine(line);
    if (boldSpeaker) {
      flushLegacySegment();
      pushSegment(segments, {
        timecode: sectionAnchor.timecode,
        seconds: sectionAnchor.seconds,
        text: boldSpeaker.text,
        speaker: boldSpeaker.speaker,
      });
      continue;
    }

    buffer += line + " ";
  }

  flushLegacySegment();
  flushOrphanPlainText();

  return segments;
}

export function parseTranscript(transcriptContent: string): ParsedTranscript {
  const lines = transcriptContent.split("\n");
  const { title, subtitle, startIndex } = extractLeadingHeaders(lines);
  const segments = parseTranscriptSegments(lines, startIndex);

  return { title, subtitle, segments };
}

export const parseTranscriptContent = (
  transcriptContent: string,
): TranscriptSegment[] => parseTranscript(transcriptContent).segments;
