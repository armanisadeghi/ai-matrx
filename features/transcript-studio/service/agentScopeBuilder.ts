/**
 * Builds the `ApplicationScope` payload sent to per-column agents via
 * `useShortcutTrigger` / `launchAgentExecution`. The keys here correspond
 * to the variables defined on each agent's record:
 *
 *   - cleaning agent: `prior_cleaned_suffix`, `raw_window`, `session_title`,
 *     `module_id`
 *   - concept agent (Phase 6): `raw_window`, `prior_concepts`, `session_title`
 *   - module agents (Phase 7): module-defined; the registry's `buildScope`
 *     contributes additional keys.
 *
 * Centralising this here keeps the contract in one place — when a new
 * variable lands on an agent we add a builder here, not inside the thunk.
 */

import { CLEANING_CONTEXT_CHAR_BUDGET, RESUME_MARKER } from "../constants";
import type {
  CleanedSegment,
  ConceptItem,
  ConceptKind,
  RawSegment,
  StudioSession,
} from "../types";

export interface CleaningWindowInputs {
  rawSegments: RawSegment[];
  /** Active (non-superseded) cleaned segments, ordered by tStart. */
  cleanedSegments: CleanedSegment[];
  session: StudioSession;
}

export interface CleaningWindow {
  /** Slice of raw segments not yet covered by an active cleaned segment. */
  windowSegments: RawSegment[];
  /** Concatenated text of `windowSegments`. Empty when nothing new to clean. */
  rawWindow: string;
  /** Last ~1000 chars of prior cleaned text, ending with `[[RESUME]]`. */
  priorCleanedSuffix: string;
  /** tStart of the first segment in `windowSegments`, or null when empty. */
  replaceFromTime: number | null;
  /** tEnd of the last segment in `windowSegments`, or null when empty. */
  replaceToTime: number | null;
  /** Char-range of the new raw text within the full session raw text. */
  inputCharRange: [number, number] | null;
  /** ApplicationScope payload to pass to useShortcutTrigger's `scope`. */
  scope: {
    prior_cleaned_suffix: string;
    raw_window: string;
    session_title: string;
    module_id: string;
  };
}

/**
 * Compute the next cleanup window from the current raw + cleaned state.
 *
 * `replaceFromTime` is the tStart of the first uncleaned raw segment.
 * Anything cleaned at or after that time will be superseded by the new
 * segment when the agent's response is applied.
 */
export function buildCleaningWindow({
  rawSegments,
  cleanedSegments,
  session,
}: CleaningWindowInputs): CleaningWindow {
  // The boundary: tEnd of the last active cleaned segment. Raw text strictly
  // after that boundary is the new window.
  const lastCleaned = cleanedSegments[cleanedSegments.length - 1];
  const boundary = lastCleaned?.tEnd ?? 0;

  const windowSegments: RawSegment[] = [];
  for (const seg of rawSegments) {
    if (seg.tStart >= boundary) windowSegments.push(seg);
  }

  const rawWindow = windowSegments.map((s) => s.text).join("\n");
  const replaceFromTime = windowSegments[0]?.tStart ?? null;
  const replaceToTime = windowSegments[windowSegments.length - 1]?.tEnd ?? null;

  // Char range of the window within the full session raw text. Useful for
  // audit / debugging; persisted on the run row.
  let charOffset = 0;
  for (const seg of rawSegments) {
    if (seg === windowSegments[0]) break;
    charOffset += seg.text.length + 1; // +1 for the joiner
  }
  const inputCharRange: [number, number] | null = rawWindow
    ? [charOffset, charOffset + rawWindow.length]
    : null;

  // Suffix of the active cleaned text, capped to CLEANING_CONTEXT_CHAR_BUDGET.
  // Always ends with the resume marker so the agent has a clear anchor.
  const priorCleanedSuffix = buildPriorCleanedSuffix(cleanedSegments);

  return {
    windowSegments,
    rawWindow,
    priorCleanedSuffix,
    replaceFromTime,
    replaceToTime,
    inputCharRange,
    scope: {
      prior_cleaned_suffix: priorCleanedSuffix,
      raw_window: rawWindow,
      session_title: session.title ?? "",
      module_id: session.moduleId ?? "",
    },
  };
}

// ── Recording-aligned cleaning (Scribe) ─────────────────────────────
//
// Unlike the time-windowed `buildCleaningWindow` (Studio's interval cleaner),
// Scribe cleans one *recording* at a time: when a recording closes (manual
// stop, or a periodic auto-rotation during continuous capture), exactly that
// recording's raw text is cleaned into ONE cleaned segment anchored to its
// `recording_segment_id`. The full-session clean is the ordered concatenation
// of those rows — there is no separate monolithic clean document.

export interface RecordingCleaningInputs {
  /** This recording's raw segments, ordered by tStart. */
  recordingRaws: RawSegment[];
  /**
   * Active cleaned segments for recordings that precede this one (ordered by
   * tStart). Their suffix feeds `prior_cleaned_suffix` for cross-recording
   * continuity (style/terminology carry-over + `[[RESUME]]` anchor).
   */
  priorCleaned: CleanedSegment[];
  session: StudioSession;
}

export interface RecordingCleaningWindow {
  /** Concatenated raw text of this recording. Empty when nothing to clean. */
  rawWindow: string;
  priorCleanedSuffix: string;
  /** tStart of this recording's first raw, or null when empty. */
  tStart: number | null;
  /** tEnd of this recording's last raw, or null when empty. */
  tEnd: number | null;
  scope: {
    prior_cleaned_suffix: string;
    raw_window: string;
    session_title: string;
    module_id: string;
  };
}

export function buildRecordingCleaningWindow({
  recordingRaws,
  priorCleaned,
  session,
}: RecordingCleaningInputs): RecordingCleaningWindow {
  const rawWindow = recordingRaws
    .map((s) => s.text)
    .join("\n")
    .trim();
  const tStart = recordingRaws[0]?.tStart ?? null;
  const tEnd = recordingRaws[recordingRaws.length - 1]?.tEnd ?? null;
  const priorCleanedSuffix = buildPriorCleanedSuffix(priorCleaned);

  return {
    rawWindow,
    priorCleanedSuffix,
    tStart,
    tEnd,
    scope: {
      prior_cleaned_suffix: priorCleanedSuffix,
      raw_window: rawWindow,
      session_title: session.title ?? "",
      module_id: session.moduleId ?? "",
    },
  };
}

function buildPriorCleanedSuffix(cleaned: CleanedSegment[]): string {
  if (cleaned.length === 0) return "";
  // Walk backwards accumulating up to the budget.
  const parts: string[] = [];
  let total = 0;
  for (let i = cleaned.length - 1; i >= 0; i--) {
    const text = cleaned[i]!.text;
    if (total + text.length + 1 > CLEANING_CONTEXT_CHAR_BUDGET) {
      // Last fragment — clip from the LEFT so we keep the most recent text.
      const remaining = CLEANING_CONTEXT_CHAR_BUDGET - total;
      if (remaining > 80) {
        parts.unshift("…" + text.slice(-(remaining - 1)));
      }
      break;
    }
    parts.unshift(text);
    total += text.length + 1;
  }
  return `${parts.join("\n")}\n${RESUME_MARKER}`;
}

/**
 * Strip the leading `[[RESUME]]` marker from an agent response. Tolerant of
 * whitespace and an optional newline. If the marker is missing entirely we
 * log a warning and treat the whole response as cleaned text — the run
 * still succeeds because partial output is more useful than a hard fail.
 *
 * If the response is empty after stripping, returns `null` so the caller
 * can mark the run failed without inserting an empty cleaned segment.
 */
export function stripResumeMarker(response: string): string | null {
  const trimmed = response.trim();
  // Take text after the LAST occurrence — agents sometimes echo prior
  // context that ends with the marker, then insert the marker again.
  const idx = trimmed.lastIndexOf(RESUME_MARKER);
  let body = idx >= 0 ? trimmed.slice(idx + RESUME_MARKER.length) : trimmed;
  body = body.replace(/^\s*\n?/, "").trim();
  if (!body) return null;
  return body;
}

// ── Concept extraction (Column 3) ────────────────────────────────────

const CONCEPT_KIND_VALUES: ReadonlySet<ConceptKind> = new Set([
  "theme",
  "key_idea",
  "entity",
  "question",
  "other",
]);
/** How many recent concepts feed back into `prior_concepts` to deduplicate. */
const CONCEPT_PRIOR_LIMIT = 30;

export interface ConceptWindowInputs {
  rawSegments: RawSegment[];
  cleanedSegments: CleanedSegment[];
  conceptItems: ConceptItem[];
  /** tEnd of the last raw covered by the most recent SUCCESSFUL concept pass. */
  lastConceptCoverageTEnd: number;
  session: StudioSession;
}

export interface ConceptWindow {
  rawWindow: string;
  priorConcepts: string;
  windowSegments: RawSegment[];
  /** tStart of the first raw segment in the window, or null when empty. */
  windowStartTime: number | null;
  /** tEnd of the last raw segment in the window, or null when empty. */
  windowEndTime: number | null;
  inputCharRange: [number, number] | null;
  scope: {
    raw_window: string;
    prior_concepts: string;
    session_title: string;
    module_id: string;
  };
}

/**
 * Build the concept-pass payload.
 *
 * Window strategy: prefer cleaned text when available (sparser, less noisy),
 * falling back to raw if cleanup hasn't reached this range yet. The window
 * starts strictly AFTER `lastConceptCoverageTEnd` so concept passes don't
 * re-process the same audio. (Cleanup tStart != concept tStart — they run on
 * independent cadences.)
 */
export function buildConceptWindow({
  rawSegments,
  cleanedSegments,
  conceptItems,
  lastConceptCoverageTEnd,
  session,
}: ConceptWindowInputs): ConceptWindow {
  const windowSegments = rawSegments.filter(
    (s) => s.tStart >= lastConceptCoverageTEnd,
  );

  // Use cleaned text where available — read out cleaned segments overlapping
  // the window and substitute them in. Fallback to raw when no cleaning has
  // covered the time range yet.
  const windowStartTime = windowSegments[0]?.tStart ?? null;
  const windowEndTime = windowSegments[windowSegments.length - 1]?.tEnd ?? null;

  let rawWindow: string;
  if (windowStartTime !== null && windowEndTime !== null) {
    const overlapping = cleanedSegments.filter(
      (c) => c.tEnd > windowStartTime && c.tStart < windowEndTime,
    );
    if (overlapping.length > 0) {
      // Concatenate cleaned text where it exists; fill gaps from raw.
      const parts: string[] = overlapping.map((c) => c.text);
      // If raw extends past the last cleaned segment, append the uncovered tail.
      const lastCleanedEnd = overlapping[overlapping.length - 1]!.tEnd;
      const tail = windowSegments.filter((s) => s.tStart >= lastCleanedEnd);
      if (tail.length > 0) parts.push(tail.map((s) => s.text).join("\n"));
      rawWindow = parts.join("\n\n");
    } else {
      rawWindow = windowSegments.map((s) => s.text).join("\n");
    }
  } else {
    rawWindow = "";
  }

  // Prior concepts summary — most recent N items, formatted for the agent
  // to scan quickly. Each line: "- [kind] label".
  const priorConcepts = buildPriorConceptsSummary(conceptItems);

  // Char range within the session raw text — for audit only.
  let charOffset = 0;
  for (const seg of rawSegments) {
    if (seg === windowSegments[0]) break;
    charOffset += seg.text.length + 1;
  }
  const inputCharRange: [number, number] | null = rawWindow
    ? [charOffset, charOffset + rawWindow.length]
    : null;

  return {
    rawWindow,
    priorConcepts,
    windowSegments,
    windowStartTime,
    windowEndTime,
    inputCharRange,
    scope: {
      raw_window: rawWindow,
      prior_concepts: priorConcepts,
      session_title: session.title ?? "",
      module_id: session.moduleId ?? "",
    },
  };
}

function buildPriorConceptsSummary(items: ConceptItem[]): string {
  if (items.length === 0) return "";
  const recent = items.slice(-CONCEPT_PRIOR_LIMIT);
  return recent.map((c) => `- [${c.kind}] ${c.label}`).join("\n");
}

export interface ParsedConcept {
  kind: ConceptKind;
  label: string;
  description: string | null;
  tStart: number | null;
  tEnd: number | null;
}

/**
 * Parse the concept-extraction agent's response. Looks for the first JSON
 * code fence containing a `concepts` array and validates each item against
 * the schema. Returns an empty array on parse failure (we surface this via
 * the run's status — the recording continues either way).
 *
 * Tolerant of: missing fences (parses bare JSON object), extra prose around
 * the fence, items missing optional fields.
 */
export function parseConceptResponse(response: string): ParsedConcept[] {
  if (!response || !response.trim()) return [];

  const candidate = extractJsonBlock(response);
  if (!candidate) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return [];
  }

  const concepts =
    parsed && typeof parsed === "object" && "concepts" in parsed
      ? (parsed as { concepts: unknown }).concepts
      : null;
  if (!Array.isArray(concepts)) return [];

  const out: ParsedConcept[] = [];
  for (const raw of concepts) {
    if (!raw || typeof raw !== "object") continue;
    const it = raw as Record<string, unknown>;

    const kindRaw = typeof it.kind === "string" ? it.kind : null;
    const kind: ConceptKind | null =
      kindRaw && CONCEPT_KIND_VALUES.has(kindRaw as ConceptKind)
        ? (kindRaw as ConceptKind)
        : null;
    if (!kind) continue;

    const label = typeof it.label === "string" ? it.label.trim() : null;
    if (!label) continue;

    const description =
      typeof it.description === "string" && it.description.trim()
        ? it.description.trim()
        : null;
    const tStart =
      typeof it.t_start === "number" && Number.isFinite(it.t_start)
        ? it.t_start
        : null;
    const tEnd =
      typeof it.t_end === "number" && Number.isFinite(it.t_end)
        ? it.t_end
        : null;

    out.push({ kind, label, description, tStart, tEnd });
  }
  return out;
}

/**
 * Pull the JSON payload out of an agent response. Tries, in order:
 *   1. The first ````json ... ```` fenced block.
 *   2. The first ```` ... ```` fenced block (untyped).
 *   3. A bare object literal — heuristic: from the first `{` to the last `}`.
 */
function extractJsonBlock(response: string): string | null {
  const fencedJson = response.match(/```json\s*([\s\S]*?)```/i);
  if (fencedJson) return fencedJson[1]!.trim();
  const fenced = response.match(/```\s*([\s\S]*?)```/);
  if (fenced) {
    const body = fenced[1]!.trim();
    if (body.startsWith("{")) return body;
  }
  const first = response.indexOf("{");
  const last = response.lastIndexOf("}");
  if (first >= 0 && last > first) {
    return response.slice(first, last + 1);
  }
  return null;
}
