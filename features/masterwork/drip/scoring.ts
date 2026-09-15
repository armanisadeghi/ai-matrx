// features/masterwork/drip/scoring.ts
//
// THE DAILY DRIP's arithmetic and vocabulary, in ONE pure module.
//
// 🚨 TWIN FILE: `aidream/aidream/services/distillation/daily_drip.py` mirrors
// every predicate and every derivation below. The server reads the same block
// when it decides whether to ask today, whether to pause, and which days to
// distil; if the two disagree the Expert is shown one streak on screen while a
// different one decides whether the questions keep coming. Change one, change
// the other, in the same session.
//
// ## Why nothing derived is ever STORED
//
// `metadata.daily_drip` holds raw facts only: the subscription, and one row per
// day with what was asked, when it was sent, and what they said. The streak,
// the silent run, the yield and "should this pause" are computed HERE, on read.
// A stored streak rots the moment a day is answered late, and then the number
// on the page and the number in the database disagree about the same person.

/** One day of the drip: what was asked that morning, and what came back. */
export interface DripDay {
  id: string;
  /** The Expert's own calendar day, YYYY-MM-DD. Unique — one question a day. */
  day: string;
  /** Which probe family it came from. */
  probe: DripProbe | string;
  /** The question exactly as it was sent. This is provenance, never re-written. */
  question: string;
  /** False when the question writer could not be reached and the probe's own
   * base words went out instead. Recorded, so the page never implies an
   * adaptation that did not happen. */
  adapted: boolean;
  sent_at: string;
  /** Where it was sent — what they had chosen at the time. Display only. */
  channel: string;
  /** Their answer. Empty string means unanswered — never null, never absent. */
  answer: string;
  answered_at: string | null;
  captured_by: "voice" | "typed" | "sms" | "";
  /** Stamped by the SERVER when it distils this day. Never written here. */
  distilled_run_id: string | null;
}

export type DripProbe = "contrast" | "correction_log" | "refusal";
export type DripChannel = "in_app" | "email" | "sms";
export type DripQuestionSet = "mixed" | DripProbe;

export interface DripSubscription {
  active: boolean;
  channel: DripChannel;
  /** 0..23, on the Expert's own clock. */
  send_hour_local: number;
  /** IANA timezone, e.g. "America/Los_Angeles". */
  timezone: string;
  question_set: DripQuestionSet;
  started_at: string;
  /** Non-empty when the drip stopped itself. */
  paused_at: string | null;
  /** Why it stopped, in words the Expert reads on the page. */
  pause_reason: string;
}

export const DAILY_DRIP_SCHEMA = 1;

export interface DailyDrip {
  schema: number;
  subscription: DripSubscription | null;
  days: DripDay[];
}

/**
 * The three probes. 🚨 PRODUCT COPY, NOT A PROMPT — Arman's own words, mirrored
 * from `daily_drip.PROBES`. The question writer ADAPTS them; when it cannot be
 * reached the base question goes out unchanged and the day records that.
 */
export const DRIP_PROBES: Record<DripProbe, { label: string; question: string }> = {
  contrast: {
    label: "What a new hire would get wrong",
    question: "What did you decide today that a new hire would have gotten wrong?",
  },
  correction_log: {
    label: "What you fixed",
    question: "What did you fix in someone's work today?",
  },
  refusal: {
    label: "What you refused",
    question: "What did you refuse today, and why?",
  },
};

export const DRIP_CHANNELS: ReadonlyArray<{
  key: DripChannel;
  label: string;
  /** What the Expert is actually promised. Never a claim the platform cannot keep. */
  note: string;
}> = [
  { key: "email", label: "Email", note: "Works today, nothing to set up." },
  { key: "in_app", label: "In AI Matrx", note: "Waiting for you when you open the app." },
  {
    key: "sms",
    label: "Text message",
    note: "Needs a verified phone number — you'll be asked for it once.",
  },
];

const EMPTY: DailyDrip = { schema: DAILY_DRIP_SCHEMA, subscription: null, days: [] };

/** Read the block off a Rulebook's metadata. Never throws on a malformed one. */
export function readDrip(metadata: unknown): DailyDrip {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return EMPTY;
  const raw = (metadata as Record<string, unknown>).daily_drip;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return EMPTY;
  const block = raw as Record<string, unknown>;
  const days = Array.isArray(block.days)
    ? (block.days.filter(
        (d) => d && typeof d === "object" && typeof (d as DripDay).day === "string",
      ) as DripDay[])
    : [];
  const sub =
    block.subscription && typeof block.subscription === "object"
      ? (block.subscription as DripSubscription)
      : null;
  return {
    schema: typeof block.schema === "number" ? block.schema : DAILY_DRIP_SCHEMA,
    subscription: sub && typeof sub.active === "boolean" ? sub : null,
    days: [...days].sort((a, b) => a.day.localeCompare(b.day)),
  };
}

/** 🚨 THE ONE PREDICATE for "they answered". Real words, nothing else. */
export function isAnswered(day: DripDay): boolean {
  return typeof day.answer === "string" && day.answer.trim().length > 0;
}

export function answeredDays(days: DripDay[]): DripDay[] {
  return days.filter(isAnswered);
}

/** Answers no distillation run has read yet. */
export function undistilledAnswered(days: DripDay[]): DripDay[] {
  return answeredDays(days).filter((d) => !d.distilled_run_id);
}

/**
 * 🚨 THE ONE PREDICATE for "this drip is running". Opted in AND not paused.
 * A surface that counts with one predicate and lists with another lies.
 */
export function isActive(drip: DailyDrip): boolean {
  return Boolean(drip.subscription?.active) && !drip.subscription?.paused_at;
}

/** Opted in, but it stopped itself. Never the same as "never opted in". */
export function isPaused(drip: DailyDrip): boolean {
  return Boolean(drip.subscription?.active) && Boolean(drip.subscription?.paused_at);
}

/**
 * Consecutive answered days, counting back from the most recent question.
 *
 * 🚨 Counted over DAY ROWS, not calendar days — a drip that was paused for a
 * fortnight has no gap in its rows, and punishing someone for a fortnight
 * nobody asked them anything would be the screen lying about them. A day that
 * was asked and not answered breaks it. A broken streak is a fact on the page,
 * never a scolding.
 */
export function answerStreak(days: DripDay[]): number {
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i -= 1) {
    if (!isAnswered(days[i])) break;
    streak += 1;
  }
  return streak;
}

/** Consecutive SENT-AND-UNANSWERED days at the end. What the pause reads. */
export function silentRun(days: DripDay[]): number {
  let run = 0;
  for (let i = days.length - 1; i >= 0; i -= 1) {
    if (isAnswered(days[i])) break;
    run += 1;
  }
  return run;
}

/** The newest question still waiting on an answer, or null. */
export function openQuestion(days: DripDay[]): DripDay | null {
  for (let i = days.length - 1; i >= 0; i -= 1) {
    if (!isAnswered(days[i])) return days[i];
  }
  return null;
}

/** The row for one calendar day, or null. */
export function dayFor(days: DripDay[], day: string): DripDay | null {
  return days.find((d) => d.day === day) ?? null;
}

/** The Expert's own calendar day as YYYY-MM-DD, in their browser's timezone. */
export function localToday(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = `${now.getMonth() + 1}`.padStart(2, "0");
  const d = `${now.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The browser's own IANA timezone, or UTC when it will not say. */
export function localTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export interface DripYield {
  asked: number;
  answered: number;
  streak: number;
  silentRun: number;
  /** Rules on the Rulebook stamped with this Approach. */
  rules: number;
  undistilled: number;
  lastAsked: string;
  lastAnswered: string;
}

/**
 * Streaks and yield, as the Rulebook page shows them.
 *
 * `rules` is the only honest answer to "what has answering every morning
 * actually bought me", so it counts rules ACTUALLY STAMPED with this Approach
 * rather than inferring anything from the number of answers.
 */
export function dripYield(
  days: DripDay[],
  rules: ReadonlyArray<{ source_ref?: { approach?: string } | null }> = [],
): DripYield {
  const answered = answeredDays(days);
  return {
    asked: days.length,
    answered: answered.length,
    streak: answerStreak(days),
    silentRun: silentRun(days),
    rules: rules.filter((r) => r?.source_ref?.approach === "daily_drip").length,
    undistilled: undistilledAnswered(days).length,
    lastAsked: days.length ? days[days.length - 1].day : "",
    lastAnswered: answered.length ? answered[answered.length - 1].day : "",
  };
}

/** "8am", "1pm", "midnight" — an hour said the way a person says it. */
export function hourLabel(hour: number): string {
  const h = Math.max(0, Math.min(23, Math.round(hour)));
  if (h === 0) return "midnight";
  if (h === 12) return "noon";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

/** "Mon 15 Sep" — a day said the way a person says it. */
export function dayLabel(day: string): string {
  const parsed = new Date(`${day}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return day;
  return parsed.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
