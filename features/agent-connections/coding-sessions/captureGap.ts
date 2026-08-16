/**
 * Capture-gap detection for the coding-session bridge.
 *
 * WHY THIS EXISTS: every Claude Code hook delivers through the plugin's
 * already-connected MCP session, and an MCP hook can never initiate OAuth.
 * When that connection drops or its authorization lapses, Claude treats the
 * hook failure as NON-BLOCKING and the coding session continues — so mirroring
 * stops forever, silently. On 2026-08-16 that produced a 23.5-hour capture
 * outage that nothing surfaced; the owner noticed only because timestamps
 * looked wrong. An empty inbox was indistinguishable from a quiet day.
 *
 * THE HONESTY CONSTRAINT: the mirror is the only sensor we have here. A long
 * gap is genuinely ambiguous — the owner may simply not have been coding. So
 * this module never asserts a cause it cannot observe. It calibrates against
 * the owner's OWN delivery history and grades the gap:
 *
 *   healthy → delivering now
 *   quiet   → a normal-looking break; say nothing
 *   suspect → longer than this owner's typical quiet period, but still inside
 *             their historical envelope. Prominent, and explicitly conditional
 *             ("if you have been coding, capture has stopped").
 *   stopped → longer than ANY quiet period on record, or past the hard ceiling.
 *   never   → bindings have never existed; this is setup, not an outage.
 *
 * Getting this noisy is as bad as staying silent, which is why `quiet` renders
 * nothing and `suspect` states its own uncertainty in the copy.
 */

/** Deliveries this recent mean the bridge is demonstrably working. */
const FRESH_MS = 15 * 60 * 1_000;

/** Never escalate below this, however tight the owner's normal cadence is. */
const QUIET_FLOOR_MS = 3 * 60 * 60 * 1_000;

/**
 * Past this, escalate to `stopped` even if the historical envelope is wider.
 * A single vacation must not buy permanent silence.
 */
const HARD_CEILING_MS = 48 * 60 * 60 * 1_000;

/**
 * However lazy the owner's calibrated cadence looks, silence longer than this
 * is always worth surfacing. Caps the derived `typicalMs`.
 */
const QUIET_CAP_MS = 12 * 60 * 60 * 1_000;

/** Below this many observed gaps the history is too thin to calibrate on. */
const MIN_GAP_SAMPLES = 5;

/** Conservative stand-in for an owner with too little history. */
const DEFAULT_ENVELOPE_MS = 12 * 60 * 60 * 1_000;

export type CaptureGapTone =
  | "healthy"
  | "quiet"
  | "suspect"
  | "stopped"
  | "never"
  | "unknown";

export interface CaptureGapVerdict {
  tone: CaptureGapTone;
  label: string;
  /** Plain statement of what is and is not known. Never invents a cause. */
  detail: string;
  /** The one concrete thing the owner can do, or null when nothing applies. */
  action: string | null;
  /** True when this warrants an interruptive banner rather than a status line. */
  isAlarm: boolean;
  /** Time since the last delivery, or null when nothing has ever arrived. */
  gapMs: number | null;
  /** Longest quiet period in this owner's own history, when calibrated. */
  longestQuietMs: number | null;
  /** Whether `longestQuietMs` came from real history or the conservative default. */
  calibrated: boolean;
}

export interface CaptureGapInput {
  /** Most recent delivery across every binding this owner has. */
  lastSeenAt: string | null;
  /**
   * `last_seen_at` for every loaded binding, in any order. Used only to derive
   * this owner's normal quiet periods — never rendered.
   */
  history: readonly (string | null)[];
  /** null while the read is in flight; false when the read itself failed. */
  readSucceeded: boolean | null;
  nowMs: number;
}

interface QuietProfile {
  typicalMs: number;
  longestMs: number;
  calibrated: boolean;
}

/**
 * Derives how long this owner normally goes between deliveries. Gaps come from
 * consecutive delivery timestamps, so an overnight break and a weekend both
 * land in the history rather than being guessed at.
 */
export function quietProfile(history: readonly (string | null)[]): QuietProfile {
  const stamps = history
    .map((value) => (value === null ? Number.NaN : Date.parse(value)))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  const gaps: number[] = [];
  for (let index = 1; index < stamps.length; index += 1) {
    gaps.push(stamps[index] - stamps[index - 1]);
  }

  if (gaps.length < MIN_GAP_SAMPLES) {
    return {
      typicalMs: QUIET_FLOOR_MS,
      longestMs: DEFAULT_ENVELOPE_MS,
      calibrated: false,
    };
  }

  gaps.sort((a, b) => a - b);
  const p90Index = Math.min(gaps.length - 1, Math.floor(gaps.length * 0.9));
  return {
    typicalMs: Math.max(QUIET_FLOOR_MS, gaps[p90Index]),
    longestMs: gaps[gaps.length - 1],
    calibrated: true,
  };
}

/** Human duration at the precision a person actually reads. */
export function formatGap(ms: number): string {
  const rawMinutes = Math.floor(ms / 60_000);
  if (rawMinutes < 60) {
    const minutes = Math.max(1, rawMinutes);
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  const hours = Math.floor(rawMinutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${Math.floor(hours / 24)} days`;
}

export function captureGapVerdict(input: CaptureGapInput): CaptureGapVerdict {
  const { lastSeenAt, history, readSucceeded, nowMs } = input;

  const base = {
    gapMs: null,
    longestQuietMs: null,
    calibrated: false,
  } as const;

  if (readSucceeded === null) {
    return {
      ...base,
      tone: "unknown",
      label: "Checking capture",
      detail: "AI Matrx is reading your coding-session delivery state.",
      action: null,
      isAlarm: false,
    };
  }

  if (!readSucceeded) {
    return {
      ...base,
      tone: "unknown",
      label: "Capture state unavailable",
      detail:
        "AI Matrx could not read your coding-session bindings, so it cannot tell whether capture is running.",
      action: "Retry the read. If it keeps failing, capture status is unknown — do not assume sessions are being stored.",
      isAlarm: false,
    };
  }

  if (!lastSeenAt) {
    return {
      ...base,
      tone: "never",
      label: "No coding session has ever been delivered",
      detail:
        "The session store is reachable and holds nothing for you. This reads as setup that has not completed, not as an interruption.",
      action:
        "In Claude Code, run /mcp, select the plugin-scoped aidream server, and complete OAuth. Then submit a prompt — the first prompt is what attaches a session.",
      isAlarm: false,
    };
  }

  const lastSeenMs = Date.parse(lastSeenAt);
  if (!Number.isFinite(lastSeenMs)) {
    return {
      ...base,
      tone: "unknown",
      label: "Capture state unavailable",
      detail:
        "A binding exists but its last-delivery time is unreadable, so the age of your most recent capture cannot be established.",
      action: null,
      isAlarm: false,
    };
  }

  const gapMs = Math.max(0, nowMs - lastSeenMs);
  const profile = quietProfile(history);
  const shared = {
    gapMs,
    longestQuietMs: profile.longestMs,
    calibrated: profile.calibrated,
  };

  if (gapMs <= FRESH_MS) {
    return {
      ...shared,
      tone: "healthy",
      label: "Capture is running",
      detail: `A coding session was delivered ${formatGap(gapMs)} ago.`,
      action: null,
      isAlarm: false,
    };
  }

  const reconnect =
    "If you have been coding, capture has stopped: open Claude Code, run /mcp, and reconnect the aidream server. Hooks deliver over that connection and cannot re-authorize themselves.";

  // ORDER MATTERS: the ceiling is evaluated BEFORE the quiet branch. A single
  // long absence in the history inflates the calibrated profile, and if `quiet`
  // ran first that one gap would silently buy permanent immunity — the exact
  // shape of the bug this module exists to catch.
  if (gapMs > HARD_CEILING_MS) {
    return {
      ...shared,
      tone: "stopped",
      label: "Capture has stopped",
      detail: `Nothing has been delivered for ${formatGap(gapMs)}. Past two days, AI Matrx stops treating silence as a plausible break.`,
      action: reconnect,
      isAlarm: true,
    };
  }

  if (gapMs <= Math.min(profile.typicalMs, QUIET_CAP_MS)) {
    return {
      ...shared,
      tone: "quiet",
      label: "Quiet",
      detail: `Last delivery was ${formatGap(gapMs)} ago, which is inside your normal cadence.`,
      action: null,
      isAlarm: false,
    };
  }

  if (gapMs > profile.longestMs) {
    const comparison = profile.calibrated
      ? `That is longer than any quiet period in your history (longest on record: ${formatGap(profile.longestMs)}).`
      : "There is not enough delivery history to compare this against your normal pattern.";
    return {
      ...shared,
      tone: "stopped",
      label: "Capture has stopped",
      detail: `Nothing has been delivered for ${formatGap(gapMs)}. ${comparison}`,
      action: reconnect,
      isAlarm: true,
    };
  }

  const envelope = profile.calibrated
    ? `Your longest normal quiet period is ${formatGap(profile.longestMs)}, so this could still be a genuine break — AI Matrx cannot tell the difference from here.`
    : "There is not enough delivery history to tell a genuine break from a broken connection.";
  return {
    ...shared,
    tone: "suspect",
    label: "No capture for " + formatGap(gapMs),
    detail: `Nothing has been delivered since your last session. ${envelope}`,
    action: reconnect,
    isAlarm: true,
  };
}
