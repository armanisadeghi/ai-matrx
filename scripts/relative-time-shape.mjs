/**
 * relative-time-shape.mjs — THE SHAPE RULE for relative-time formatting.
 *
 * WHY (the tenth adversarial review, 2026-09-14). `formatRelativeTime` was
 * registered in the name catalog and clean, and the guard therefore called the
 * capability adopted. Live on origin/main at that moment:
 *   - `features/admin/spend/format.ts`'s `staleness` rendered "today" for a
 *     FUTURE timestamp (`Math.floor(delta / 86_400_000)` is negative, and the
 *     `days <= 0` branch says "today") — a screen that lies about a stamp
 *     ahead of the clock, which is the exact defect kit's short/long voices
 *     grew the future tense to stop;
 *   - `features/masterwork/home/HowItsImprovingPanel.tsx`'s `whenDate` is the
 *     same body under a different name;
 *   - `DeadEndsConsole.tsx` and `LintDebtConsole.tsx` each split the body in
 *     two — an `ageInDays` helper at the top of the file and a "scanned today"
 *     / "· 3 days ago" render six hundred lines below it;
 *   - `ProviderSyncDashboard.tsx` computes `hoursSince` and then renders
 *     "verified today" for anything under a day, hiding the hours it just
 *     measured.
 * A capability is duplicated by its SHAPE long before anybody re-uses its
 * spelling, and a relative-time body is duplicated in TWO PIECES more often
 * than in one — which is why this lane has two arms.
 *
 * ARM A — THE AGE ARITHMETIC. An EPOCH DELTA (`Date.now() - x`, `new Date() -
 * x`, a `getTime()` difference, `Date.parse`) DIVIDED by a time base
 * (60000 / 3600000 / 86400000 / 604800000, the seconds-base forms after a
 * `/1000`, or a named `*_MS` / `MS_PER_*` constant) inside a function that is
 * about AGE — proved either by a relative-time VOICE in the same body (" ago",
 * "today", "yesterday", "just now") or by the function NAME itself
 * (`ageInDays`, `hoursSince`, `staleness`, `whenDate`). The DIVISION line is
 * reported, because that is the line the collapse deletes.
 *
 * ARM B — THE RENDER-ONLY VOICE. The same capability's other half: a relative
 * voice bound to a NUMERIC interpolation in a function that does NO time
 * arithmetic at all, because the arithmetic lives in a helper elsewhere in the
 * file. `· scanned ${scanAgeDays}d ago` and `{days === 0 ? "verified today" :
 * …}` are both invisible to every arithmetic-first rule ever written, and both
 * are live.
 *
 * A FUNCTION THAT DOES TIME ARITHMETIC IS NEVER REPORTED BY ARM B. Arm A owns
 * it if it is an age, and `duration-shape.mjs` owns it if it is an elapsed
 * length — so one body can never be opened in two register rows under two line
 * numbers, which is the failure that would re-open every censused duration
 * clock in eight registers.
 *
 * THE ONE HOME is `formatRelativeTime` from `@ai-matrx/kit/format`: three
 * voices (`short` / `long` / `intl`), BOTH directions ("2d ago" and "in 2d"),
 * `suffix: false` for a dense column whose header already says "Age" or "Due",
 * an injected `now` so tests never depend on the clock, and an absolute date
 * past a year instead of "412 days ago".
 *
 * NEGATIVES, all of them live shapes in this fleet:
 *   - a THRESHOLD-ONLY use — `if (Date.now() - t > DAY_MS)` picking a branch,
 *     with no division and no rendered string. Branching on an age is the
 *     normal, correct use of one;
 *   - a DURATION — an elapsed length with no "ago" ("ran for 4m 20s"), which
 *     is `formatDurationMs`'s and is reported there, never here;
 *   - a DATE-ONLY render — `d.toLocaleDateString()`, `toLocaleString` with
 *     date fields — which is an absolute stamp, not a relative one;
 *   - the word "ago" in PROSE or a comment with no value bound to it.
 *
 * Exported as a module so `check-package-twins.mjs` can run it as a shape lane
 * and so the self-test can plant a body and prove it fails.
 */

/** Comments and string TEXT gone, `${…}` interpolations kept. */
function codeOnlyLine(line) {
  if (/^\s*\*/.test(line)) return "";
  const noComments = line
    .replace(/(^|[^:])\/\/.*$/, "$1")
    .replace(/\/\*.*?\*\//g, " ");
  const noQuoted = noComments
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");
  let out = "";
  let i = 0;
  while (i < noQuoted.length) {
    if (noQuoted[i] !== "`") {
      out += noQuoted[i];
      i += 1;
      continue;
    }
    i += 1;
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
      i += 1;
    }
    i += 1;
  }
  return out;
}

/**
 * Comments gone, string TEXT kept — the VOICE lives in it.
 *
 * A JSDOC CONTINUATION LINE IS A COMMENT. `kit/src/format.ts` quotes the very
 * body this lane hunts inside its own doc block ("`$${(app.total_cost_usd ??
 * 0).toFixed(4)}` rendered \"$0.0000\""), and a doc block that explains a defect
 * is not the defect. A line whose first non-space character is `*` is dropped
 * whole.
 */
function withoutComments(line) {
  if (/^\s*\*/.test(line)) return "";
  return line.replace(/(^|[^:])\/\/.*$/, "$1").replace(/\/\*.*?\*\//g, " ");
}

const MINIFIED_LINE = 500;

/**
 * AN EPOCH DELTA AGAINST **NOW** — the current clock minus a stamp, or a stamp
 * minus the current clock. This is what separates an AGE from a length of time:
 * `formatDurationMs(row.duration_ms)` never reads the clock, and — the
 * distinction that matters in practice — NEITHER DOES A WINDOW. A difference
 * between TWO GIVEN STAMPS (`window.to.getTime() - window.from.getTime()`, live
 * in SpendExplorer.tsx) is a duration somebody chose, not an age, so a bare
 * `.getTime() -` is deliberately NOT admitted: only `Date.now()` and a
 * no-argument `new Date()` are the clock.
 */
const EPOCH_DELTA_RE =
  /Date\.now\s*\(\s*\)\s*-|-\s*Date\.now\s*\(\s*\)|new\s+Date\s*\(\s*\)\s*(?:\.getTime\s*\(\s*\)\s*)?-|-\s*new\s+Date\s*\(\s*\)|-\s*\+new\s+Date\s*\(\s*\)/;

/**
 * A TIME BASE a relative age is divided by. The day and week bases matter most
 * here and appear in NO other lane: `86_400_000` is deliberately absent from
 * `duration-shape.mjs`'s millisecond base (its seconds base stops at 86_400 and
 * refuses a `_` continuation), so every `/ 86_400_000` age body in the fleet
 * was invisible to every shape lane before this one.
 */
const AGE_BASE = String.raw`(?:604_?800_?000|86_?400_?000|3_?600_?000|60_?000|1_?000|1000\s*\*\s*60\s*\*\s*60\s*\*\s*24|24\s*\*\s*60\s*\*\s*60\s*\*\s*1000|60\s*\*\s*60\s*\*\s*24|60\s*\*\s*60|1000\s*\*\s*60|60\s*\*\s*1000|86_?400|3_?600|60(?!\s*\*))(?![\d_.])`;
const AGE_DIVIDE_RE = new RegExp(String.raw`(?<!\d[\d_]*\s*)[/%]\s*\(?\s*${AGE_BASE}`);

/** A named time base: `DAY_MS`, `HOUR_MS`, `MS_PER_DAY`, `SEVEN_DAYS_MS`. */
const NAMED_BASE_DIVIDE_RE =
  /[/%]\s*\(?\s*(?:\d+[\d_]*\s*\*\s*)?[A-Za-z_$][\w$]*(?:_MS|_MSEC|_MILLIS|_SEC|_SECS|_SECONDS|_MIN|_MINS|_MINUTES|_HOUR|_HOURS|_DAY|_DAYS|_WEEK|_WEEKS)\b|[/%]\s*\(?\s*(?:MS|MSEC|SEC|SECS|SECONDS|MIN|MINS|MINUTES|HOURS?|DAYS?|WEEKS?)_PER_[A-Z_]+\b/;

/**
 * THE RELATIVE VOICE. The four things a relative-time body says and a duration
 * body never does. " ago" and "in …" carry the direction; "today" /
 * "yesterday" / "just now" are the named tiers.
 */
const AGO_RE = /\sago\b/;
const NAMED_TIER_RE = /["'`][^"'`]{0,16}\b(?:today|yesterday|tomorrow|just now)\b[^"'`]{0,16}["'`]/i;

/**
 * THE FUTURE PREFIX "in …" IS DELIBERATELY NOT A VOICE, in either arm, even
 * though kit renders one ("in 2d"). It cannot tell a DEADLINE from a TICKING
 * COUNTDOWN, and the countdowns are live and numerous — `auto-continue in
 * ${secondsLeft}s`, `expires in ${secondsUntil(...)}s`, `ran ${file} in
 * ${Math.round((Date.now() - t0) / 1000)}s`. Kit's own doc sends a countdown to
 * `formatDurationMs(..., { round: "down" })` and an elapsed measurement to
 * `formatDurationMs`, so admitting "in " would file three duration bodies under
 * the relative-time row. A future stamp that also says "ago" on another branch,
 * or sits in a function NAMED for age, is still caught by everything below.
 */
const VOICE_RE = new RegExp(`${AGO_RE.source}|${NAMED_TIER_RE.source}`, "i");

/**
 * A FUNCTION NAME that declares the value is an AGE. This is the arm that
 * catches `ageInDays` and `hoursSince`, whose bodies compute a number and say
 * nothing — the string is six hundred lines away in the component that renders
 * it, and no window reaches that far.
 */
const AGE_NAME_RE =
  /(?:^|[^a-z])(?:age|aged|ages|stale|staleness|since|ago|recency|freshness|last seen|when)(?:[^a-z]|$)/i;

/** Identifiers split at their camelCase humps, so `ageInDays` reads as words. */
function wordsIn(text) {
  return text.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ");
}

/** A TIME WORD naming an interpolated part — `days`, `scanAgeDays`, `hrs`. */
const TIME_PART_RE =
  /\b(?:d|days?|h|hrs?|hours?|m|mins?|minutes?|s|secs?|seconds?|w|weeks?|months?|years?|age|ages?|elapsed|delta|diff|since|stale)\b/i;

const BLOCK_KEYWORD_RE =
  /^\s*(?:\}\s*)?(?:else\b|if\s*\(|for\s*\(|while\s*\(|switch\s*\(|try\b|catch\b|finally\b|do\b)/;
const FUNCTION_START_RE =
  /\bfunction\b|=>|[\w$]\s*\([^()]*\)\s*(?::[^{;]*)?\{\s*$|^\s*\)\s*(?::[^{;]*)?\{\s*$/;
const WINDOW = 6;

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

/** The FUNCTION body containing `index`, or a ±WINDOW band at top level. */
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

/** The `${…}` expressions on a line. */
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

/** True when this function body does ANY time-base division — arm B's veto. */
function bodyDividesTime(lines, scope) {
  for (let i = scope.start; i <= scope.end; i++) {
    const code = codeOnlyLine(lines[i]);
    if (AGE_DIVIDE_RE.test(code) || NAMED_BASE_DIVIDE_RE.test(code)) return true;
  }
  return false;
}

/**
 * Relative-time findings in one file's source.
 * Returns [{ line, text }].
 */
export function relativeTimeShapeIn(source) {
  const lines = source.split("\n");
  const blocks = braceBlocks(lines);
  const out = [];
  const seen = new Set();
  const report = (index) => {
    if (seen.has(index)) return;
    seen.add(index);
    out.push({ line: index + 1, text: lines[index].trim() });
  };

  // ── ARM A: the age arithmetic ──────────────────────────────────────────
  const armAScopes = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length > MINIFIED_LINE) continue;
    const code = codeOnlyLine(line);
    if (!AGE_DIVIDE_RE.test(code) && !NAMED_BASE_DIVIDE_RE.test(code)) continue;

    const scope = enclosingFunction(lines, blocks, i);
    const rawBody = lines.slice(scope.start, scope.end + 1).join("\n");
    const codeBody = lines
      .slice(scope.start, scope.end + 1)
      .map(codeOnlyLine)
      .join("\n");
    if (!EPOCH_DELTA_RE.test(codeBody)) continue;

    const head = wordsIn(lines[scope.start] ?? "");
    const namesAge = AGE_NAME_RE.test(head);
    const speaks = VOICE_RE.test(
      lines
        .slice(scope.start, scope.end + 1)
        .map(withoutComments)
        .join("\n"),
    );
    if (!namesAge && !speaks) continue;
    void rawBody;
    armAScopes.push(scope);
    report(i);
  }

  // ── ARM B: the render-only voice ───────────────────────────────────────
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length > MINIFIED_LINE) continue;
    const raw = withoutComments(line);
    if (!VOICE_RE.test(raw)) continue;

    const scope = enclosingFunction(lines, blocks, i);
    if (bodyDividesTime(lines, scope)) continue; // arm A's, or a duration's
    if (armAScopes.some((s) => i >= s.start && i <= s.end)) continue;

    // A VALUE must be bound to the voice, and HOW FAR the binding may sit
    // depends on WHICH voice it is.
    //
    //   " ago" is unambiguous, so its value may be on the line above or below —
    //   a cascade writes `? " · scanned today" : ` · scanned ${n}d ago``, and
    //   a JSX ternary puts each branch on its own line.
    //
    //   A NAMED TIER on its own ("today", "yesterday") is a word people write
    //   for a hundred other reasons, so it binds on ITS OWN LINE only. The
    //   ±1 window made `{ label: "Today", value: isoDay(now) }` a finding
    //   because the NEXT line held `${now.getFullYear()}` — a date picker's
    //   menu, formatting no age at all.
    const band = AGO_RE.test(raw)
      ? lines.slice(Math.max(0, i - 1), i + 2).map(withoutComments)
      : [raw];
    const parts = band.flatMap((l) => interpolationsIn(l));
    const bound = parts.some((p) => TIME_PART_RE.test(wordsIn(p)));
    const ternary =
      /[A-Za-z_$][\w$.]*\s*(?:===|==|<=|<|>=|>)\s*\d/.test(raw) &&
      band.some((l) => NAMED_TIER_RE.test(l)) &&
      TIME_PART_RE.test(wordsIn(raw));
    if (!bound && !ternary) continue;
    report(i);
  }

  out.sort((a, b) => a.line - b.line);
  return out;
}

/** Proves the rule can fail and does not fire on the shapes that are not ages. */
export function selfTestRelativeTimeShape() {
  // ── ARM A, LEG 1: the NAME carries it. Byte-for-byte `ageInDays` from
  // matrx-frontend features/admin/dead-ends/DeadEndsConsole.tsx and
  // features/admin/lint-debt/LintDebtConsole.tsx, which are the same body twice.
  // The function says nothing; the string it feeds is six hundred lines below.
  const ageHelper = [
    "function ageInDays(iso: string): number {",
    "  const ms = Date.now() - new Date(iso).getTime();",
    "  return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 86_400_000)) : 0;",
    "}",
  ].join("\n");
  if (relativeTimeShapeIn(ageHelper).length === 0) {
    return {
      ok: false,
      why: "an `ageInDays` helper (an epoch delta over 86_400_000, with no string anywhere in the body) was NOT reported — the day base is absent from every other lane, so a rule that waits for a rendered word is blind to half of every split relative-time body in the fleet",
    };
  }
  // …and the hours spelling, `hoursSince` from ProviderSyncDashboard.tsx.
  const hoursSince = [
    "function hoursSince(iso: string | null | undefined): number | null {",
    "  if (!iso) return null;",
    "  const t = Date.parse(iso);",
    "  if (Number.isNaN(t)) return null;",
    "  return Math.max(0, (Date.now() - t) / 3_600_000);",
    "}",
  ].join("\n");
  if (relativeTimeShapeIn(hoursSince).length === 0) {
    return {
      ok: false,
      why: "`hoursSince` (a Date.parse epoch delta over 3_600_000) was NOT reported",
    };
  }

  // ── ARM A, LEG 2: the VOICE carries it. Byte-for-byte `staleness` from
  // features/admin/spend/format.ts — the body that renders "today" for a
  // FUTURE stamp, which is the lie kit's future tense exists to stop.
  const staleness = [
    "export function staleness(value: string | null | undefined): string {",
    '  if (!value) return "never written";',
    "  const then = new Date(value).getTime();",
    '  if (Number.isNaN(then)) return "never written";',
    "  const days = Math.floor((Date.now() - then) / 86_400_000);",
    '  if (days <= 0) return "today";',
    '  if (days === 1) return "yesterday";',
    "  return `${days} days ago`;",
    "}",
  ].join("\n");
  if (relativeTimeShapeIn(staleness).length === 0) {
    return {
      ok: false,
      why: "a full relative-time cascade (epoch delta / 86_400_000 → \"today\" / \"yesterday\" / \"N days ago\") was NOT reported",
    };
  }

  // ── ARM B: the render-only voice, in a function that does NO arithmetic.
  // Byte-for-byte the dead-ends console footer, whose `ageInDays` lives at the
  // top of a 900-line file.
  const renderOnly = [
    "function Footer({ scanAgeDays }: { scanAgeDays: number | null }) {",
    "  return (",
    "    <span>",
    "      {scanAgeDays === null",
    "        ? null",
    "        : scanAgeDays === 0",
    '          ? " · scanned today"',
    "          : ` · scanned ${scanAgeDays}d ago`}",
    "    </span>",
    "  );",
    "}",
  ].join("\n");
  if (relativeTimeShapeIn(renderOnly).length === 0) {
    return {
      ok: false,
      why: "a relative-time VOICE bound to a value in a function that does NO time arithmetic was NOT reported — the split body is the commonest relative-time twin in this fleet and is invisible to every arithmetic-first rule",
    };
  }
  // …and the one-line ternary form from ProviderSyncDashboard.tsx, where the
  // "verified today" branch hides the hours the helper just measured.
  const ternaryVoice = [
    "function Stamp({ days }: { days: number }) {",
    '  return <Badge>{days === 0 ? "verified today" : `${days}d ago`}</Badge>;',
    "}",
  ].join("\n");
  if (relativeTimeShapeIn(ternaryVoice).length === 0) {
    return {
      ok: false,
      why: "`{days === 0 ? \"verified today\" : `${days}d ago`}` was NOT reported",
    };
  }

  // ── NEGATIVES ────────────────────────────────────────────────────────────
  // A THRESHOLD-ONLY use: an age picking a branch, with no division and no
  // rendered string. Branching on an age is the normal, correct use of one.
  const thresholdOnly = [
    "const DAY_MS = 24 * 60 * 60 * 1000;",
    "function isStale(iso: string): boolean {",
    "  return Date.now() - new Date(iso).getTime() > DAY_MS;",
    "}",
  ].join("\n");
  const thresholdHits = relativeTimeShapeIn(thresholdOnly);
  if (thresholdHits.length !== 0) {
    return {
      ok: false,
      why: `an age used ONLY as a branch threshold was reported as a formatter (${thresholdHits
        .map((h) => h.text)
        .join(" | ")})`,
    };
  }
  // A DURATION: an elapsed length with no "ago". duration-shape.mjs owns it,
  // and a second finding here would open one body in two register rows.
  //
  // THE LOAD-BEARING ONE is the second body: a relative VOICE inside a function
  // that DIVIDES by a time base. `duration-shape.mjs` reports that line (a time
  // base plus a `}m` unit label), and its `fix` text already sends it to
  // formatRelativeTime. Reporting it here as well would open one body in two
  // register rows under two line numbers — which is exactly what re-opened
  // every censused clock the last time a lane widened. The veto is what keeps
  // arm B to the RENDER-ONLY sites it was built for.
  const duration = [
    "function elapsedLabel(startedAt: number, finishedAt: number): string {",
    "  const ms = finishedAt - startedAt;",
    "  return `${(ms / 1000).toFixed(1)}s`;",
    "}",
    "function agoLabel(ms: number): string {",
    "  const mins = Math.round(ms / 60_000);",
    "  return `${mins}m ago`;",
    "}",
  ].join("\n");
  const durationHits = relativeTimeShapeIn(duration);
  if (durationHits.length !== 0) {
    return {
      ok: false,
      why: `an ELAPSED DURATION with no "ago" was reported as a relative time (${durationHits
        .map((h) => h.text)
        .join(" | ")})`,
    };
  }
  // A DATE-ONLY render is an absolute stamp, not a relative one.
  const dateOnly = [
    "function stamp(iso: string): string {",
    "  return new Date(iso).toLocaleDateString();",
    "}",
    "const shown = value.toLocaleString(undefined, { month: \"short\", day: \"numeric\" });",
  ].join("\n");
  const dateHits = relativeTimeShapeIn(dateOnly);
  if (dateHits.length !== 0) {
    return {
      ok: false,
      why: `an absolute DATE render was reported as a relative time (${dateHits
        .map((h) => h.text)
        .join(" | ")})`,
    };
  }
  // A TICKING COUNTDOWN is formatDurationMs's, by kit's own doc. Both of these
  // are live, and both read "in …" exactly as a deadline stamp would.
  const countdown = [
    "function Gate({ secondsLeft }: { secondsLeft: number }) {",
    "  return <span>{`${baseTitle} · auto-continue in ${secondsLeft}s`}</span>;",
    "}",
  ].join("\n");
  const countdownHits = relativeTimeShapeIn(countdown);
  if (countdownHits.length !== 0) {
    return {
      ok: false,
      why: `a ticking COUNTDOWN ("auto-continue in 30s") was reported as a relative-time stamp — kit's own doc sends a countdown to formatDurationMs, and arm B has no delta to tell the two apart (${countdownHits
        .map((h) => h.text)
        .join(" | ")})`,
    };
  }
  // A WINDOW between two GIVEN stamps is a duration somebody chose, not an age.
  const window = [
    "function windowLength(window: { from: Date; to: Date }) {",
    "  const windowDays = (window.to.getTime() - window.from.getTime()) / 86_400_000;",
    '  return `${Math.round(windowDays)} days ago`;',
    "}",
  ].join("\n");
  const windowHits = relativeTimeShapeIn(window);
  if (windowHits.length !== 0) {
    return {
      ok: false,
      why: `a WINDOW between two given stamps was reported as an age — only the CLOCK (Date.now(), a no-argument new Date()) makes a delta an age (${windowHits
        .map((h) => h.text)
        .join(" | ")})`,
    };
  }
  // A VOICE WITH NO VALUE BOUND TO IT. Three live shapes, one rule: prose that
  // happens to contain the word, and a named tier used as VOCABULARY — a
  // `case "today":` window preset, a type union — which is a filter value, a
  // discriminant, a menu label, and formats nothing.
  // features/admin/spend/windows.ts is nothing but the second kind.
  const prose = [
    "function Empty() {",
    "  return <p>This project was archived long ago and nothing runs here.</p>;",
    "}",
    "// the census below was taken a while ago",
    'export type WindowPreset = "today" | "yesterday" | "last7";',
    "function rangeFor(preset: WindowPreset) {",
    "  switch (preset) {",
    '    case "today":',
    "      return todayRange();",
    '    case "yesterday":',
    "      return yesterdayRange();",
    "  }",
    "}",
  ].join("\n");
  const proseHits = relativeTimeShapeIn(prose);
  if (proseHits.length !== 0) {
    return {
      ok: false,
      why: `a relative-time word with NO VALUE BOUND TO IT — prose, or a named tier used as VOCABULARY (a \`case "today":\` window preset, a type union) — was reported as a formatter (${proseHits
        .map((h) => h.text)
        .join(" | ")})`,
    };
  }
  // A MINIFIED BUNDLE is not source.
  const minified = [
    '"use strict";(()=>{' +
      "x".repeat(400) +
      "let a=Date.now()-t,b=a/86400000,c=`${b}d ago`;" +
      "y".repeat(200) +
      "})();",
  ].join("\n");
  const minifiedHits = relativeTimeShapeIn(minified);
  if (minifiedHits.length !== 0) {
    return {
      ok: false,
      why: `a MINIFIED BUNDLE line was reported as a relative-time body (${minifiedHits
        .map((h) => h.text.slice(0, 60))
        .join(" | ")})`,
    };
  }
  // AN ADOPTED CALL SITE is silent, in both directions and bare.
  const adopted = [
    'import { formatRelativeTime } from "@ai-matrx/kit/format";',
    'const seen = formatRelativeTime(row.last_seen_at, { style: "short" });',
    "const due = formatRelativeTime(row.due_at, { suffix: false });",
  ].join("\n");
  const adoptedHits = relativeTimeShapeIn(adopted);
  if (adoptedHits.length !== 0) {
    return {
      ok: false,
      why: `an adopted formatRelativeTime call site was reported (${adoptedHits
        .map((h) => h.text)
        .join(" | ")})`,
    };
  }
  return { ok: true };
}
