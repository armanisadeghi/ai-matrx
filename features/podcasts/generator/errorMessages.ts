// features/podcasts/generator/errorMessages.ts
//
// Turn raw generation/provider errors into short, calm, human messages. We make
// a LOT of AI calls (research, script, 5+ images, videos, TTS) and some will
// fail — a moderation false-positive, a rate limit, a timeout, a dropped
// connection. None of those should read as "everything blew up." This maps the
// raw text to a one-line friendly message + a recovery hint, and keeps the raw
// detail available behind a disclosure rather than dumped on the page.

export type GenerationErrorKind =
  | "moderation"
  | "rate_limit"
  | "timeout"
  | "network"
  | "quota"
  | "generic";

export interface HumanizedError {
  kind: GenerationErrorKind;
  /** One calm sentence for the user. */
  short: string;
  /** A short recovery hint (what to do next), or null. */
  hint: string | null;
  /** The raw detail, for an optional "Show details" disclosure (null if same). */
  detail: string | null;
}

const PATTERNS: { kind: GenerationErrorKind; re: RegExp; short: string; hint: string | null }[] = [
  {
    kind: "moderation",
    re: /safety system|content policy|content_policy|moderation|\bflagged\b|\bblocked\b|safety filter|responsible ai|prohibited|disallowed|violat/i,
    short: "A model's safety filter blocked this — it often misfires on AI-written concepts.",
    hint: "Regenerate it, or try a different model.",
  },
  {
    kind: "rate_limit",
    re: /rate.?limit|\b429\b|too many requests|temporarily.*(unavailable|overloaded)|overloaded/i,
    short: "The model is busy right now (rate-limited).",
    hint: "Give it a moment, then resume.",
  },
  {
    kind: "timeout",
    re: /timed?\s?out|timeout|deadline exceeded|etimedout/i,
    short: "A step took too long and timed out.",
    hint: "Resume to continue from where it stopped.",
  },
  {
    kind: "network",
    re: /network|connection|econnreset|fetch failed|stream error|socket|disconnect/i,
    short: "The connection dropped mid-run.",
    hint: "Resume to pick up where it left off.",
  },
  {
    kind: "quota",
    re: /quota|insufficient|billing|credit|payment|out of (credits|tokens)/i,
    short: "A usage limit was reached.",
    hint: null,
  },
];

/** Humanize a raw error string into a calm, short, recoverable message. */
export function humanizeGenerationError(raw: string | null | undefined): HumanizedError {
  const text = (raw ?? "").trim();
  if (!text) {
    return {
      kind: "generic",
      short: "Something went wrong on this step.",
      hint: "You can resume or re-run from your source.",
      detail: null,
    };
  }
  for (const p of PATTERNS) {
    if (p.re.test(text)) {
      return { kind: p.kind, short: p.short, hint: p.hint, detail: text };
    }
  }
  // Unknown error: keep it short. Show the first sentence inline, full text in
  // the disclosure — never a six-line wall by default.
  const firstSentence = text.split(/(?<=[.!?])\s/)[0];
  const short =
    firstSentence.length > 0 && firstSentence.length <= 140
      ? firstSentence
      : "Something went wrong on this step.";
  return {
    kind: "generic",
    short,
    hint: "You can resume or re-run from your source.",
    detail: text !== short ? text : null,
  };
}

/** A compact reason for a single failed asset (image/video). */
export function humanizeAssetError(raw: string | null | undefined): string {
  return humanizeGenerationError(raw).short;
}
