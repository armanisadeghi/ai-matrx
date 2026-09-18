/**
 * count-shape.mjs — THE SHAPE RULE for count formatting.
 *
 * WHY (the tenth adversarial review, 2026-09-14). `formatCount` was registered
 * in the name catalog and clean, so the guard called it adopted. It was not:
 * `matrx-frontend/features/admin/spend/format.ts` exported a `count` body built
 * on its own `new Intl.NumberFormat("en-US")`, imported by the Spend Dashboard
 * and Spend Explorer; `UsageTableClient.tsx` kept `const fmtInt = new
 * Intl.NumberFormat()`; and the lint-debt and dead-ends consoles each spell
 * `report.totals.filesScanned.toLocaleString()` beside the word "files". A
 * capability is duplicated by its SHAPE long before anybody re-uses its
 * spelling — the same hole the byte-size and duration lanes closed, in the
 * third formatter family.
 *
 * THE PATTERN THIS DETECTS. An integer becoming a grouped or abbreviated
 * display string:
 *   (a) an `Intl.NumberFormat` built WITHOUT `style: "currency"`, plus every
 *       `.format(…)` call on the binding it is stored in. A currency one
 *       belongs to `money-shape.mjs` and is deliberately not reported here, so
 *       one body can never land in two register rows;
 *   (b) `.toLocaleString()` on a value beside a COUNT NOUN — "files", "rows",
 *       "tokens", "chars", "users" — which is what separates a rendered count
 *       from a rendered date;
 *   (c) a hand-rolled magnitude abbreviation — `/ 1000` with a "k" suffix,
 *       `/ 1e6` with an "M" — which is the voice kit does NOT yet have and
 *       therefore the one that gets censused with its blocker named rather
 *       than collapsed.
 *
 * THE ONE HOME is `formatCount` from `@ai-matrx/kit/format`: locale-grouped
 * integer, `"0"` for a MEASURED zero, an em-dash for a value nobody measured.
 *
 * NEGATIVES, all of them live shapes in this fleet:
 *   - `.toLocaleString()` ON A DATE, which is the commonest call of that name
 *     in the fleet by a wide margin — recognised by the receiver naming itself
 *     a date, by `new Date(`, or by the options object carrying date or time
 *     fields;
 *   - a count used ONLY in a COMPARISON or as arithmetic — `if (rows.length >
 *     100)` renders nothing;
 *   - a `style: "currency"` formatter (the money lane's);
 *   - a BYTE abbreviation, where the same `/ 1000` carries a " KB" / " MB"
 *     label — `byte-size-shape.mjs` owns those, and a count finding on top of
 *     one would open the same body in two register rows. The word boundary on
 *     the suffix vocabulary is what excludes them.
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
 * Comments gone, string TEXT kept — the noun labels lives in it.
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

const CURRENCY_STYLE_RE = /\bstyle\s*:\s*["'`]currency["'`]|\bcurrency\s*:\s*["'`][A-Za-z]{3}["'`]/;
const NUMBER_FORMAT_RE = /new\s+Intl\.NumberFormat\s*\(/;
const OPTIONS_WINDOW = 8;

/**
 * DATE FIELDS in an options object. `toLocaleString(undefined, { month: "short",
 * day: "numeric" })` is a DATE being rendered, and it is the single most common
 * `toLocaleString` in this fleet.
 */
const DATE_OPTION_RE =
  /\b(?:year|month|day|weekday|hour|minute|second|dateStyle|timeStyle|timeZone|hour12|era)\s*:/;

/** A receiver that NAMES itself a date, and the `new Date(` constructor. */
const DATE_RECEIVER_RE =
  /\bnew\s+Date\s*\(|\b(?:date|dt|day|iso|stamp|timestamp|time|when|at|created|updated|expires|deadline|start|end|published|verified|scanned|last|now|parsed)(?:[A-Z][\w$]*)?\s*(?:\?\.)?\.toLocaleString/i;

/** `.toLocaleString()` with no options, or a LOCALE argument only. */
const PLAIN_TOLOCALE_RE =
  /\.toLocaleString\s*\(\s*(?:\)|["'`][A-Za-z-]*["'`]\s*\)|undefined\s*\))/;

/**
 * COUNT NOUNS. The word a rendered integer is standing next to — this is what
 * the brief calls "a noun label", and it is the whole difference between a
 * count on a screen and a number in a calculation.
 */
const COUNT_NOUN_RE =
  /\b(?:chars?|characters?|rows?|tokens?|users?|items?|files?|records?|messages?|runs?|calls?|requests?|errors?|findings?|words?|results?|sources?|documents?|docs?|conversations?|agents?|entries|events?|pages?|jobs?|tasks?|views?|clicks?|installs?|members?|seats?|credits?|lines?)\b/i;

/** How far a noun label may sit from the call and still bind to it. */
const NOUN_WINDOW = 2;

/**
 * THE MAGNITUDE ABBREVIATION. `/ 1000` + "k", `/ 1e6` + "M" — the compact voice
 * kit deliberately does not have yet. A BYTE unit anywhere in the window
 * disqualifies it: that body is `byte-size-shape.mjs`'s, and reporting it here
 * too would open one body in two register rows.
 */
const SI_DIVIDE_RE =
  /[/]\s*\(?\s*(?:1_?000_?000_?000|1_?000_?000|1_?000|1e9|1e6|1e3)\b/;
const ABBREV_SUFFIX_RE = /\}\s*(?:k|K|M)\b|["'`]\s*(?:k|K|M)\s*["'`]/;
/**
 * THE SUFFIX VOCABULARY IS THE WHOLE SEPARATION FROM BYTES, and it is tight on
 * purpose. `B` is deliberately not a count suffix: a bare `}B` is a byte body's
 * bytes tier far more often than a billions tier, and `byte-size-shape.mjs`
 * owns those. Every alternative ends on a WORD BOUNDARY, which is what keeps
 * every byte label out with no second filter to maintain: `} MB` cannot match
 * `\}\s*M\b` (the `M` is followed by `B`), `} KB` cannot match `K\b`, and `}kB`
 * cannot match `k\b`. A billions abbreviator is still reached — through the
 * `k` and `M` siblings every one of them writes on the lines above.
 */
const ABBREV_WINDOW = 4;

/**
 * Count-formatting findings in one file's source.
 * Returns [{ line, text }].
 */
export function countShapeIn(source) {
  const lines = source.split("\n");
  const out = [];
  const seen = new Set();
  const report = (index) => {
    if (seen.has(index)) return;
    seen.add(index);
    out.push({ line: index + 1, text: lines[index].trim() });
  };

  // ── PASS 1: NON-currency Intl.NumberFormat constructions and their bindings ──
  const countNames = new Set();
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].length > MINIFIED_LINE) continue;
    const raw = withoutComments(lines[i]);
    if (!NUMBER_FORMAT_RE.test(raw)) continue;
    const window = lines
      .slice(i, Math.min(lines.length, i + OPTIONS_WINDOW + 1))
      .map(withoutComments)
      .join("\n");
    if (CURRENCY_STYLE_RE.test(window)) continue; // the money lane's body
    report(i);
    const bound = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=/.exec(raw);
    if (bound) countNames.add(bound[1]);
  }
  if (countNames.size > 0) {
    const alternation = [...countNames]
      .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|");
    const callRe = new RegExp(String.raw`\b(?:${alternation})\s*\.\s*format\s*\(`);
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].length > MINIFIED_LINE) continue;
      if (callRe.test(codeOnlyLine(lines[i]))) report(i);
    }
  }

  // ── PASS 2/3: the bare toLocaleString beside a noun, and the abbreviation ──
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length > MINIFIED_LINE) continue;
    const raw = withoutComments(line);

    if (PLAIN_TOLOCALE_RE.test(raw) && !DATE_RECEIVER_RE.test(raw)) {
      const band = lines
        .slice(Math.max(0, i - NOUN_WINDOW), i + NOUN_WINDOW + 1)
        .map(withoutComments)
        .join("\n");
      if (!DATE_OPTION_RE.test(band) && COUNT_NOUN_RE.test(band)) {
        report(i);
        continue;
      }
    }

    if (!SI_DIVIDE_RE.test(codeOnlyLine(line))) continue;
    const band = lines
      .slice(Math.max(0, i - ABBREV_WINDOW), i + ABBREV_WINDOW + 1)
      .map(withoutComments)
      .join("\n");
    if (ABBREV_SUFFIX_RE.test(band)) report(i);
  }

  out.sort((a, b) => a.line - b.line);
  return out;
}

/** Proves the rule can fail and does not fire on the shapes that are not counts. */
export function selfTestCountShape() {
  // ── LEG 1: the live non-currency formatter. Byte-for-byte from
  // matrx-frontend features/admin/spend/format.ts on origin/main.
  const liveCount = [
    'const COUNT = new Intl.NumberFormat("en-US");',
    "",
    "export function count(value: number | null | undefined): string {",
    '  if (value === null || value === undefined) return "—";',
    "  return COUNT.format(value);",
    "}",
  ].join("\n");
  const countHits = countShapeIn(liveCount);
  if (countHits.length === 0) {
    return {
      ok: false,
      why: "a hand-built NON-currency `new Intl.NumberFormat(…)` was NOT reported — this is the live `count` body the Spend Dashboard and Spend Explorer both import",
    };
  }
  if (!countHits.some((h) => h.text.includes("COUNT.format(value)"))) {
    return {
      ok: false,
      why: "the CONSTRUCTION was reported and the `.format(…)` CALL SITE on the bound formatter was not — a module that builds one formatter and calls it from several exports would show one finding and hide the rest",
    };
  }

  // ── LEG 2: the bare toLocaleString beside its noun. Byte-for-byte the live
  // lint-debt console line, `Scanned {n} files`.
  const besideNoun = [
    "        <span>",
    "          Scanned {report.totals.filesScanned.toLocaleString()} files",
    "        </span>",
  ].join("\n");
  if (countShapeIn(besideNoun).length === 0) {
    return {
      ok: false,
      why: "`n.toLocaleString()` beside the word \"files\" was NOT reported — the noun label is what makes a rendered integer a COUNT rather than a number in a calculation",
    };
  }

  // ── LEG 3: the magnitude abbreviation, the voice kit does not have.
  const abbreviated = [
    "function compactNumber(value: number): string {",
    "  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;",
    "  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}k`;",
    "  return String(value);",
    "}",
  ].join("\n");
  if (countShapeIn(abbreviated).length < 2) {
    return {
      ok: false,
      why: "a hand-rolled k / M magnitude abbreviation was NOT reported on both branches — this is the compact COUNT voice, and it is censused with its blocker (kit has no compact voice) rather than silently allowed",
    };
  }

  // ── NEGATIVES ────────────────────────────────────────────────────────────
  // A DATE rendered with toLocaleString — the commonest call of that name here.
  const dates = [
    // THE LOAD-BEARING ONE: a date rendered in the same breath as a count noun,
    // which is what a table footer looks like. Only the receiver test separates
    // it from a finding.
    "  <span>{new Date(row.created_at).toLocaleString()} · {rows.length} rows</span>",
    "function fmtDate(iso: string | null): string {",
    '  return iso ? new Date(iso).toLocaleString() : "—";',
    "}",
    "const shown = updatedAt.toLocaleString();",
    "const withFields = value.toLocaleString(undefined, {",
    '  month: "short",',
    '  day: "numeric",',
    "});",
    "// 12 rows, 4 files",
  ].join("\n");
  const dateHits = countShapeIn(dates);
  if (dateHits.length !== 0) {
    return {
      ok: false,
      why: `a DATE rendered with toLocaleString was reported as a count (${dateHits
        .map((h) => h.text)
        .join(" | ")})`,
    };
  }
  // A COUNT USED ONLY IN A COMPARISON renders nothing.
  const comparisonOnly = [
    "if (rows.length > 1_000) truncate(rows);",
    "const tooMany = files.length >= 1000;",
  ].join("\n");
  const comparisonHits = countShapeIn(comparisonOnly);
  if (comparisonHits.length !== 0) {
    return {
      ok: false,
      why: `a count used only in a COMPARISON was reported as a formatter (${comparisonHits
        .map((h) => h.text)
        .join(" | ")})`,
    };
  }
  // A CURRENCY formatter is the MONEY lane's, never this one.
  const currency = [
    'const USD = new Intl.NumberFormat("en-US", {',
    '  style: "currency",',
    '  currency: "USD",',
    "});",
    "const shown = USD.format(total);",
  ].join("\n");
  const currencyHits = countShapeIn(currency);
  if (currencyHits.length !== 0) {
    return {
      ok: false,
      why: `a CURRENCY formatter was reported by the COUNT lane — it belongs to money-shape.mjs, and reporting it here would open one body in two register rows (${currencyHits
        .map((h) => h.text)
        .join(" | ")})`,
    };
  }
  // A BYTE abbreviation divides by the same 1000 and is byte-size-shape.mjs's.
  const bytes = [
    "function humanSize(bytes: number): string {",
    "  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;",
    "  return `${(bytes / 1_000).toFixed(1)} KB`;",
    "}",
  ].join("\n");
  const byteHits = countShapeIn(bytes);
  if (byteHits.length !== 0) {
    return {
      ok: false,
      why: `a BYTE abbreviation was reported by the COUNT lane — the same \`/ 1000\` carries a byte unit and byte-size-shape.mjs owns it (${byteHits
        .map((h) => h.text)
        .join(" | ")})`,
    };
  }
  // A MINIFIED BUNDLE is not source.
  const minified = [
    '"use strict";(()=>{' +
      "x".repeat(400) +
      'let a=new Intl.NumberFormat("en-US"),b=`${(n/1000).toFixed(1)}k`;' +
      "y".repeat(200) +
      "})();",
  ].join("\n");
  const minifiedHits = countShapeIn(minified);
  if (minifiedHits.length !== 0) {
    return {
      ok: false,
      why: `a MINIFIED BUNDLE line was reported as a count body (${minifiedHits
        .map((h) => h.text.slice(0, 60))
        .join(" | ")})`,
    };
  }
  // AN ADOPTED CALL SITE is silent.
  const adopted = [
    'import { formatCount } from "@ai-matrx/kit/format";',
    "const label = `${formatCount(row.tokens)} tokens`;",
  ].join("\n");
  const adoptedHits = countShapeIn(adopted);
  if (adoptedHits.length !== 0) {
    return {
      ok: false,
      why: `an adopted formatCount call site was reported (${adoptedHits
        .map((h) => h.text)
        .join(" | ")})`,
    };
  }
  return { ok: true };
}
