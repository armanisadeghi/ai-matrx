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

/**
 * THE SECONDS BASE (2026-09-12, the seventh adversarial review).
 *
 * THE MISS. Everything above is MILLISECOND arithmetic, and it was the whole
 * lane. A cascade that divides SECONDS by `60 / 3600 / 86400` therefore
 * matched nothing, so ~80 live seconds-and-minutes bodies across three repos
 * read GREEN — including `duration(seconds)` in matrx-frontend's
 * FindingEffectivenessPanel, a full s/m/h/d cascade, and `formatRelativeAge`
 * in the MCP admin service, which is a "2m ago" relative time wearing a
 * duration's clothes.
 *
 * THE UNIT LAW is why the base matters rather than being a detail: the unit is
 * in the NAME. A seconds field goes to `formatDurationSeconds`, a minutes
 * field to `formatDurationMinutes` — never `* 1000`'d into the ms one at the
 * call site, which is the same duplication one layer down.
 *
 * WHY `/ 60` IS NOT ENOUGH ON ITS OWN, and what keeps this from firing on
 * every sexagesimal in the codebase:
 *   - the UNIT-LABEL requirement is unchanged and does all the real work. An
 *     angle (`${deg}° ${arcmin}'`) and a frame budget (`${fps} fps`) divide by
 *     60 and name no duration unit, so neither matches.
 *   - a NUMERIC left operand is excluded outright. `1000 / 60` is a frame
 *     budget, `16.667` ms per frame — the shape that would otherwise slip
 *     through the label requirement the moment somebody prints it as `}ms`.
 *     A real formatter divides a VARIABLE, never a literal.
 *   - a bare `60` that opens a PRODUCT is not a seconds base: `/ (60 * 1000)`
 *     is the millisecond lane's, already covered above, and matching it here
 *     would report the same line twice under the wrong unit.
 */
const SECONDS_BASE = String.raw`(?:604_?800|86_?400|3_?600|60\s*\*\s*60\s*\*\s*24\s*\*\s*7|60\s*\*\s*60\s*\*\s*24|24\s*\*\s*3_?600|60\s*\*\s*60|60(?!\s*\*))(?![\d_.])`;
const SECONDS_DIVISOR_RE = new RegExp(
  String.raw`(?<!\d[\d_]*\s*)(?:[/%]\s*\(?\s*${SECONDS_BASE}|[<>]=?\s*\(?\s*${SECONDS_BASE})`,
);

const MS_DIVISOR_RE = new RegExp(
  String.raw`(?:[/%]\s*\(?\s*${TIME_BASE}|[<>]=?\s*\(?\s*${TIME_BASE})`,
);

/**
 * A line reduced to the EXPRESSIONS on it: comments gone, and the TEXT of
 * string literals gone. Two things made this necessary the moment the seconds
 * base landed, and both were live:
 *
 *   - `const frameBudgetMs = 1000 / 60; // 60 fps` carries a SECOND `/ 60`
 *     inside the comment, where the literal-operand exclusion cannot see it.
 *     Prose about time is not time arithmetic.
 *   - `className="bg-primary/60"` is a TAILWIND OPACITY MODIFIER, and so are
 *     `text-muted-foreground/60`, `divide-border/60` and every other
 *     `<color>/<alpha>`. They are the most common `/60` in this fleet by a
 *     wide margin — six of them were reported as duration formatters on the
 *     first real run of this lane, in files that format nothing.
 *
 * A `${…}` interpolation inside a template literal is CODE, not text, and is
 * kept: `${Math.round(seconds / 60)}m` is precisely what this lane is for. The
 * UNIT LABEL is matched against the RAW window and is unaffected, so a bare
 * `"ms"` / `"min"` string literal still counts as evidence.
 */
function codeOnlyLine(line) {
  const noComments = line
    .replace(/(^|[^:])\/\/.*$/, "$1")
    .replace(/\/\*.*?\*\//g, " ");
  // Plain quoted strings: the whole body is text.
  const noQuoted = noComments
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");
  // Template literals: keep the `${…}` interpolations, drop the text around
  // them. Done character-wise because the parts nest.
  let out = "";
  let i = 0;
  while (i < noQuoted.length) {
    if (noQuoted[i] !== "`") {
      out += noQuoted[i];
      i += 1;
      continue;
    }
    i += 1; // past the opening backtick
    while (i < noQuoted.length && noQuoted[i] !== "`") {
      if (noQuoted[i] === "\\") {
        i += 2;
        continue;
      }
      if (noQuoted[i] === "$" && noQuoted[i + 1] === "{") {
        let depth = 1;
        i += 2;
        while (i < noQuoted.length && depth > 0) {
          if (noQuoted[i] === "{") depth += 1;
          else if (noQuoted[i] === "}") depth -= 1;
          if (depth > 0) out += noQuoted[i];
          i += 1;
        }
        out += " ";
        continue;
      }
      i += 1; // ordinary template TEXT — dropped
    }
    i += 1; // past the closing backtick
  }
  return out;
}

/** Either base: a time count meeting an operator that turns it into a unit. */
function timeBaseHit(line) {
  const code = codeOnlyLine(line);
  return MS_DIVISOR_RE.test(code) || SECONDS_DIVISOR_RE.test(code);
}

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
    if (!timeBaseHit(line)) continue;
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
  // THE SECONDS CASCADE (2026-09-12). Byte-for-byte the live body from
  // matrx-frontend's FindingEffectivenessPanel — the one this lane returned
  // zero findings on while it was millisecond-only. A planted copy of the real
  // miss, not a sketch of it.
  const plantedSeconds = [
    "function duration(seconds: number | null | undefined): string {",
    '  if (!hasSignal(seconds)) return "—";',
    "  if (seconds < 90) return `${Math.round(seconds)}s`;",
    "  if (seconds < 5400) return `${Math.round(seconds / 60)}m`;",
    "  if (seconds < 172800) return `${Math.round(seconds / 3600)}h`;",
    "  return `${Math.round(seconds / 86400)}d`;",
    "}",
  ].join("\n");
  if (durationShapeIn(plantedSeconds).length === 0) {
    return {
      ok: false,
      why: "a planted SECONDS duration cascade was NOT reported (the lane is millisecond-only again)",
    };
  }

  // A seconds AGE becoming "2m ago" — same arithmetic, relative-time voice.
  const plantedAge = [
    "function formatRelativeAge(seconds: number): string {",
    "  if (seconds < 60) return `${Math.round(seconds)}s ago`;",
    "  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;",
    "  return `${Math.round(seconds / 86400)}d ago`;",
    "}",
  ].join("\n");
  if (durationShapeIn(plantedAge).length === 0) {
    return { ok: false, why: "a planted seconds-age relative-time body was NOT reported" };
  }

  // …AND THE TWO SEXAGESIMALS THAT ARE NOT TIME. Both divide by 60; neither
  // names a duration unit, and the frame budget additionally divides a
  // LITERAL, which a real formatter never does.
  const framesPerSecond = [
    "const frameBudgetMs = 1000 / 60; // 60 fps",
    "const readout = `${frameBudgetMs.toFixed(1)}ms`;",
    "const fpsLabel = `${Math.round(frames / elapsed)} fps`;",
  ].join("\n");
  const fpsHits = durationShapeIn(framesPerSecond);
  if (fpsHits.length !== 0) {
    return {
      ok: false,
      why: `frame-rate maths was reported as a duration formatter (${fpsHits
        .map((h) => h.text)
        .join(" | ")})`,
    };
  }
  const degrees = [
    "const deg = Math.floor(arcSeconds / 3600);",
    "const arcmin = Math.floor((arcSeconds % 3600) / 60);",
    "const bearing = `${deg}° ${arcmin}′`;",
  ].join("\n");
  const degreeHits = durationShapeIn(degrees);
  if (degreeHits.length !== 0) {
    return {
      ok: false,
      why: `angle maths was reported as a duration formatter (${degreeHits
        .map((h) => h.text)
        .join(" | ")})`,
    };
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
  // TAILWIND OPACITY IS NOT A TIME BASE. `bg-primary/60` is the most common
  // `/60` in this fleet, and six of them were reported as duration formatters
  // on this lane's first real run.
  const tailwind = [
    'const cls = "text-muted-foreground/60 w-7 shrink-0";',
    '<div className="divide-y divide-border/60">{`${label} ms`}</div>',
    'const dot = "h-1.5 w-1.5 animate-pulse rounded-full bg-primary/60";',
  ].join("\n");
  const tailwindHits = durationShapeIn(tailwind);
  if (tailwindHits.length !== 0) {
    return {
      ok: false,
      why: `a Tailwind opacity modifier was reported as a duration formatter (${tailwindHits
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
