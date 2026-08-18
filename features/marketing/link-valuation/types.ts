/**
 * Link Valuation Engine — the type contract.
 *
 * THE ONE RULE THIS FILE EXISTS TO ENFORCE: **there are no numbers in the
 * engine.** Every weight, band edge, slope, divisor, threshold, label
 * boundary, dollar point and role multiplier lives in a `LinkValuationConfig`
 * value. `engine.ts` may not contain a numeric literal that affects a score.
 * That is what makes the algorithm tunable instead of frozen.
 *
 * The second rule: a signal is defined by its SEMANTICS, never by the vendor
 * that happened to sell it. `SignalDef.semantic`/`scale`/`entity` are the
 * contract a substitute source must satisfy — an AI estimate, a different API,
 * or a human typing a number are interchangeable as long as they answer the
 * same question on the same scale.
 *
 * Third: **unmeasured is never zero.** A missing signal drops out of its
 * group's weighted mean and lowers `confidence`; it never scores 0, because 0
 * means "measured, and worthless" — a different sentence entirely.
 */

/** Where a value came from. Shown to the user on every number. */
export type Provenance = "api" | "ai" | "manual" | "derived" | "default";

/** What the engine did with a signal it was asked for. */
export type SignalStatus = "measured" | "missing" | "disabled";

// ---------------------------------------------------------------------------
// Curves — every transform the algorithm can apply, each fully parameterised.
// ---------------------------------------------------------------------------

/**
 * A piecewise linear function of the form the source spreadsheets always take:
 * `IF(x < upTo, intercept + slope*x, ...)`. `slope: 0` gives a flat band (the
 * common case: TLD points, URL-length tiers). Non-zero slope reproduces the
 * `300 - ratio*30` shapes exactly.
 *
 * `smooth: true` removes the discontinuities between segments by interpolating
 * between each segment's end value and the next segment's start value. The
 * hand-built originals jump — 0.001 of input can move 100 points — and that is
 * a knob, not a law.
 */
export interface SegmentCurve {
  kind: "segments";
  segments: readonly { upTo: number; intercept: number; slope: number }[];
  /** Applied above the last segment's `upTo`. */
  fallback: { intercept: number; slope: number };
  smooth?: boolean;
}

/** `out = value * scale`, i.e. straight passthrough with a multiplier. */
export interface LinearCurve {
  kind: "linear";
  scale: number;
  offset: number;
}

/** Rescale a known input range onto an output range. The substitution workhorse. */
export interface RescaleCurve {
  kind: "rescale";
  inMin: number;
  inMax: number;
  outMin: number;
  outMax: number;
  clamp: boolean;
}

/** `out = mult * log_base(value)`. Traffic, link counts — anything log-distributed. */
export interface LogGainCurve {
  kind: "logGain";
  base: number;
  mult: number;
  /** Value at or below this is treated as unmeasured rather than -Infinity. */
  floorInput: number;
}

/**
 * `out = mult * (ceiling - log_base(value))` — for metrics where SMALLER IS
 * BETTER and the range spans orders of magnitude (a global rank position).
 *
 * NOTE for anyone substituting a source: this term is a function of the
 * provider's INDEX SIZE. A rank of 2,000,000 out of 200M sites and out of 2B
 * sites are different facts. Prefer feeding a percentile through `rescale`.
 */
export interface LogDropCurve {
  kind: "logDrop";
  base: number;
  ceiling: number;
  mult: number;
  floorInput: number;
}

/** Enum → points. Case-insensitive on lookup. */
export interface CategoricalCurve {
  kind: "categorical";
  map: Readonly<Record<string, number>>;
  fallback: number;
}

export type Curve =
  | SegmentCurve
  | LinearCurve
  | RescaleCurve
  | LogGainCurve
  | LogDropCurve
  | CategoricalCurve;

// ---------------------------------------------------------------------------
// Signals — what we measure, and what a substitute must satisfy.
// ---------------------------------------------------------------------------

export type SignalKindOfValue = "number" | "enum";
export type SignalEntity = "domain" | "page" | "target" | "deal";

export interface SignalSource {
  kind: Provenance;
  /** Human name of the provider, or the AI mandate that would produce it. */
  label: string;
  /**
   * For `kind: "ai"` — the Mandate key that resolves the agent. Code names the
   * job; the DATABASE decides which agent fulfils it. Never an agent id, never
   * a prompt in this repo.
   */
  mandateKey?: string;
  /** Preference order within a signal; lowest wins when several are present. */
  priority: number;
  /** How much to trust this source relative to a perfect one, 0–1. */
  trust: number;
}

export interface SignalDef {
  key: string;
  label: string;
  entity: SignalEntity;
  valueKind: SignalKindOfValue;
  /**
   * THE SIGNAL CONTRACT. One sentence defining what the number means, precisely
   * enough that a different provider — or an AI — can be checked against it.
   */
  semantic: string;
  scale: {
    min: number;
    max: number;
    direction: "higher-better" | "lower-better" | "neutral";
    unit: string;
  };
  /** Allowed values when `valueKind: "enum"`. */
  options?: readonly string[];
  sources: readonly SignalSource[];
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Groups — the answer to "four of these numbers are really one number".
// ---------------------------------------------------------------------------

/**
 * A composite signal. Members are averaged by weight **over the ones actually
 * present**, so adding a fifth source of the same underlying fact raises
 * CONFIDENCE, not score. This is the fix for the original sheet summing seven
 * correlated authority metrics as though they were seven independent opinions.
 */
export interface GroupDef {
  key: string;
  label: string;
  description: string;
  members: readonly { signalKey: string; weight: number; curve: Curve }[];
  /** Fewer present members than this ⇒ the group is unmeasured (not zero). */
  minMembers: number;
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Terms — what actually adds points, and to which bucket.
// ---------------------------------------------------------------------------

export type BucketKey = "quality" | "relevance" | "placement";

export type TermInput =
  | { kind: "group"; groupKey: string }
  | { kind: "signal"; signalKey: string }
  /** numerator ÷ denominator — the trust-vs-volume shape. */
  | { kind: "ratio"; numeratorKey: string; denominatorKey: string };

/**
 * How a term joins its bucket.
 *
 * `average` — participates in a weighted MEAN over the terms that actually
 *   arrived. This is what makes a missing input cost confidence instead of
 *   points, and it is the right mode for any signal normalised to a 0–100
 *   scale.
 * `additive` — added to the bucket after the mean. The right mode for bonuses
 *   and penalties, which must not dilute the average they are adjusting.
 *
 * The 2018 sheet is entirely `additive` with a fixed divisor; that is exactly
 * why a blank input silently behaved as a zero there.
 */
export type TermMode = "average" | "additive";

export interface TermDef {
  key: string;
  label: string;
  bucket: BucketKey;
  input: TermInput;
  curve: Curve;
  mode: TermMode;
  weight: number;
  /** Prose shown beside the contribution so a non-technical user sees WHY. */
  explain: string;
  enabled: boolean;
}

/**
 * `fixed` — divide the summed points by a constant (the spreadsheet's way; a
 *   missing input therefore drags the score down).
 * `meanOfPresent` — divide by the summed weights of the terms that ARRIVED, so
 *   the score answers "how good is the evidence we have" and the gaps show up
 *   in `confidence` where a human can see them.
 */
export type DivisorMode = "fixed" | "meanOfPresent";

export interface BucketDef {
  key: BucketKey;
  label: string;
  divisorMode: DivisorMode;
  divisor: number;
  /** Share of the total score this bucket carries. */
  weight: number;
  floorAtZero: boolean;
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Gates — the reject rules the source document promised and never specified.
// ---------------------------------------------------------------------------

export type GateOp = "lt" | "lte" | "gt" | "gte" | "eq" | "neq" | "missing";
export type GateAction = "reject" | "zero_value" | "flag";

export interface GateDef {
  key: string;
  label: string;
  signalKey: string;
  op: GateOp;
  value: number | string | null;
  action: GateAction;
  message: string;
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Labels + money
// ---------------------------------------------------------------------------

export interface LabelBand {
  from: number;
  to: number;
  label: string;
}

export interface LabelSetDef {
  /** Which computed number this label reads. */
  source: "total" | BucketKey;
  bands: readonly LabelBand[];
}

export interface RoleDef {
  key: string;
  label: string;
  /** Ceiling = maxValue × multiplier, chosen by the band the score falls in. */
  bands: readonly { from: number; to: number; multiplier: number }[];
}

export interface AuthorizationBand {
  from: number;
  to: number;
  /** Role key → dollar ceiling, or `"free"`. Overlaps are rejected by validation. */
  ceilings: Readonly<Record<string, number | "free">>;
}

export interface MoneyDef {
  currency: string;
  /**
   * Score → maximum link value, as points on a curve. Interpolated between
   * points, clamped outside. Editable as a table AND as a chart in the UI.
   */
  curve: readonly { at: number; value: number }[];
  interpolate: boolean;
  /**
   * Round the score to this many decimals BEFORE reading the value curve and
   * the role bands. `null` reads the curve continuously.
   *
   * The spreadsheet originals all round to an integer first, which is why a
   * score of 35.52 prices as 36. Continuous is smoother and removes a cliff at
   * every band edge; integer reproduces the sheet. It is a knob because it is
   * a business decision, not a technical one.
   */
  roundScoreTo: number | null;
  roundTo: number;
  roles: readonly RoleDef[];
  authorization: readonly AuthorizationBand[];
}

// ---------------------------------------------------------------------------
// The config
// ---------------------------------------------------------------------------

export interface LinkValuationConfig {
  id: string;
  name: string;
  version: string;
  description: string;
  /** Stamped onto every evaluation so a past number can always be explained. */
  signals: readonly SignalDef[];
  groups: readonly GroupDef[];
  terms: readonly TermDef[];
  buckets: readonly BucketDef[];
  gates: readonly GateDef[];
  labels: Readonly<Record<string, LabelSetDef>>;
  money: MoneyDef;
  /** Rounding for displayed scores. */
  scoreDecimals: number;
}

// ---------------------------------------------------------------------------
// Input + output
// ---------------------------------------------------------------------------

export interface SignalValue {
  value: number | string | null;
  provenance: Provenance;
  /** 0–1. An AI estimate at 0.6 counts less than a measured API value at 1. */
  confidence: number;
  note?: string;
}

export interface EvaluationInput {
  /** Identifier only — never scored. */
  domain: string;
  /**
   * What relevance is judged AGAINST. The source sheet never had this field;
   * the operator held it in their head. A system cannot.
   */
  target: { keyword: string; page: string; campaign: string };
  values: Readonly<Record<string, SignalValue>>;
}

export interface TermResult {
  key: string;
  label: string;
  bucket: BucketKey;
  status: SignalStatus;
  rawInput: number | string | null;
  curved: number;
  weight: number;
  points: number;
  /** Share of its bucket's positive points. Drives the "what moved this" view. */
  share: number;
  explain: string;
  provenance: Provenance | "mixed" | "none";
  confidence: number;
}

export interface GroupResult {
  key: string;
  label: string;
  value: number | null;
  confidence: number;
  presentMembers: number;
  totalMembers: number;
  missing: readonly string[];
}

export interface GateResult {
  key: string;
  label: string;
  action: GateAction;
  message: string;
  fired: boolean;
}

export interface EvaluationResult {
  configId: string;
  configVersion: string;
  buckets: Readonly<
    Record<BucketKey, { raw: number; score: number; enabled: boolean }>
  >;
  totalScore: number;
  groups: readonly GroupResult[];
  terms: readonly TermResult[];
  gates: readonly GateResult[];
  rejected: boolean;
  labels: Readonly<Record<string, string>>;
  money: {
    maxValue: number;
    roleCeilings: Readonly<Record<string, number>>;
    authorization: Readonly<Record<string, number | "free">> | null;
  };
  /** Overall evidence quality, 0–1 — how much of the model was actually fed. */
  confidence: number;
  warnings: readonly string[];
}
