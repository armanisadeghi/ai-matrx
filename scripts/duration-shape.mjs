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

/** The divide/modulo halves alone — what the label-free CLOCK lane requires. */
const SECONDS_DIVIDE_RE = new RegExp(
  String.raw`(?<!\d[\d_]*\s*)[/%]\s*\(?\s*${SECONDS_BASE}`,
);
const MS_DIVIDE_RE = new RegExp(String.raw`[/%]\s*\(?\s*${TIME_BASE}`);

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
 * The same bases, DIVISION AND MODULO ONLY — no threshold comparison.
 *
 * The label lanes admit `elapsed < 3_600_000` because a cascade's branch sits
 * beside the branch that prints, and the label is doing the real work. The
 * CLOCK lane has no label, so a comparison is all the evidence there is, and
 * it is not evidence: `findings.length > 60` is a LIST LENGTH, and
 * `features/admin/lint-debt/fix-prompt.ts` and `features/admin/dead-ends/fix-prompt.ts`
 * both truncate a finding list at 60 one line below a `${f.file}:${f.line}`
 * template join — a `}:${` beside a `> 60`, formatting nothing that is a time
 * at all. Both were reported on this lane's first run. A body that turns a
 * count into a clock always DIVIDES.
 */
function timeBaseDivides(line) {
  const code = codeOnlyLine(line);
  return MS_DIVIDE_RE.test(code) || SECONDS_DIVIDE_RE.test(code);
}

/**
 * NAMED TIME BASES (2026-09-12, the eighth adversarial review).
 *
 * THE MISS. `TIME_BASE` and `SECONDS_BASE` are LITERAL patterns, so a file
 * that gives the base a name — the thing a careful author does — walked
 * straight past both lanes even with the unit label on the same line:
 * `${Math.round(magnitude / HOUR_MS)} hr` in matrx-frontend's hr/tasks
 * urgency.ts and `${Math.round(remaining / (24 * HOUR_MS))}d left` in
 * assists/quiet.ts. The urgency one is the sharpest evidence there is: the
 * SAME function already calls `formatDurationMs(magnitude, { style: "coarse" })`
 * on the branch above and hand-rolls the two below it, so a guard reading
 * "adopted" over a half-adopted body is a guard that stopped the collapse
 * halfway and said nothing.
 *
 * This is exactly what `byteBaseNames` does one lane over, and the identifier
 * qualifies two ways: BOUND to a time-base literal in this file
 * (`const HOUR_MS = 60 * 60 * 1000`), or NAMED as a time base
 * (`DAY_MS`, `POLL_SECONDS`, `MS_PER_MINUTE`) — the second arm is what carries
 * `const DAY_MS = 24 * HOUR_MS`, whose right-hand side has no literal base in
 * it at all.
 *
 * 🚨 DIVISION AND MODULO ONLY — never a comparison, which is where the literal
 * lanes deliberately differ. A named constant in a `<` or `>=` is a BRANCH, and
 * branching on one is the normal, correct use of a named duration:
 * `HtmlPageGridView.tsx` computes `MILLISECONDS_PER_HOUR` / `TWO_DAYS_MS` /
 * `SEVEN_DAYS_MS` purely to pick which relative-time voice to call and formats
 * nothing itself. Admitting comparisons here would report every such file as a
 * formatter. A body that TURNS the count into a string always divides.
 */
const TIME_BASE_NAME_RE =
  /(?:_MS|_MSEC|_MILLIS|_SEC|_SECS|_SECONDS|_MIN|_MINS|_MINUTES|_HOUR|_HOURS|_DAY|_DAYS)$|^(?:MS|MSEC|SEC|SECS|SECONDS|MIN|MINS|MINUTES|HOURS?|DAYS?)_PER_/;

function timeBaseNames(source) {
  const boundRe = new RegExp(
    String.raw`(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::\s*number\s*)?=\s*([^;\n]+)`,
    "gm",
  );
  // The binding must BE a time base, not merely contain one: `const perSecond
  // = bytes / (elapsedMs / 1000)` mentions 1000 and is a rate, and admitting
  // it would make `/ perSecond` a duration divisor everywhere below it.
  const literalBase = new RegExp(
    String.raw`^\(?\s*(?:[\d_]+\s*\*\s*)*(?:${TIME_BASE}|${SECONDS_BASE})\s*\)?$`,
  );
  const names = new Set();
  let m;
  while ((m = boundRe.exec(source)) !== null) {
    const [, name, rawRhs] = m;
    const rhs = codeOnlyLine(rawRhs).trim();
    if (TIME_BASE_NAME_RE.test(name) || literalBase.test(rhs)) names.add(name);
  }
  return names;
}

/** A DIVISION or MODULO by one of this file's named time bases. */
function identifierTimeDivisorRe(names) {
  if (names.size === 0) return null;
  const alternation = [...names]
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  return new RegExp(
    String.raw`[/%]\s*\(?\s*(?:\d+[\d_]*\s*\*\s*)?(?:${alternation})\b`,
  );
}

/**
 * THE CLOCK BLIND SPOT (2026-09-12, the eighth adversarial review).
 *
 * THE MISS, and it was invisible BY CONSTRUCTION rather than by oversight.
 * Everything above requires a unit LABEL — `}ms`, `"min"`, `}h` — because the
 * label is what separates a display formatter from arithmetic. A COLON CLOCK
 * has no label: the colon IS the unit. So
 * `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` could never
 * match, and it is the single most duplicated duration body in the fleet —
 * every recorder, timer, transcript stamp, media player and HUD writes its
 * own, and twenty-plus of them read GREEN through seven adversarial reviews.
 *
 * THE SIGNAL THAT REPLACES THE LABEL. Time-base arithmetic (the same `/60`,
 * `%60`, `/3600`, ms and named bases above) next to one of the two things a
 * colon clock cannot be written without:
 *   - `padStart(2` — the zero-pad that makes `9:4` into `9:04`. Every clock
 *     body in this fleet has one; nothing else about a duration does.
 *   - a TEMPLATE COLON JOIN, `}:${` — an interpolation, a literal colon, and
 *     another interpolation. This spelling cannot occur in an object literal,
 *     a type annotation, a ternary or a CSS/Tailwind string, which is why it
 *     is the join form admitted and `}:{` (JSX) is not: `function Row({ n }: {
 *     n: number })` is exactly that shape and formats nothing.
 *
 * THE WINDOW IS ONE LINE, not six. A clock is three or four lines of tightly
 * coupled arithmetic and the pad always touches the modulo; widening it would
 * pull in an unrelated `padStart(2` further down the file for no reach at all
 * — all twenty-plus live bodies are caught at ±1.
 *
 * NEGATIVES this must stay silent on: a `padStart(2, "0")` building a DATE
 * (`yyyy-mm-dd`) or an ID, which does no time-base arithmetic; a `HH:MM` from
 * `toLocaleTimeString`, whose colons live inside the Intl runtime and whose
 * `hour: "2-digit"` colons are object-literal ones; and `/60` in a type or
 * object literal, which is not division at all.
 */
const PAD2_RE = /\.padStart\(\s*2\b/;
const COLON_JOIN_RE = /\}\s*:\s*\$\{/;
const CLOCK_VOICE_RE = new RegExp(
  `${PAD2_RE.source}|${COLON_JOIN_RE.source}`,
);
const CLOCK_WINDOW = 3;

/**
 * THE INPUT LEG: seconds multiplied up at a `formatDurationMs` call site.
 *
 * `formatDurationMs(durationSec * 1000)` renders correctly and is still the
 * exact pattern THE UNIT LAW exists to delete — the unit belongs in the NAME,
 * so a seconds value goes to `formatDurationSeconds`. Scaling at the call site
 * puts the conversion back where every twin had it, one call site at a time,
 * and the next one writes `* 1000` on a value that was already milliseconds.
 * Narrow on purpose: the multiplied operand must NAME itself as seconds.
 */
const SECONDS_SCALED_CALL_RE =
  /formatDurationMs\s*\(\s*[^),]*\b[A-Za-z_$][\w$.]*(?:Sec|Secs|Seconds|_s|_sec|_seconds)\b[^),]*\*\s*1_?000\b/;

/**
 * How many lines on either side of a hit may supply the unit label — the same
 * bidirectional window as the byte-size lane, and for the same reason: the
 * cascade style writes the label after the division, while a loop or a
 * `const units = ["s","m","h"]` table declares it above.
 */
const WINDOW = 6;

/**
 * THE CLOCK VOICE, FUNCTION-SCOPED (2026-09-12, the ninth adversarial review).
 *
 * THE MISS. The clock lane above still asks for TIME-BASE ARITHMETIC on the hit
 * line and then looks ±3 lines for the pad or the join. That makes the
 * ARITHMETIC the subject and the clock the corroboration, and four live bodies
 * on origin/main rendered colon clocks through it without a word:
 *
 *   1. `formatYouTubeDuration` (marketing/discovery/youtube/formatters.ts) —
 *      its components come out of an ISO-8601 `PT#H#M#S` REGEX, so the file
 *      contains no `/60` anywhere. Four screens render `1:02:09` from it.
 *   2/3. `transcript-parser.ts` and `TranscriptViewer.tsx` —
 *      `hours * 3600 + minutes * 60 + seconds` is MULTIPLICATION, and the lane
 *      admits only `/` and `%`. Parsing a clock back into seconds multiplies;
 *      only rendering it divides.
 *   4. `formatTimeRemaining` (utils/auth/extensionAuthHelper.ts) — the `/1000`
 *      and `/60` are SIXTEEN lines up, inside a DIFFERENT function. A ±3 line
 *      window cannot reach across a function boundary, and a formatter that
 *      takes its parts from a helper never will.
 *
 * THE SUBJECT IS THE VOICE, NOT THE ARITHMETIC. A colon clock is recognisable
 * on its own terms, the way a human recognises one: two or more numeric parts
 * JOINED BY A COLON where at least one part is ZERO-PADDED TO TWO
 * (`padStart(2, "0")`, or the older `("0" + x).slice(-2)`). Nothing but a clock
 * pads a part of a colon join to two digits. The arithmetic then becomes one of
 * two corroborations, either of which is enough:
 *   - the PARTS NAME THEMSELVES as time (`hours`, `mm`, `secs`, `totalSeconds`,
 *     `elapsed`, `remaining`, `duration`) — this is what catches the ISO body,
 *     which has no arithmetic to find; or
 *   - ANY time-base operation exists in the SAME FUNCTION BODY — `/`, `%` OR
 *     `*` against 60 / 3600 / 86400 / 1000 / 60000 / 3600000 or a named base.
 *     Multiplication is admitted HERE and nowhere else: on its own it is a
 *     budget (`30 * 1000`), but a zero-padded colon join in the same function
 *     is not a budget.
 *
 * THE WINDOW IS THE FUNCTION BODY, computed from braces — not a line count. The
 * ±3 window was chosen when the arithmetic was the subject and always touched
 * the pad; the moment the clock is the subject, the parts can come from
 * anywhere in the function, and in the live auth body they come from sixteen
 * lines away.
 *
 * NEGATIVES this must stay silent on, all of them live shapes:
 *   - a WALL CLOCK: `${hh}:${mm}` built from `getHours()` / `getMinutes()` /
 *     `toLocaleTimeString`. It is a TIME OF DAY, not a duration, and THE KIT
 *     HAS NO WALL-CLOCK VOICE — `formatDurationSeconds(…, { style: "clock" })`
 *     would be the wrong home for it. So a function body that reads wall-clock
 *     COMPONENTS off a Date is excluded by construction, and stays excluded
 *     until the kit grows a time-of-day formatter to collapse onto.
 *     (`getTime()` is not a component accessor: an epoch delta is a duration.)
 *   - a DATE STAMP `${yyyy}-${mm}-${dd}` — padded, and joined by hyphens.
 *   - `${host}:${port}`, `${f.file}:${f.line}` — colon joins with no pad.
 *   - a type annotation, an object literal, a CSS ratio — none of which can
 *     produce the `}:${` spelling at all.
 *
 * A BODY ALREADY REPORTED BY A LANE ABOVE IS NOT REPORTED AGAIN. The lanes
 * above report the DIVISION line of a clock; this one reports the JOIN. Both
 * naming the same body would re-open every censused clock in eight registers
 * under a second line number, so this lane stays silent inside any function
 * body another lane already named.
 */
const SLICE_PAD_RE = /\(\s*["'`]0["'`]\s*\+[^)]*\)\s*\.\s*slice\(\s*-\s*2\s*\)/;
const PADDED_PART_RE = new RegExp(`${PAD2_RE.source}|${SLICE_PAD_RE.source}`);

/** `}:${` (template) or `+ ":" +` (concatenation) — two parts, one colon. */
const CONCAT_COLON_RE = /\+\s*["']\s*:\s*["']\s*\+/;

/**
 * TIME WORDS a clock's parts name themselves with. Matched against the JOIN's
 * own interpolations only — not the whole line — so a `${label}:${port}` beside
 * an unrelated `seconds` variable is not a clock.
 */
const TIME_WORD_RE =
  /\b(?:h|hh|hr|hrs|hour|hours|m|mm|min|mins|minute|minutes|s|ss|sec|secs|second|seconds|total|elapsed|remaining|duration)(?:[A-Z][\w$]*)?\b/;

/** A time base MULTIPLIED, DIVIDED or MODULO'd — the function-body corroboration. */
const ANY_TIME_BASE_OP_RE = new RegExp(
  String.raw`(?:[/%*]\s*\(?\s*(?:${TIME_BASE}|${SECONDS_BASE})|(?:${TIME_BASE}|${SECONDS_BASE})\s*\*)`,
);

/**
 * A TIME OF DAY, in its two spellings. Tested against the RAW function body,
 * because the second spelling lives inside a string literal.
 *   - wall-clock COMPONENT accessors (`getHours()`, `toLocaleTimeString`).
 *     `getTime()` is deliberately absent: an epoch delta IS a duration.
 *   - a QUOTED `"AM"` / `"PM"`. The live `formatTimeOfDay` in
 *     features/workflow-runtime/triggers/recurrence.ts takes plain `hour` and
 *     `minute` NUMBERS — no Date anywhere — and renders `9:05 AM` for a
 *     recurrence schedule. Its parts are named `m` and `display`, so the
 *     time-word arm fires on it; the meridiem is what proves it is a clock on
 *     the wall rather than a length of time.
 * Both stay silent BY DESIGN: the kit has `clock` / `compact` / `coarse`
 * DURATION voices and no time-of-day voice, so there is nothing to collapse
 * these onto. When one is added, this exclusion is what has to be revisited.
 */
const WALL_CLOCK_RE =
  /\.get(?:UTC)?(?:Hours|Minutes|Seconds)\s*\(|toLocaleTimeString|Intl\.DateTimeFormat|["'`]\s*(?:AM|PM)\s*["'`]/;

/**
 * A MINIFIED BUNDLE IS NOT AUTHORED SOURCE. `git ls-files *.js` reaches
 * committed build output — matrx-frontend's `public/blob-sw.js` is one 7 KB
 * line — and a whole bundle on one line will contain a padded colon join and a
 * `* 1000` somewhere by sheer volume, with no body anyone could collapse. No
 * hand-written clock line comes close to this length.
 */
const MINIFIED_LINE = 500;

const BLOCK_KEYWORD_RE =
  /^\s*(?:\}\s*)?(?:else\b|if\s*\(|for\s*\(|while\s*\(|switch\s*\(|try\b|catch\b|finally\b|do\b)/;
/** A brace opened by a FUNCTION: `function f() {`, `=> {`, `foo(a): T {`, `): T {`. */
const FUNCTION_START_RE =
  /\bfunction\b|=>|[\w$]\s*\([^()]*\)\s*(?::[^{;]*)?\{\s*$|^\s*\)\s*(?::[^{;]*)?\{\s*$/;

/** Every brace-delimited block in the file, innermost-last per closing brace. */
function braceBlocks(lines) {
  const blocks = [];
  const stack = [];
  for (let i = 0; i < lines.length; i++) {
    const code = codeOnlyLine(lines[i]);
    for (const ch of code) {
      if (ch === "{") stack.push(i);
      else if (ch === "}") {
        const start = stack.pop();
        if (start !== undefined) blocks.push({ start, end: i });
      }
    }
  }
  return blocks;
}

/**
 * The FUNCTION body containing `index`: the innermost brace block whose opening
 * line is a function signature rather than an `if` / `for` / object literal.
 * Falls back to a ±WINDOW band when the join sits at module top level.
 */
function enclosingFunction(lines, blocks, index) {
  let best = null;
  for (const b of blocks) {
    if (b.start > index || b.end < index) continue;
    const head = lines[b.start];
    if (BLOCK_KEYWORD_RE.test(head)) continue;
    if (!FUNCTION_START_RE.test(head)) continue;
    if (best === null || b.start > best.start) best = b;
  }
  return (
    best ?? {
      start: Math.max(0, index - WINDOW),
      end: Math.min(lines.length - 1, index + WINDOW),
    }
  );
}

/** The `${…}` expressions on a line — a join's PARTS. */
function interpolationsIn(line) {
  const parts = [];
  for (let i = 0; i < line.length - 1; i++) {
    if (line[i] !== "$" || line[i + 1] !== "{") continue;
    let depth = 1;
    let j = i + 2;
    let expr = "";
    while (j < line.length && depth > 0) {
      if (line[j] === "{") depth += 1;
      else if (line[j] === "}") depth -= 1;
      if (depth > 0) expr += line[j];
      j += 1;
    }
    parts.push(expr);
    i = j - 1;
  }
  return parts;
}

/** Colon-clock findings: the JOIN lines no arithmetic lane can reach. */
function clockVoiceIn(lines, reported) {
  const blocks = braceBlocks(lines);
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length > MINIFIED_LINE) continue;
    const templateJoin = COLON_JOIN_RE.test(line);
    const concatJoin = CONCAT_COLON_RE.test(line);
    if (!templateJoin && !concatJoin) continue;

    const scope = enclosingFunction(lines, blocks, i);
    let alreadyNamed = false;
    for (const r of reported) {
      if (r >= scope.start && r <= scope.end) alreadyNamed = true;
    }
    if (alreadyNamed) continue;

    const rawBody = lines.slice(scope.start, scope.end + 1).join("\n");
    const body = lines
      .slice(scope.start, scope.end + 1)
      .map(codeOnlyLine)
      .join("\n");
    if (WALL_CLOCK_RE.test(rawBody)) continue;
    // THE ZERO PAD may sit on the join or on the line that builds a part:
    // `const hh = String(x).padStart(2, "0"); … `${hh}:${mm}`` is the same
    // clock written in two steps. The function body is the window for it too.
    if (!PADDED_PART_RE.test(rawBody)) continue;

    const parts = templateJoin
      ? interpolationsIn(line).join(" | ")
      : codeOnlyLine(line);
    const namesTime = TIME_WORD_RE.test(parts);
    const baseInScope = ANY_TIME_BASE_OP_RE.test(body);
    if (!namesTime && !baseInScope) continue;
    hits.push(i);
  }
  return hits;
}

/**
 * Duration-formatting findings in one file's source.
 * Returns [{ line, text }] — every place a time count becomes a unit string.
 */
export function durationShapeIn(source) {
  const lines = source.split("\n");
  const named = identifierTimeDivisorRe(timeBaseNames(source));
  const out = [];
  const seen = new Set();
  const report = (index) => {
    if (seen.has(index)) return;
    seen.add(index);
    out.push({ line: index + 1, text: lines[index].trim() });
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const code = codeOnlyLine(line);
    if (SECONDS_SCALED_CALL_RE.test(code)) report(i);
    const divides = timeBaseDivides(line) || (named !== null && named.test(code));
    const base = divides || timeBaseHit(line);
    if (!base) continue;
    const window = lines
      .slice(Math.max(0, i - WINDOW), i + WINDOW + 1)
      .join("\n");
    if (DURATION_UNIT_RE.test(window)) {
      report(i);
      continue;
    }
    // THE CLOCK VOICE: no unit label anywhere, because the colon is the unit.
    // A comparison is not admitted here — see `timeBaseDivides`.
    if (!divides) continue;
    const clockWindow = lines
      .slice(Math.max(0, i - CLOCK_WINDOW), i + CLOCK_WINDOW + 1)
      .join("\n");
    if (CLOCK_VOICE_RE.test(clockWindow)) report(i);
  }
  for (const index of clockVoiceIn(lines, [...seen])) report(index);
  out.sort((a, b) => a.line - b.line);
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

  // ── THE COLON CLOCK (2026-09-12) ──────────────────────────────────────────
  // Byte-for-byte the live body from matrx-frontend's RecordingIndicator, the
  // one this lane returned ZERO findings on while it required a unit label.
  const plantedClock = [
    "  // Format duration",
    "  const minutes = Math.floor(duration / 60);",
    "  const seconds = duration % 60;",
    "  const formattedDuration = `${minutes}:${String(seconds).padStart(2, '0')}`;",
  ].join("\n");
  if (durationShapeIn(plantedClock).length === 0) {
    return {
      ok: false,
      why: "a planted COLON CLOCK was NOT reported — the clock voice has no unit label, so the label requirement makes every recorder, timer and transcript stamp in the fleet invisible again",
    };
  }
  // The one-liner form, where the whole clock is a single interpolation and
  // the only evidence is the `}:${` join plus the pad.
  const plantedInlineClock = [
    "const label = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, \"0\")}`;",
  ].join("\n");
  if (durationShapeIn(plantedInlineClock).length === 0) {
    return { ok: false, why: "a planted single-line colon clock was NOT reported" };
  }
  // …and the two shapes that LOOK like clocks and are not.
  const dateStamp = [
    "const d = new Date(value);",
    'const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;',
  ].join("\n");
  const dateHits = durationShapeIn(dateStamp);
  if (dateHits.length !== 0) {
    return {
      ok: false,
      why: `a yyyy-mm-dd date stamp was reported as a duration clock (${dateHits
        .map((h) => h.text)
        .join(" | ")})`,
    };
  }
  const wallClock = [
    "function Row({ seconds }: { seconds: number }) {",
    "  const share = seconds / 3600;",
    '  const at = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });',
    "  return share;",
    "}",
  ].join("\n");
  const wallHits = durationShapeIn(wallClock);
  if (wallHits.length !== 0) {
    return {
      ok: false,
      why: `an object-literal / type-annotation colon beside plain time arithmetic was reported as a clock (${wallHits
        .map((h) => h.text)
        .join(" | ")})`,
    };
  }

  // A TRUNCATED LIST is not a clock. Byte-for-byte the live shape from
  // features/admin/lint-debt/fix-prompt.ts — a `${f.file}:${f.line}` template
  // join one line above a `> 60` list cap. Both admin fix-prompt builders were
  // reported on this lane's first run, which is why the clock voice requires a
  // DIVISION and refuses a threshold comparison.
  const truncatedList = [
    "const lines = findings",
    "  .slice(0, 60)",
    "  .map((f) => `  - ${f.file}:${f.line} [${f.rule}] ${f.message}`);",
    "const truncated = findings.length > 60 ? `… and ${findings.length - 60} more` : null;",
  ].join("\n");
  const listHits = durationShapeIn(truncatedList);
  if (listHits.length !== 0) {
    return {
      ok: false,
      why: `a truncated finding list ( \`> 60\` beside a \`file:line\` join) was reported as a duration clock (${listHits
        .map((h) => h.text)
        .join(" | ")})`,
    };
  }

  // ── NAMED TIME BASES (2026-09-12) ─────────────────────────────────────────
  // The live half-adopted body from matrx-frontend features/hr/tasks/urgency.ts.
  const plantedNamedBase = [
    "const HOUR_MS = 60 * 60 * 1000;",
    "const DAY_MS = 24 * HOUR_MS;",
    "const text =",
    "  magnitude < HOUR_MS",
    '    ? formatDurationMs(magnitude, { style: "coarse" })',
    "    : magnitude < 48 * HOUR_MS",
    "      ? `${Math.round(magnitude / HOUR_MS)} hr`",
    "      : `${Math.round(magnitude / DAY_MS)} days`;",
  ].join("\n");
  const namedHits = durationShapeIn(plantedNamedBase);
  if (namedHits.length < 2) {
    return {
      ok: false,
      why: `a time base behind a NAME (\`/ HOUR_MS\`, \`/ DAY_MS\`) was not treated as a time base — ${namedHits.length} of 2 hand-rolled branches reported`,
    };
  }
  // A named base used ONLY to pick a branch formats nothing and must stay
  // silent — the live shape in features/html-pages/HtmlPageGridView.tsx.
  const thresholdOnly = [
    "const MILLISECONDS_PER_HOUR = 3_600_000;",
    "const TWO_DAYS_MS = 48 * MILLISECONDS_PER_HOUR;",
    "const SEVEN_DAYS_MS = 7 * 24 * MILLISECONDS_PER_HOUR;",
    "function when(d: Date, elapsedMs: number): string {",
    '  if (elapsedMs < MILLISECONDS_PER_HOUR) return formatRelativeTime(d, { style: "short" });',
    '  if (elapsedMs < TWO_DAYS_MS) return formatRelativeTime(d, { style: "short" });',
    '  if (elapsedMs < SEVEN_DAYS_MS) return formatRelativeTime(d, { style: "long" });',
    "  return d.toLocaleDateString();",
    "}",
  ].join("\n");
  const thresholdHits = durationShapeIn(thresholdOnly);
  if (thresholdHits.length !== 0) {
    return {
      ok: false,
      why: `a named duration used ONLY as a branch threshold was reported as a formatter (${thresholdHits
        .map((h) => h.text)
        .join(" | ")})`,
    };
  }

  // ── THE INPUT LEG: seconds scaled up at the call site (2026-09-12) ────────
  const scaledCall = [
    "const label = formatDurationMs(durationSec * 1000);",
  ].join("\n");
  if (durationShapeIn(scaledCall).length === 0) {
    return {
      ok: false,
      why: "`formatDurationMs(durationSec * 1000)` was NOT reported — THE UNIT LAW says a seconds value goes to formatDurationSeconds, never multiplied up at the call site",
    };
  }
  const honestMsCall = [
    "const label = formatDurationMs(row.duration_ms);",
    "const budget = RETRY_BACKOFF * 1000;",
  ].join("\n");
  if (durationShapeIn(honestMsCall).length !== 0) {
    return { ok: false, why: "an honest millisecond call site was reported by the input leg" };
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

  // ── THE CLOCK VOICE, FUNCTION-SCOPED (2026-09-12, ninth review) ──────────
  // Four live bodies on origin/main that rendered colon clocks while every
  // lane above stayed green. Each is planted BYTE-FOR-BYTE, and each proves a
  // DIFFERENT leg of the voice rule, so a mutation to one leg names itself.

  // LEG 1 — NO ARITHMETIC AT ALL. `formatYouTubeDuration`: the parts come out
  // of an ISO-8601 `PT#H#M#S` regex, so the only evidence is the padded colon
  // join and the parts NAMING themselves as time.
  const isoClock = [
    "export function formatYouTubeDuration(value) {",
    '  if (!value) return "—";',
    "  const match = value.match(ISO_DURATION);",
    "  if (!match) return value;",
    "  const days = Number(match[1] ?? 0);",
    "  const hours = Number(match[2] ?? 0) + days * 24;",
    "  const minutes = Number(match[3] ?? 0);",
    "  const seconds = Math.floor(Number(match[4] ?? 0));",
    "  if (hours > 0) {",
    '    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;',
    "  }",
    '  return `${minutes}:${String(seconds).padStart(2, "0")}`;',
    "}",
  ].join("\n");
  if (durationShapeIn(isoClock).length === 0) {
    return {
      ok: false,
      why: "a colon clock built from an ISO-8601 duration regex was NOT reported — it contains no `/60` anywhere, so the TIME-WORD leg (the parts naming themselves `hours`/`minutes`/`seconds`) is the only evidence there is",
    };
  }

  // LEG 2 — MULTIPLICATION. `transcript-parser.ts` / `TranscriptViewer.tsx`
  // parse a clock BACK into seconds, so the time base is `* 3600` / `* 60`.
  // The lanes above admit only `/` and `%`, by design; the voice lane admits
  // `*` because a zero-padded colon join in the same body is not a budget.
  const parseThenRender = [
    "function parseTimeToken(raw) {",
    "  const parts = raw.trim().split(':').map((p) => parseInt(p, 10));",
    "  let hours = 0;",
    "  let minutes = 0;",
    "  let seconds = 0;",
    "  const totalSeconds = hours * 3600 + minutes * 60 + seconds;",
    "  const timecode =",
    "    hours > 0",
    '      ? `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`',
    '      : `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;',
    "  return { timecode, seconds: totalSeconds };",
    "}",
  ].join("\n");
  if (durationShapeIn(parseThenRender).length === 0) {
    return {
      ok: false,
      why: "a transcript timecode body whose only time base is MULTIPLICATION (`hours * 3600 + minutes * 60`) was NOT reported — parsing a clock multiplies, only rendering one divides, so a divide-only rule is blind to every transcript stamp in the fleet",
    };
  }

  // LEG 3 — THE FUNCTION BODY, NOT A LINE WINDOW. `formatTimeRemaining`:
  // the `/1000` and `/60` live SIXTEEN lines up in a different function, and
  // the join names `minutes` / `seconds`. A ±3 (or ±6) line window reaches
  // neither.
  const acrossFunctions = [
    "export function getTimeRemaining(expiresAt) {",
    "  const now = new Date();",
    "  const expires = new Date(expiresAt);",
    "  const diffMs = expires.getTime() - now.getTime();",
    "  if (diffMs <= 0) {",
    "    return { minutes: 0, seconds: 0, expired: true };",
    "  }",
    "  const totalSeconds = Math.floor(diffMs / 1000);",
    "  const minutes = Math.floor(totalSeconds / 60);",
    "  const seconds = totalSeconds % 60;",
    "  return { minutes, seconds, expired: false };",
    "}",
    "",
    "export function formatTimeRemaining(expiresAt) {",
    "  const { minutes, seconds, expired } = getTimeRemaining(expiresAt);",
    '  if (expired) return "Expired";',
    '  return `${minutes}:${seconds.toString().padStart(2, "0")}`;',
    "}",
  ].join("\n");
  const acrossHits = durationShapeIn(acrossFunctions);
  if (!acrossHits.some((h) => h.text.includes("padStart"))) {
    return {
      ok: false,
      why: "a clock whose JOIN sits in one function and whose time arithmetic sits sixteen lines up in ANOTHER was NOT reported at the join — the window must be the function body the join is in, and the join must stand on its own time-word parts",
    };
  }

  // LEG 4 — THE OLD PAD SPELLING. `("0" + s).slice(-2)` is the same clock.
  const slicePad = [
    "function stamp(minutes, s) {",
    "  const total = minutes * 60 + s;",
    '  return `${minutes}:${("0" + s).slice(-2)}`;',
    "  return total;",
    "}",
  ].join("\n");
  if (durationShapeIn(slicePad).length === 0) {
    return {
      ok: false,
      why: "a clock zero-padded the OLD way (`(\"0\" + s).slice(-2)`) was NOT reported — a pad rule that knows only `padStart` misses every pre-ES2017 body",
    };
  }

  // LEG 5 — THE TIME-BASE ARM, ON ITS OWN. Parts that name NOTHING
  // (`${a}:${b}`), a time base that is only a MULTIPLICATION, and the two
  // EIGHT LINES APART inside one function. Nothing here is reachable by a
  // time-word test, by a divide-only base, or by any line window: this fixture
  // goes green the moment the scope stops being the function body.
  const scopedBase = [
    "function render(a, b) {",
    "  const total = a * 60 + b;",
    "  log(total);",
    "  log(1);",
    "  log(2);",
    "  log(3);",
    "  log(4);",
    "  log(5);",
    "  log(6);",
    "  log(7);",
    '  return `${a}:${String(b).padStart(2, "0")}`;',
    "}",
  ].join("\n");
  if (durationShapeIn(scopedBase).length === 0) {
    return {
      ok: false,
      why: "a padded colon join whose ONLY corroboration is a `* 60` eight lines up in the SAME FUNCTION was NOT reported — the clock voice's window is the function body, and multiplication counts as a time base once a zero-padded colon join is in it",
    };
  }

  // NEGATIVE — A WALL CLOCK IS NOT A DURATION. `${hh}:${mm}` off
  // `getHours()` / `getMinutes()` is a TIME OF DAY, and the kit has no
  // wall-clock voice to collapse it onto. It must stay silent BY DESIGN.
  const wallClockStamp = [
    "function at(d) {",
    '  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;',
    "}",
    "function atTwoSteps(d) {",
    '  const hh = String(d.getHours()).padStart(2, "0");',
    '  const mm = String(d.getMinutes()).padStart(2, "0");',
    "  return `${hh}:${mm}`;",
    "}",
  ].join("\n");
  const wallStampHits = durationShapeIn(wallClockStamp);
  if (wallStampHits.length !== 0) {
    return {
      ok: false,
      why: `a WALL CLOCK (\`getHours()\`/\`getMinutes()\`) was reported as a duration — it is a time of day, and the kit has no wall-clock voice to collapse it onto (${wallStampHits
        .map((h) => h.text)
        .join(" | ")})`,
    };
  }

  // NEGATIVE — a host:port and a file:line join. Colons, no pad.
  const colonsThatAreNotClocks = [
    "function describe(host, port, f) {",
    "  const addr = `${host}:${port}`;",
    "  const where = `${f.file}:${f.line}`;",
    "  return `${addr} ${where}`;",
    "}",
  ].join("\n");
  const colonHits = durationShapeIn(colonsThatAreNotClocks);
  if (colonHits.length !== 0) {
    return {
      ok: false,
      why: `an unpadded colon join (\`host:port\`, \`file:line\`) was reported as a clock — the ZERO PAD to two digits is what makes a colon join a clock (${colonHits
        .map((h) => h.text)
        .join(" | ")})`,
    };
  }

  // NEGATIVE — A TIME OF DAY WITH NO DATE IN SIGHT. Byte-for-byte the live
  // `formatTimeOfDay` from features/workflow-runtime/triggers/recurrence.ts:
  // plain `hour` / `minute` numbers, a `%` against 12, and `"9:05 AM"` out.
  // Its part is literally named `m`, so only the meridiem separates it from a
  // duration — and the kit has no time-of-day voice to collapse it onto.
  const timeOfDay = [
    "export function formatTimeOfDay(hour, minute) {",
    "  const h = clampInt(hour, 0, 23);",
    "  const m = clampInt(minute, 0, 59);",
    '  const suffix = h < 12 ? "AM" : "PM";',
    "  const display = h % 12 === 0 ? 12 : h % 12;",
    '  return `${display}:${String(m).padStart(2, "0")} ${suffix}`;',
    "}",
  ].join("\n");
  const timeOfDayHits = durationShapeIn(timeOfDay);
  if (timeOfDayHits.length !== 0) {
    return {
      ok: false,
      why: `a TIME OF DAY ("9:05 AM", built from plain hour/minute numbers with no Date in sight) was reported as a duration — the meridiem is the only thing that distinguishes it, and the kit has no wall-clock voice to collapse it onto (${timeOfDayHits
        .map((h) => h.text)
        .join(" | ")})`,
    };
  }

  // NEGATIVE — A MINIFIED BUNDLE IS NOT SOURCE. `git ls-files *.js` reaches
  // committed build output; one 7 KB line will contain a padded colon join and
  // a time base somewhere, and there is no body in it to collapse.
  const minified = [
    "// matrx blob-cache SW — built 2026-09-13T03:04:51.773Z",
    '"use strict";(()=>{' +
      "x".repeat(400) +
      'let a=`${h}:${String(s).padStart(2,"0")}`,b=t*1000;' +
      "y".repeat(200) +
      "})();",
  ].join("\n");
  const minifiedHits = durationShapeIn(minified);
  if (minifiedHits.length !== 0) {
    return {
      ok: false,
      why: `a MINIFIED BUNDLE line was reported as a duration body — a whole bundle on one line contains every shape by volume and holds nothing anybody can collapse (${minifiedHits
        .map((h) => h.text.slice(0, 60))
        .join(" | ")})`,
    };
  }

  // NEGATIVE — THE PAD IS THE WHOLE DIFFERENCE. The live `fix-prompt.ts`
  // shape: a `${f.file}:${f.line}` join inside a function that also holds
  // time-base arithmetic. Time words, a time base, a colon join — and no zero
  // pad, because it is not a clock. Drop the pad requirement and this fires.
  const fileLineBesideTime = [
    "function buildPrompt(findings, budgetSeconds) {",
    "  const budgetMs = budgetSeconds * 1000;",
    "  const rows = findings.map((f) => `  - ${f.file}:${f.line} ${f.message}`);",
    "  return { rows, budgetMs };",
    "}",
  ].join("\n");
  const fileLineHits = durationShapeIn(fileLineBesideTime);
  if (fileLineHits.length !== 0) {
    return {
      ok: false,
      why: `a \`file:line\` join inside a function that does time arithmetic was reported as a clock — the ZERO PAD TO TWO DIGITS is the only thing separating a clock from every other colon join in the fleet (${fileLineHits
        .map((h) => h.text)
        .join(" | ")})`,
    };
  }

  // NEGATIVE — a padded colon join whose parts are not time and whose body
  // does no time arithmetic: a MIDI/track address `${bank}:${String(patch).padStart(2,"0")}`.
  const paddedNonClock = [
    "function address(bank, patch) {",
    '  return `${bank}:${String(patch).padStart(2, "0")}`;',
    "}",
  ].join("\n");
  const paddedHits = durationShapeIn(paddedNonClock);
  if (paddedHits.length !== 0) {
    return {
      ok: false,
      why: `a padded colon join with no time words and no time arithmetic was reported as a clock (${paddedHits
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
