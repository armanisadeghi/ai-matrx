// features/masterwork/prediction/scoring.ts
//
// THE PREDICTION LEDGER's arithmetic, in ONE pure module.
//
// 🚨 TWIN FILE: `aidream/aidream/services/distillation/prediction_ledger.py`
// mirrors every function below, line for line. The server scores the same
// entries when it distils them; if the two ever disagree the Expert is shown
// one number on screen and a different one is used to pick which of her
// reasons become rules. Change one, change the other, in the same session.
//
// ## Why nothing derived is ever STORED
//
// `metadata.prediction_ledger` holds raw facts only: the call, the confidence,
// the why, the due date, and — once known — the outcome. `correct`, the Brier
// score and every calibration bucket are computed HERE, on read. Stored
// derivations rot: an entry whose outcome is later corrected would keep a
// stale `correct: true` beside its new `outcome: false`, and the data would
// disagree with itself. It cannot, because the derivation does not exist
// anywhere but in these functions.

/** One recorded call on a real open case. Raw facts only — see the header. */
export interface PredictionEntry {
  id: string;
  /** What case this is about, in the Expert's own filing words. */
  case_label: string;
  /** The call itself. */
  prediction: string;
  /** 0.01..0.99. Never 0 or 1: a call you cannot be wrong about is not a call. */
  confidence: number;
  /** The one line of reasoning. This is the part that becomes a rule. */
  why: string;
  /** ISO date (YYYY-MM-DD) — when the outcome should be knowable. */
  due_at: string;
  captured_by: "voice" | "typed";
  created_at: string;
  created_by: string;
  /** null while open; true = the call came true. */
  outcome: boolean | null;
  outcome_note: string;
  resolved_at: string | null;
  /** Stamped by the SERVER when it distils this entry. Never written here. */
  distilled_run_id: string | null;
}

export const PREDICTION_LEDGER_SCHEMA = 1;

export interface PredictionLedger {
  schema: number;
  entries: PredictionEntry[];
}

/** The lowest and highest confidence a call may carry. */
export const MIN_CONFIDENCE = 0.01;
export const MAX_CONFIDENCE = 0.99;

/** A resolved entry — the outcome is known, so it can be scored. */
export type ResolvedPredictionEntry = PredictionEntry & { outcome: boolean };

export function isResolved(
  entry: PredictionEntry,
): entry is ResolvedPredictionEntry {
  return entry.outcome === true || entry.outcome === false;
}

/**
 * The Brier score of ONE resolved entry: the squared distance between what she
 * said would happen and what did. 0 is perfect, 1 is as wrong as it is
 * possible to be, 0.25 is the score of saying "50/50" every time.
 */
export function brierScore(entry: ResolvedPredictionEntry): number {
  const outcomeValue = entry.outcome ? 1 : 0;
  return (entry.confidence - outcomeValue) ** 2;
}

/**
 * Did the call come true in the direction she leaned?
 *
 * 🚨 The comparison is `>=`, not `>`. A call recorded at exactly 50% leans
 * toward "it happens" — that is what the control's lowest rung MEANS — so an
 * outcome of true at 0.5 is a hit. With `>` it silently becomes a miss, and
 * every reason behind a 50% call would be filed as a boundary finding instead
 * of a rule candidate. `scoring.test.ts` holds the fixture that catches it.
 */
export function isCorrect(entry: ResolvedPredictionEntry): boolean {
  return (entry.confidence >= 0.5) === (entry.outcome === true);
}

/** Overall Brier score across resolved entries. Null when none are resolved. */
export function overallBrier(entries: PredictionEntry[]): number | null {
  const resolved = entries.filter(isResolved);
  if (resolved.length === 0) return null;
  const total = resolved.reduce((sum, e) => sum + brierScore(e), 0);
  return total / resolved.length;
}

/** One confidence decile with at least one resolved entry in it. */
export interface CalibrationBucket {
  /** 0..9 — decile index. 0 is 0–10%, 9 is 90–100%. */
  index: number;
  /** Plain-words range for an axis tick, e.g. "80–90%". */
  label: string;
  /** How many resolved entries landed in this decile. */
  count: number;
  /** Mean confidence of those entries — what she SAID. 0..1. */
  predicted: number;
  /** Share of them that came true — what HAPPENED. 0..1. */
  realized: number;
}

/** Which decile a confidence falls in. 1.0 would overflow, so it is clamped. */
export function bucketIndex(confidence: number): number {
  return Math.min(9, Math.max(0, Math.floor(confidence * 10)));
}

export function bucketLabel(index: number): string {
  return `${index * 10}–${index * 10 + 10}%`;
}

/**
 * Predicted vs realized, bucketed by confidence decile. Only NON-EMPTY buckets
 * come back — an empty decile is not a point on the chart, it is a decile she
 * has never used, and drawing it at zero would read as "nothing she said at
 * 70% ever came true".
 */
export function calibrationBuckets(
  entries: PredictionEntry[],
): CalibrationBucket[] {
  const byIndex = new Map<number, ResolvedPredictionEntry[]>();
  for (const entry of entries) {
    if (!isResolved(entry)) continue;
    const idx = bucketIndex(entry.confidence);
    const bucket = byIndex.get(idx);
    if (bucket) bucket.push(entry);
    else byIndex.set(idx, [entry]);
  }
  return [...byIndex.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, rows]) => ({
      index,
      label: bucketLabel(index),
      count: rows.length,
      predicted: rows.reduce((s, e) => s + e.confidence, 0) / rows.length,
      realized: rows.filter((e) => e.outcome === true).length / rows.length,
    }));
}

/** The counts every readout leads with. */
export interface LedgerTally {
  total: number;
  open: number;
  resolved: number;
  /** Resolved entries whose call came true in the direction she leaned. */
  wellCalibrated: number;
  wrong: number;
  /** Open entries whose due date has passed. */
  overdue: number;
  /** The earliest due date among OPEN entries, or null when none are open. */
  earliestOpenDue: string | null;
}

/**
 * `today` is passed in, never read from the clock inside: a tally that depends
 * on the wall clock cannot be asserted by a test, and an "overdue" count that
 * changes at midnight under a rendered screen is a lie either side of it.
 */
export function tally(entries: PredictionEntry[], today: string): LedgerTally {
  const resolved = entries.filter(isResolved);
  const open = entries.filter((e) => !isResolved(e));
  const openDue = open.map((e) => e.due_at).filter(Boolean).sort();
  return {
    total: entries.length,
    open: open.length,
    resolved: resolved.length,
    wellCalibrated: resolved.filter(isCorrect).length,
    wrong: resolved.filter((e) => !isCorrect(e)).length,
    overdue: open.filter((e) => e.due_at && e.due_at < today).length,
    earliestOpenDue: openDue[0] ?? null,
  };
}

/** Open entries, the ones needing an outcome first. Overdue before the rest. */
export function openEntriesByUrgency(
  entries: PredictionEntry[],
): PredictionEntry[] {
  return entries
    .filter((e) => !isResolved(e))
    .sort((a, b) => a.due_at.localeCompare(b.due_at));
}

/** ISO date (YYYY-MM-DD) of a Date, in the viewer's own calendar day. */
export function isoDay(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * What a confidence MEANS, in words a non-technical Expert reads without
 * translating. The control shows these; the numbers are the caption.
 */
export const CONFIDENCE_WORDS: { value: number; words: string }[] = [
  { value: 0.1, words: "very doubtful" },
  { value: 0.2, words: "doubtful" },
  { value: 0.3, words: "leaning against it" },
  { value: 0.4, words: "could go either way" },
  { value: 0.5, words: "a coin flip" },
  { value: 0.6, words: "leaning toward it" },
  { value: 0.7, words: "fairly sure" },
  { value: 0.8, words: "quite sure" },
  { value: 0.9, words: "almost certain" },
];

export function confidenceWords(confidence: number): string {
  let best = CONFIDENCE_WORDS[0];
  for (const rung of CONFIDENCE_WORDS) {
    if (Math.abs(rung.value - confidence) < Math.abs(best.value - confidence)) {
      best = rung;
    }
  }
  return best.words;
}

/** The score of one resolved entry, said the way a person would say it. */
export function describeScore(entry: ResolvedPredictionEntry): string {
  const called = confidenceWords(entry.confidence);
  const happened = entry.outcome ? "it happened" : "it didn't";
  if (isCorrect(entry)) {
    return `You were ${called} and ${happened}. That one you called right — the reason behind it is worth keeping.`;
  }
  return `You were ${called} and ${happened}. That one went the other way — the reason behind it is where your system has an edge it doesn't know about yet.`;
}

/** Tolerant read of a Rulebook's `metadata.prediction_ledger`. */
export function readLedger(metadata: unknown): PredictionLedger {
  const empty: PredictionLedger = {
    schema: PREDICTION_LEDGER_SCHEMA,
    entries: [],
  };
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return empty;
  }
  const block = (metadata as Record<string, unknown>).prediction_ledger;
  if (!block || typeof block !== "object" || Array.isArray(block)) return empty;
  const raw = (block as Record<string, unknown>).entries;
  if (!Array.isArray(raw)) return empty;
  const entries: PredictionEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.prediction !== "string") continue;
    entries.push({
      id: row.id,
      case_label: typeof row.case_label === "string" ? row.case_label : "",
      prediction: row.prediction,
      confidence: typeof row.confidence === "number" ? row.confidence : 0.5,
      why: typeof row.why === "string" ? row.why : "",
      due_at: typeof row.due_at === "string" ? row.due_at : "",
      captured_by: row.captured_by === "voice" ? "voice" : "typed",
      created_at: typeof row.created_at === "string" ? row.created_at : "",
      created_by: typeof row.created_by === "string" ? row.created_by : "",
      outcome:
        row.outcome === true ? true : row.outcome === false ? false : null,
      outcome_note:
        typeof row.outcome_note === "string" ? row.outcome_note : "",
      resolved_at:
        typeof row.resolved_at === "string" ? row.resolved_at : null,
      distilled_run_id:
        typeof row.distilled_run_id === "string" ? row.distilled_run_id : null,
    });
  }
  return {
    schema:
      typeof (block as Record<string, unknown>).schema === "number"
        ? ((block as Record<string, unknown>).schema as number)
        : PREDICTION_LEDGER_SCHEMA,
    entries,
  };
}
