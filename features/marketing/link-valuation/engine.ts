/**
 * The Link Valuation Engine.
 *
 * A pure function: `(config, input) -> EvaluationResult`. No DB, no network,
 * no AI, no imports from the app. That is deliberate — it means the same
 * algorithm can be run in a UI on keystroke, in a batch job over ten thousand
 * prospects, and in a test, and give byte-identical answers.
 *
 * 🚨 THERE ARE NO SCORING NUMBERS IN THIS FILE. Every weight, band, divisor,
 * threshold and dollar amount comes from the config. If you find yourself
 * typing a number here that changes a score, it belongs in the config instead.
 * (The literals that do appear are structural — 0, 1, array indices, and the
 * neutral identities of a weighted mean.)
 */

import { applyCurve, interpolatePoints, roundHalfUp } from "./curves";
import type {
  BucketKey,
  EvaluationInput,
  EvaluationResult,
  GateResult,
  GroupResult,
  LinkValuationConfig,
  Provenance,
  SignalValue,
  TermResult,
} from "./types";

const EMPTY_VALUE: SignalValue = {
  value: null,
  provenance: "default",
  confidence: 0,
};

function readValue(input: EvaluationInput, key: string): SignalValue {
  return input.values[key] ?? EMPTY_VALUE;
}

function numeric(value: number | string | null): number | null {
  if (value === null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// ---------------------------------------------------------------------------
// Groups: the weighted mean over PRESENT members.
// ---------------------------------------------------------------------------

/**
 * Collapse correlated members into one composite.
 *
 * The weights are renormalised over the members that actually arrived, so a
 * domain measured by five sources and one measured by two land on the same
 * 0–100 scale. What differs is `confidence` — which is the honest place for
 * "we know less about this one" to show up, rather than in the score.
 */
function evaluateGroups(
  config: LinkValuationConfig,
  input: EvaluationInput,
): { results: GroupResult[]; byKey: Map<string, GroupResult> } {
  const results: GroupResult[] = [];
  const byKey = new Map<string, GroupResult>();

  for (const group of config.groups) {
    const missing: string[] = [];
    let weightSum = 0;
    let weightedValue = 0;
    let trustSum = 0;
    let present = 0;

    for (const member of group.members) {
      const raw = readValue(input, member.signalKey);
      const curved = applyCurve(member.curve, raw.value);
      if (curved === null) {
        missing.push(member.signalKey);
        continue;
      }
      present += 1;
      weightSum += member.weight;
      weightedValue += curved * member.weight;
      trustSum += member.weight * (raw.confidence > 0 ? raw.confidence : 1);
    }

    const measured =
      group.enabled && present >= group.minMembers && weightSum > 0;
    const result: GroupResult = {
      key: group.key,
      label: group.label,
      value: measured ? weightedValue / weightSum : null,
      // Confidence blends HOW MUCH of the group arrived with HOW MUCH we trust
      // what did. Both matter: three shaky sources are not one solid one.
      confidence: measured
        ? (trustSum / weightSum) * (present / Math.max(group.members.length, 1))
        : 0,
      presentMembers: present,
      totalMembers: group.members.length,
      missing,
    };
    results.push(result);
    byKey.set(group.key, result);
  }

  return { results, byKey };
}

// ---------------------------------------------------------------------------
// Terms
// ---------------------------------------------------------------------------

function resolveTermInput(
  config: LinkValuationConfig,
  input: EvaluationInput,
  groups: Map<string, GroupResult>,
  term: LinkValuationConfig["terms"][number],
): {
  raw: number | string | null;
  provenance: Provenance | "mixed" | "none";
  confidence: number;
} {
  if (term.input.kind === "group") {
    const group = groups.get(term.input.groupKey);
    return {
      raw: group?.value ?? null,
      provenance: group && group.value !== null ? "derived" : "none",
      confidence: group?.confidence ?? 0,
    };
  }

  if (term.input.kind === "signal") {
    const signal = readValue(input, term.input.signalKey);
    return {
      raw: signal.value,
      provenance: signal.value === null ? "none" : signal.provenance,
      confidence: signal.value === null ? 0 : signal.confidence,
    };
  }

  // Ratio — two signals from ideally the SAME index. Documented on the term.
  const top = readValue(input, term.input.numeratorKey);
  const bottom = readValue(input, term.input.denominatorKey);
  const topValue = numeric(top.value);
  const bottomValue = numeric(bottom.value);
  if (topValue === null || bottomValue === null || bottomValue === 0) {
    return { raw: null, provenance: "none", confidence: 0 };
  }
  const sameProvenance = top.provenance === bottom.provenance;
  return {
    raw: topValue / bottomValue,
    provenance: sameProvenance ? top.provenance : "mixed",
    confidence: Math.min(top.confidence || 1, bottom.confidence || 1),
  };
}

function evaluateTerms(
  config: LinkValuationConfig,
  input: EvaluationInput,
  groups: Map<string, GroupResult>,
): TermResult[] {
  const results: TermResult[] = [];

  for (const term of config.terms) {
    if (!term.enabled) {
      results.push({
        key: term.key,
        label: term.label,
        bucket: term.bucket,
        status: "disabled",
        rawInput: null,
        curved: 0,
        weight: term.weight,
        points: 0,
        share: 0,
        explain: term.explain,
        provenance: "none",
        confidence: 0,
      });
      continue;
    }

    const resolved = resolveTermInput(config, input, groups, term);
    const curved = applyCurve(term.curve, resolved.raw);

    results.push({
      key: term.key,
      label: term.label,
      bucket: term.bucket,
      // A term whose input never arrived contributes NOTHING — it does not
      // contribute zero points as though it had been measured and found bad.
      status: curved === null ? "missing" : "measured",
      rawInput: resolved.raw,
      curved: curved ?? 0,
      weight: term.weight,
      points: curved === null ? 0 : curved * term.weight,
      share: 0,
      explain: term.explain,
      provenance: resolved.provenance,
      confidence: resolved.confidence,
    });
  }

  // Share-of-bucket, for the "what actually moved this score" view. Computed
  // against positive points only, so a penalty cannot make shares exceed 100%.
  for (const bucket of config.buckets) {
    const inBucket = results.filter((term) => term.bucket === bucket.key);
    const positive = inBucket.reduce(
      (sum, term) => sum + Math.max(term.points, 0),
      0,
    );
    if (positive <= 0) continue;
    for (const term of inBucket) {
      term.share = Math.max(term.points, 0) / positive;
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------

function evaluateGates(
  config: LinkValuationConfig,
  input: EvaluationInput,
): GateResult[] {
  return config.gates.map((gate) => {
    if (!gate.enabled) {
      return {
        key: gate.key,
        label: gate.label,
        action: gate.action,
        message: gate.message,
        fired: false,
      };
    }

    const signal = readValue(input, gate.signalKey);
    let fired = false;

    if (gate.op === "missing") {
      fired = signal.value === null || signal.value === "";
    } else if (
      typeof gate.value === "string" ||
      typeof signal.value === "string"
    ) {
      const left = String(signal.value ?? "")
        .trim()
        .toLowerCase();
      const right = String(gate.value ?? "")
        .trim()
        .toLowerCase();
      if (gate.op === "eq") fired = left === right;
      if (gate.op === "neq") fired = left !== right && left !== "";
    } else {
      const left = numeric(signal.value);
      const right = typeof gate.value === "number" ? gate.value : null;
      if (left !== null && right !== null) {
        if (gate.op === "lt") fired = left < right;
        if (gate.op === "lte") fired = left <= right;
        if (gate.op === "gt") fired = left > right;
        if (gate.op === "gte") fired = left >= right;
        if (gate.op === "eq") fired = left === right;
        if (gate.op === "neq") fired = left !== right;
      }
    }

    return {
      key: gate.key,
      label: gate.label,
      action: gate.action,
      message: gate.message,
      fired,
    };
  });
}

// ---------------------------------------------------------------------------
// Labels + money
// ---------------------------------------------------------------------------

function resolveLabel(
  bands: readonly { from: number; to: number; label: string }[],
  at: number,
): string {
  for (const band of bands) {
    if (at >= band.from && at <= band.to) return band.label;
  }
  const sorted = [...bands].sort((a, b) => a.from - b.from);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first && at < first.from) return first.label;
  if (last) return last.label;
  return "";
}

// ---------------------------------------------------------------------------
// The public entry point
// ---------------------------------------------------------------------------

export function evaluateLink(
  config: LinkValuationConfig,
  input: EvaluationInput,
): EvaluationResult {
  const warnings: string[] = [];
  const { results: groupResults, byKey: groupMap } = evaluateGroups(
    config,
    input,
  );
  const terms = evaluateTerms(config, input, groupMap);
  const gates = evaluateGates(config, input);

  const buckets = {} as Record<
    BucketKey,
    { raw: number; score: number; enabled: boolean }
  >;
  const termDefs = new Map(config.terms.map((term) => [term.key, term]));

  for (const bucket of config.buckets) {
    const live = terms.filter(
      (term) => term.bucket === bucket.key && term.status === "measured",
    );

    let raw: number;
    if (bucket.divisorMode === "meanOfPresent") {
      // A weighted mean over the terms that ARRIVED — so a signal we could not
      // source lowers confidence, never the score. Penalties sit outside the
      // mean so they adjust the result instead of diluting it.
      let numerator = 0;
      let denominator = 0;
      let additive = 0;
      for (const term of live) {
        if (termDefs.get(term.key)?.mode === "additive") {
          additive += term.points;
          continue;
        }
        numerator += term.points;
        denominator += term.weight;
      }
      const mean = denominator > 0 ? numerator / denominator : 0;
      raw = mean + additive;
    } else {
      raw = live.reduce((sum, term) => sum + term.points, 0);
    }

    const floored = bucket.floorAtZero ? Math.max(raw, 0) : raw;
    const divisor = bucket.divisor === 0 ? 1 : bucket.divisor;
    buckets[bucket.key] = {
      raw,
      score: bucket.enabled ? floored / divisor : 0,
      enabled: bucket.enabled,
    };
  }

  const totalScore = config.buckets
    .filter((bucket) => bucket.enabled)
    .reduce(
      (sum, bucket) => sum + (buckets[bucket.key]?.score ?? 0) * bucket.weight,
      0,
    );

  const rejected = gates.some((gate) => gate.fired && gate.action === "reject");
  const zeroed = gates.some(
    (gate) => gate.fired && gate.action === "zero_value",
  );

  const labels: Record<string, string> = {};
  for (const [key, set] of Object.entries(config.labels)) {
    const at =
      set.source === "total" ? totalScore : (buckets[set.source]?.score ?? 0);
    labels[key] = resolveLabel(set.bands, at);
  }

  // The score the MONEY reads — rounded first when the config says so.
  const moneyScore =
    config.money.roundScoreTo === null
      ? totalScore
      : roundHalfUp(totalScore, config.money.roundScoreTo);

  const curveValue = interpolatePoints(
    config.money.curve,
    moneyScore,
    config.money.interpolate,
  );
  const maxValue =
    rejected || zeroed ? 0 : roundHalfUp(curveValue, config.money.roundTo);

  const roleCeilings: Record<string, number> = {};
  for (const role of config.money.roles) {
    const band = role.bands.find(
      (entry) => moneyScore >= entry.from && moneyScore <= entry.to,
    );
    const multiplier = band?.multiplier ?? 0;
    roleCeilings[role.key] = roundHalfUp(
      maxValue * multiplier,
      config.money.roundTo,
    );
  }

  const authorizationBand = config.money.authorization.find(
    (band) => moneyScore >= band.from && moneyScore <= band.to,
  );

  // Confidence: the evidence-weighted share of the model that was actually fed.
  const measurable = terms.filter((term) => term.status !== "disabled");
  const measured = measurable.filter((term) => term.status === "measured");
  const coverage =
    measurable.length === 0 ? 0 : measured.length / measurable.length;
  const trust =
    measured.length === 0
      ? 0
      : measured.reduce(
          (sum, term) => sum + (term.confidence > 0 ? term.confidence : 1),
          0,
        ) / measured.length;
  const confidence = coverage * trust;

  if (measurable.length > 0 && coverage < 1) {
    warnings.push(
      `${measurable.length - measured.length} of ${measurable.length} scored inputs were not supplied — they were excluded, not scored as zero.`,
    );
  }
  const overCurve = config.money.curve[config.money.curve.length - 1];
  if (overCurve && totalScore > overCurve.at) {
    warnings.push(
      `Score ${totalScore.toFixed(1)} is above the top of the value curve (${overCurve.at}); the price is clamped to $${overCurve.value}.`,
    );
  }

  return {
    configId: config.id,
    configVersion: config.version,
    buckets,
    totalScore,
    groups: groupResults,
    terms,
    gates,
    rejected,
    labels,
    money: {
      maxValue,
      roleCeilings,
      authorization: authorizationBand?.ceilings ?? null,
    },
    confidence,
    warnings,
  };
}

/** Display helper — one place that decides how a score is shown. */
export function formatScore(
  value: number,
  config: LinkValuationConfig,
): string {
  return roundHalfUp(value, config.scoreDecimals).toFixed(config.scoreDecimals);
}
