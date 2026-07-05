// features/education/study/utils/parseSessionReview.ts
//
// Normalizes study_session.session_review (jsonb from fc_review_batch or similar)
// into a display + TTS shape. Handles plain strings, JSON strings, and the
// canonical agent object { summary, strengths[], weaknesses[], ... }.

export interface ParsedSessionReview {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  secondaryScore: number | null;
  /** Full text for read-aloud (summary + bullet sections). */
  speakText: string;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function buildSpeakText(
  summary: string,
  strengths: string[],
  weaknesses: string[],
): string {
  const parts: string[] = [summary];
  if (strengths.length > 0) {
    parts.push(`Strengths: ${strengths.join(". ")}`);
  }
  if (weaknesses.length > 0) {
    parts.push(`Areas to improve: ${weaknesses.join(". ")}`);
  }
  return parts.join("\n\n");
}

function fromRecord(
  record: Record<string, unknown>,
): ParsedSessionReview | null {
  const summary =
    typeof record.summary === "string"
      ? record.summary.trim()
      : typeof record.text === "string"
        ? record.text.trim()
        : typeof record.review === "string"
          ? record.review.trim()
          : "";

  const strengths = asStringArray(record.strengths);
  const weaknesses = asStringArray(record.weaknesses);
  const secondaryScore =
    typeof record.secondary_score === "number"
      ? record.secondary_score
      : typeof record.secondaryScore === "number"
        ? record.secondaryScore
        : null;

  if (!summary && strengths.length === 0 && weaknesses.length === 0) {
    return null;
  }

  const resolvedSummary =
    summary ||
    (strengths.length > 0
      ? "See strengths and areas to improve below."
      : "See areas to improve below.");

  return {
    summary: resolvedSummary,
    strengths,
    weaknesses,
    secondaryScore,
    speakText: buildSpeakText(resolvedSummary, strengths, weaknesses),
  };
}

/** Parse session_review jsonb (or legacy string) into display + TTS content. */
export function parseSessionReview(raw: unknown): ParsedSessionReview | null {
  if (raw == null) return null;

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (parsed !== raw) return parseSessionReview(parsed);
    } catch {
      return {
        summary: trimmed,
        strengths: [],
        weaknesses: [],
        secondaryScore: null,
        speakText: trimmed,
      };
    }
    return null;
  }

  if (typeof raw !== "object" || Array.isArray(raw)) return null;

  const record = raw as Record<string, unknown>;

  // Some agent envelopes nest the payload one level deep.
  for (const key of ["review", "data", "result", "value"] as const) {
    const nested = record[key];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      const parsed = fromRecord(nested as Record<string, unknown>);
      if (parsed) return parsed;
    }
  }

  return fromRecord(record);
}

/** Build a minimal review object from the live FastFire Redux summary string. */
export function parsedSessionReviewFromSummary(
  summary: string | null | undefined,
): ParsedSessionReview | null {
  if (!summary?.trim()) return null;
  const trimmed = summary.trim();
  return {
    summary: trimmed,
    strengths: [],
    weaknesses: [],
    secondaryScore: null,
    speakText: trimmed,
  };
}

/** True when a FastFire session may still be waiting on the async review agent. */
export function isAwaitingCoachReview(
  mode: string | null | undefined,
  status: string | null | undefined,
  sessionReview: unknown,
): boolean {
  if (mode !== "fast_fire" || status !== "completed") return false;
  return parseSessionReview(sessionReview) === null;
}
