/**
 * duration-shape.mjs — THE SHAPE RULE for duration formatting.
 *
 * WHY (the same hole `byte-size-shape.mjs` opened, in the other formatter
 * family). `check:package-twins` is NAME-based, and `formatDurationMs` /
 * `formatDurationSeconds` / `formatDurationMinutes` are all registered and
 * clean. That proved nothing: aidream's dashboard carried SEVEN duration
 * bodies under the private names `fmtMs` and `fmtMsSummary`, each turning
 * milliseconds into `1.5m` / `2.3s` / `450ms` with its own rounding, and the
 * name register could not see one of them. A capability is duplicated by its
 * SHAPE long before anybody re-uses its spelling.
 *
 * THE PATTERN THIS DETECTS. A millisecond count becoming a unit string, which
 * in JavaScript is always the same two things in one short window:
 *   (a) a DIVISION, MODULO or THRESHOLD COMPARISON against a time base —
 *       1000 / 60000 / 3600000, or the same written as `1000 * 60`,
 *       `60 * 1000`, `60 * 60 * 1000`, with or without `_` separators; and
 *   (b) a duration UNIT LABEL bound to a value — `}ms`, `} s`, `}m`, `}h`,
 *       `} min`, `} seconds`, or a bare `"ms"` / `"min"` string literal.
 *
 * A bare `ms / 1000` never matches on its own. Converting milliseconds to
 * seconds for an API payload, a `setTimeout` budget, a rate denominator or a
 * chart axis is legitimate and common, so the unit LABEL is what separates a
 * display formatter from arithmetic — exactly as the multiply/divide asymmetry
 * does for byte capacity constants. The unit tokens are matched longest-first
 * and each ends on a word boundary, so `${x} meters`, `${n} messages` and
 * `${mb} MB/s` are not duration labels.
 *
 * THE ONE HOME is `formatDurationMs` (and its `Seconds`/`Minutes` siblings)
 * from `@ai-matrx/kit/format`, which owns THE UNIT LAW — the unit is in the
 * name, never a bare `number` — and the three voices the fleet speaks:
 * `clock` (`9:04`), `compact` (`5.2s`, `5m 30s`) and `coarse` (`45 min`).
 *
 * Exported as a module so `check-package-twins.mjs` can run it as a shape lane
 * and so the self-test can plant a body and prove it fails.
 */

/**
 * A duration unit label bound to a value: the tail of a template
 * interpolation (`${…}ms`), or a bare unit string literal. Longest-first so
 * `min` wins over `m`, and every alternative ends on a word boundary so a
 * longer word starting with the same letters (`meters`, `hours` is fine,
 * `messages` is not a match) cannot be mistaken for a unit.
 */
const DURATION_UNIT_RE =
  /(?:\}\s*(?:ms|sec(?:s|onds?)?|min(?:s|utes?)?|h(?:rs?|ours?)?|s|m)\b|["'`]\s*(?:ms|sec(?:s|onds?)?|min(?:s|utes?)?|hrs?|hours?)\s*["'`])/;

/**
 * A TIME-BASE division, modulo or threshold comparison. Multiplication alone
 * never matches — `TIMEOUT_MS = 30 * 1000` is a budget, not a formatter —
 * while `/ (1000 * 60)` does, because the operator in front is a division.
 */
const TIME_BASE = String.raw`(?:1_?000|60_?000|3_?600_?000|1000\s*\*\s*60|60\s*\*\s*1000|60\s*\*\s*60\s*\*\s*1000|1000\s*\*\s*60\s*\*\s*60)`;
const MS_DIVISOR_RE = new RegExp(
  String.raw`(?:[/%]\s*\(?\s*${TIME_BASE}|[<>]=?\s*\(?\s*${TIME_BASE})`,
);

/**
 * How many lines on either side of a hit may supply the unit label — the same
 * bidirectional window as the byte-size lane, and for the same reason: the
 * cascade style writes the label after the division, while a loop or a
 * `const units = ["s","m","h"]` table declares it above.
 */
const WINDOW = 6;

/**
 * Duration-formatting findings in one file's source.
 * Returns [{ line, text }] — every place a time count becomes a unit string.
 */
export function durationShapeIn(source) {
  const lines = source.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!MS_DIVISOR_RE.test(line)) continue;
    const window = lines
      .slice(Math.max(0, i - WINDOW), i + WINDOW + 1)
      .join("\n");
    if (!DURATION_UNIT_RE.test(window)) continue;
    out.push({ line: i + 1, text: line.trim() });
  }
  return out;
}

/** Proves the rule can fail and does not fire on plain time arithmetic. */
export function selfTestDurationShape() {
  const planted = [
    "function fmtMs(ms: number): string {",
    "  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;",
    "  if (ms >= 1_000) return `${(ms / 1_000).toFixed(1)}s`;",
    "  return `${ms}ms`;",
    "}",
  ].join("\n");
  const found = durationShapeIn(planted);
  if (found.length === 0) {
    return { ok: false, why: "a planted duration body was NOT reported" };
  }
  const arithmetic = [
    "const TIMEOUT_MS = 30 * 1000;",
    "const POLL_INTERVAL = 60 * 1000; // one minute",
    "payload.elapsed_seconds = Math.round(elapsedMs / 1000);",
    "const perSecond = bytes / (elapsedMs / 1000);",
  ].join("\n");
  const arithmeticHits = durationShapeIn(arithmetic);
  if (arithmeticHits.length !== 0) {
    return {
      ok: false,
      why: `plain time arithmetic was reported as a formatter (${arithmeticHits
        .map((h) => h.text)
        .join(" | ")})`,
    };
  }
  const notUnits = [
    "const km = `${(meters / 1000).toFixed(1)} kilometers`;",
    "const label = `${(count / 1000).toFixed(1)} messages`;",
  ].join("\n");
  if (durationShapeIn(notUnits).length !== 0) {
    return { ok: false, why: "a non-duration unit label was reported" };
  }
  const adopted = [
    'import { formatDurationMs } from "@ai-matrx/kit/format";',
    'const label = formatDurationMs(row.duration_ms, { style: "compact" });',
  ].join("\n");
  if (durationShapeIn(adopted).length !== 0) {
    return { ok: false, why: "an adopted call site was reported" };
  }
  return { ok: true };
}
