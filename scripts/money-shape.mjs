/**
 * money-shape.mjs — THE SHAPE RULE for money formatting.
 *
 * WHY (the tenth adversarial review, 2026-09-14). The twins guard had SHAPE
 * lanes for byte sizes, durations and formatter INPUTS, and nothing else. Money
 * was policed by NAME alone: `formatUsd` was registered, clean, and therefore
 * "adopted" — while `matrx-frontend/features/admin/spend/format.ts` carried
 * `usd`, `usdPrecise` and `count` bodies imported by NINE live Spend Dashboard
 * and Spend Explorer components, `UsageTableClient.tsx` carried `fmtCost` with
 * ten call sites, and `features/hindsight/components/tokens.ts` carried a third
 * `fmtCost` IN A FILE THAT ALREADY IMPORTS KIT. Twenty-two more files outside
 * the package build an `Intl.NumberFormat` with `style: "currency"` by hand.
 *
 * The bodies were not merely duplicated, they DISAGREED with the package and
 * with their own comments: `usdPrecise(0.000004)` returned "$0.0000" under a
 * doc comment promising "Keeps sub-cent amounts visible so a $0.004 ledger does
 * not read as $0.00", and `fmtCost` rendered a $0.004 `total_cost` as "$0.00"
 * in the viewer's own locale (so a German admin read "0,00 $"). A capability is
 * duplicated by its SHAPE long before anybody re-uses its spelling.
 *
 * THE PATTERN THIS DETECTS. A number becoming a MONEY string, which in
 * JavaScript is one of four things:
 *   (a) an `Intl.NumberFormat` / `toLocaleString` carrying `style: "currency"`,
 *       and every `.format(…)` call on a binding built that way;
 *   (b) a literal `$` bound to a value — `` `$${x}` ``, `"$" + x`, `x + "$"`;
 *   (c) `.toFixed(2…6)` beside a currency label (a bound `$`, a quoted "USD",
 *       or a money word on the same line);
 *   (d) a CENTS / MILLICENTS conversion — `cents / 100`, `millicents / 100_000`
 *       — whose dividend names itself as a sub-unit, which is the one money
 *       shape that can reach the screen with neither a `$` nor a `toFixed`
 *       on its own line.
 *
 * THE ONE HOME is `formatUsd` from `@ai-matrx/kit/format`: `en-US` pinned so
 * the decimal separator never moves under the reader, thousands grouped,
 * `digits: "adaptive"` for per-token and per-call costs (2 decimals at a dollar
 * or more, 4 down to a cent, 6 below that), and an em-dash for a value NOBODY
 * MEASURED — never a confident "$0.00".
 *
 * NEGATIVES, all of them live shapes in this fleet:
 *   - a `$` inside a REGEX literal (`/^\$\d+/`) or an end-of-string anchor;
 *   - a `$` inside a SHELL string (`"echo $HOME"`, `sed 's/$x/y/'`) — a shell
 *     `$` is followed by an identifier or a paren, never by the `${` that arm
 *     (b) requires;
 *   - a `$` that is only the template-interpolation marker itself: `${x}` has
 *     ONE dollar, money has two (`$${x}`). THIS IS THE MECHANISM, not a
 *     side-effect: there is deliberately no "is this line a regex / a shell
 *     command" heuristic here, because the two-dollar rule plus the backslash
 *     lookbehind below already exclude both, and a filter that cannot be shown
 *     failing is not a guard;
 *   - a CSS/SCSS variable (`$primary`, `--tw-$`), which names an identifier;
 *   - `.toFixed(2)` with no currency anywhere — a percentage, a score, a
 *     latency, a ratio;
 *   - `/ 100` as a PERCENTAGE step, which is why arm (d) requires the dividend
 *     to NAME itself cents/millicents/microdollars.
 *
 * Exported as a module so `check-package-twins.mjs` can run it as a shape lane
 * and so the self-test can plant a body and prove it fails.
 */

/**
 * A line reduced to the EXPRESSIONS on it: comments gone, plain-quoted string
 * TEXT gone, template TEXT gone but `${…}` interpolations kept. Identical in
 * behaviour to `duration-shape.mjs`'s helper and duplicated for the same
 * reason every lane module is standalone: these files are distributed
 * byte-for-byte into eight roots by `scripts/sync_ts_package_guard.mjs`, and a
 * shared helper would be a ninth file to keep in step.
 */
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
 * Comments gone, string TEXT kept — arms (b) and (c) lives in it.
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

/**
 * A MINIFIED BUNDLE IS NOT AUTHORED SOURCE. `git ls-files *.js` reaches
 * committed build output, and a whole bundle on one line carries every shape
 * there is by sheer volume with no body anybody could collapse.
 */
const MINIFIED_LINE = 500;

/** `style: "currency"` in any spelling — the unambiguous money declaration. */
const CURRENCY_STYLE_RE = /\bstyle\s*:\s*["'`]currency["'`]/;

/** `currency: "USD"` — the same declaration written from the other side. */
const CURRENCY_CODE_RE = /\bcurrency\s*:\s*["'`][A-Za-z]{3}["'`]/;

/** A formatter construction whose options may run over several lines. */
const NUMBER_FORMAT_RE = /new\s+Intl\.NumberFormat\s*\(|\.toLocaleString\s*\(/;

/** How far past a construction its options object may reach. */
const OPTIONS_WINDOW = 8;

/**
 * THE BOUND DOLLAR. A literal `$` glued to a VALUE, in the three spellings
 * JavaScript offers:
 *   - `` `$${amount}` `` — the dollar is the character before the
 *     interpolation. EXACTLY TWO: one dollar is the interpolation marker
 *     itself, and THREE is LaTeX display math (`` `$$${mathContent}$$` ``),
 *     which four markdown renderers in this fleet build exactly that way.
 *   - `"$" + amount` / `amount + "$"` — the concatenation form.
 * A backslash in front (`\$`) is a REGEX escape and never money.
 */
const TEMPLATE_DOLLAR_RE = /(?<![$\\])\$\$\{/;
const CONCAT_DOLLAR_RE = /["'`]\s*\$\s*["'`]\s*\+|\+\s*["'`]\s*\$\s*["'`]/;

/**
 * A QUOTED currency word or symbol standing beside a value: `" USD"`, `"usd"`,
 * `"€"`, `"£"`. Deliberately NOT a bare `$`, which arm (b) already owns with
 * its own negatives.
 */
const CURRENCY_WORD_RE =
  /["'`][^"'`\n]*(?:\b(?:USD|EUR|GBP|CAD|AUD|JPY|usd|eur|gbp)\b|[€£¥])[^"'`\n]*["'`]/;

/**
 * A MONEY WORD naming the value being formatted. Used ONLY as the corroboration
 * for `.toFixed(…)`, never on its own: a variable called `cost` is not a
 * finding, `cost.toFixed(2)` beside a dollar or a currency word is.
 */
const MONEY_WORD_RE =
  /\b(?:cost|costs|price|prices|pricing|spend|spent|amount|amounts|usd|dollars?|charge|charges|fee|fees|revenue|invoice|billing|billed|subtotal|balance|payout|refund)\b/i;

/**
 * Identifiers are split at their camelCase humps before the money words are
 * looked for, so `costPerCall`, `totalSpendUsd` and `unit_price` all read as
 * the words they are. Without it `\bcost\b` cannot see `costPerCall`, which is
 * exactly how the live per-call cost bodies are spelled.
 */
function wordsIn(line) {
  return line.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ");
}

/**
 * A POSTGRES POSITIONAL PARAMETER, not money. `$1`, `$2`, `$3` are how every
 * SQL builder in this fleet names its arguments, and they are written
 * `` `$${index + 1}` `` — two dollars and an interpolation, which is money's
 * exact spelling. What separates them is WHAT IS INTERPOLATED: a placeholder
 * interpolates a LOOP INDEX and nothing else, while a money body interpolates
 * a value. Narrow on purpose — a bare index, an index plus one, or the LENGTH
 * of the argument array being built (`$${values.length}::${type}`, live in
 * scripts/check-door-rows.ts, which is the next parameter's number). No money
 * body in this fleet renders `.length` as a price.
 */
const SQL_PLACEHOLDER_RE =
  /\$\$\{\s*(?:[\w$]+(?:\.[\w$]+)*\.length|i|j|k|n|ix|idx|index|pos|position|ordinal|argIndex|paramIndex)\s*(?:\+\s*1\s*)?\}/;

/** `.toFixed(2)` … `.toFixed(6)` — the fixed-decimal money precision band. */
const MONEY_TOFIXED_RE = /\.toFixed\s*\(\s*([2-6])\s*\)/;

/**
 * CENTS AND MILLICENTS. A sub-unit becoming dollars is money arithmetic whether
 * or not a `$` is on the line, and it is the one money shape that can reach the
 * screen invisibly. It requires the DIVIDEND to name itself, because `/ 100` is
 * also the single most common PERCENTAGE step in the fleet.
 */
const SUBUNIT_DIVIDE_RE =
  /\b[A-Za-z_$][\w$.]*(?:cents|Cents|CENTS|millicents|Millicents|microUsd|MicroUsd|microDollars)\b[^;\n]{0,40}[/]\s*\(?\s*(?:100|100_?000|1e2|1e5|1_?000_?00)\b/;

/** How far a currency label may sit from a `.toFixed(…)` and still bind to it. */
const LABEL_WINDOW = 3;

/**
 * Money-formatting findings in one file's source.
 * Returns [{ line, text }] — every place a number becomes a money string.
 */
export function moneyShapeIn(source) {
  const lines = source.split("\n");
  const out = [];
  const seen = new Set();
  const report = (index) => {
    if (seen.has(index)) return;
    seen.add(index);
    out.push({ line: index + 1, text: lines[index].trim() });
  };

  // ── PASS 1: currency formatter constructions, and the names they bind ──
  const currencyNames = new Set();
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].length > MINIFIED_LINE) continue;
    const raw = withoutComments(lines[i]);
    if (!NUMBER_FORMAT_RE.test(raw)) continue;
    const window = lines
      .slice(i, Math.min(lines.length, i + OPTIONS_WINDOW + 1))
      .map(withoutComments)
      .join("\n");
    // The options object ends at the first line that closes the call; a window
    // is enough because nothing else in it can spell `style: "currency"`.
    if (!CURRENCY_STYLE_RE.test(window) && !CURRENCY_CODE_RE.test(window)) {
      continue;
    }
    report(i);
    const bound = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=/.exec(raw);
    if (bound) currencyNames.add(bound[1]);
  }

  // ── PASS 2: every `.format(…)` call on one of those bindings ──
  if (currencyNames.size > 0) {
    const alternation = [...currencyNames]
      .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|");
    const callRe = new RegExp(String.raw`\b(?:${alternation})\s*\.\s*format\s*\(`);
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].length > MINIFIED_LINE) continue;
      if (callRe.test(codeOnlyLine(lines[i]))) report(i);
    }
  }

  // ── PASS 3: the bound dollar, the fixed-decimal band, and the sub-unit ──
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length > MINIFIED_LINE) continue;
    const raw = withoutComments(line);

    if (
      (TEMPLATE_DOLLAR_RE.test(raw) || CONCAT_DOLLAR_RE.test(raw)) &&
      !SQL_PLACEHOLDER_RE.test(raw)
    ) {
      report(i);
      continue;
    }

    const fixed = MONEY_TOFIXED_RE.exec(raw);
    if (fixed) {
      const band = lines
        .slice(Math.max(0, i - LABEL_WINDOW), i + LABEL_WINDOW + 1)
        .map(withoutComments)
        .join("\n");
      const labelled =
        TEMPLATE_DOLLAR_RE.test(band) ||
        CONCAT_DOLLAR_RE.test(band) ||
        CURRENCY_WORD_RE.test(band) ||
        MONEY_WORD_RE.test(wordsIn(raw));
      if (labelled) {
        report(i);
        continue;
      }
    }

    if (SUBUNIT_DIVIDE_RE.test(codeOnlyLine(line))) report(i);
  }

  out.sort((a, b) => a.line - b.line);
  return out;
}

/** Proves the rule can fail and does not fire on the shapes that are not money. */
export function selfTestMoneyShape() {
  // ── LEG 1: the live `Intl.NumberFormat` money module. Byte-for-byte from
  // matrx-frontend features/admin/spend/format.ts on origin/main — the file
  // whose `usdPrecise` promised sub-cent visibility in its own doc comment and
  // rendered 0.000004 as "$0.0000".
  const liveIntl = [
    'const USD = new Intl.NumberFormat("en-US", {',
    '  style: "currency",',
    '  currency: "USD",',
    "  minimumFractionDigits: 2,",
    "  maximumFractionDigits: 2,",
    "});",
    "",
    "export function usd(value: number | null | undefined): string {",
    '  if (value === null || value === undefined) return "not measured";',
    "  return USD.format(value);",
    "}",
  ].join("\n");
  const intlHits = moneyShapeIn(liveIntl);
  if (intlHits.length === 0) {
    return {
      ok: false,
      why: "a hand-built `new Intl.NumberFormat(…, { style: \"currency\" })` was NOT reported — 22 files outside the package build one, and the money lane exists because the NAME lane read formatUsd as adopted while they did",
    };
  }
  if (!intlHits.some((h) => h.text.includes("USD.format(value)"))) {
    return {
      ok: false,
      why: "the CONSTRUCTION was reported and the `.format(…)` CALL SITE on the bound formatter was not — a module that builds one formatter and calls it from six exports would show one finding and hide six bodies",
    };
  }

  // ── LEG 2: the bound dollar. Byte-for-byte `fmtCost` from
  // features/admin/users/components/UsageTableClient.tsx (ten call sites), which
  // also uses the VIEWER's locale, so a German admin reads "0,00 $".
  const boundDollar = [
    "function fmtCost(n: number): string {",
    '  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;',
    "}",
  ].join("\n");
  if (moneyShapeIn(boundDollar).length === 0) {
    return {
      ok: false,
      why: "`` `$${n…}` `` was NOT reported — a literal dollar glued to an interpolation is the commonest money body in the fleet and carries no `style: \"currency\"` to find",
    };
  }

  // ── LEG 3: the fixed-decimal band. Byte-for-byte `fmtCost` from
  // features/hindsight/components/tokens.ts — three fixed decimals, in a file
  // that ALREADY imports @ai-matrx/kit/format for durations.
  const fixedDecimals = [
    "export function fmtCost(value: number | null | undefined): string {",
    '  if (value == null) return "—";',
    "  return `$${Number(value).toFixed(3)}`;",
    "}",
  ].join("\n");
  if (moneyShapeIn(fixedDecimals).length === 0) {
    return {
      ok: false,
      why: "a `$` + `.toFixed(3)` money body was NOT reported",
    };
  }
  // …and the same precision with the currency word instead of the symbol.
  // A NON-USD currency word, deliberately: `USD` is also in MONEY_WORD_RE, so a
  // USD fixture would prove nothing about this leg. It is also the real gap —
  // kit has no voice for a currency that is not the dollar.
  const wordLabelled = [
    "const total = `${gross.toFixed(2)} EUR`;",
  ].join("\n");
  if (moneyShapeIn(wordLabelled).length === 0) {
    return {
      ok: false,
      why: "a `.toFixed(2)` beside a quoted currency WORD (\"EUR\") was NOT reported — a money body does not have to spell the symbol, and a non-dollar currency is the one kit has no voice for at all",
    };
  }
  // …and the money-word corroboration, where neither symbol nor code appears.
  const moneyWord = [
    "const label = costPerCall.toFixed(4) + suffix;",
  ].join("\n");
  if (moneyShapeIn(moneyWord).length === 0) {
    return {
      ok: false,
      why: "a `.toFixed(4)` on a value NAMED as money (`costPerCall`) was NOT reported",
    };
  }

  // ── LEG 4: the sub-unit conversion, the money shape with no symbol at all.
  const cents = [
    "const dollars = row.amountCents / 100;",
    "const perCall = usage.millicents / 100_000;",
  ].join("\n");
  if (moneyShapeIn(cents).length < 2) {
    return {
      ok: false,
      why: "a cents / millicents conversion was NOT reported — it is the one money shape that reaches a screen with neither a `$` nor a `.toFixed` on its own line",
    };
  }

  // ── NEGATIVES ────────────────────────────────────────────────────────────
  // THE TEMPLATE MARKER ITSELF. One dollar is interpolation; money has two.
  const plainInterpolation = [
    "const label = `${count} rows in ${table}`;",
    "const css = `width: ${pct}%`;",
    "const cls = `text-${tone}-600`;",
  ].join("\n");
  const plainHits = moneyShapeIn(plainInterpolation);
  if (plainHits.length !== 0) {
    return {
      ok: false,
      why: `a plain template interpolation was reported as money — the \`\${\` marker is ONE dollar and money is two (${plainHits
        .map((h) => h.text)
        .join(" | ")})`,
    };
  }
  // A `$` inside a REGEX literal, including an end-of-string anchor.
  const regexDollar = [
    // The load-bearing one: a regex BUILT from a template, where a literal
    // dollar is escaped immediately in front of an interpolated pattern. The
    // backslash lookbehind is the only thing between this and a money finding.
    "const re = new RegExp(`^\\\\$${escaped}$`);",
    "const MONEY_RE = /^\\$\\d+(?:\\.\\d{2})?$/;",
    'const cleaned = raw.replace(/\\s+$/, "");',
    "const trailing = /[a-z]+$/.test(name);",
  ].join("\n");
  const regexHits = moneyShapeIn(regexDollar);
  if (regexHits.length !== 0) {
    return {
      ok: false,
      why: `a \`$\` inside a REGEX literal was reported as money (${regexHits
        .map((h) => h.text)
        .join(" | ")})`,
    };
  }
  // A `$` inside a SHELL string.
  const shell = [
    'const out = execSync(`echo $HOME`, { encoding: "utf8" });',
    "execFileSync(\"bash\", [\"-c\", `cd $DIR && git rev-parse HEAD`]);",
  ].join("\n");
  const shellHits = moneyShapeIn(shell);
  if (shellHits.length !== 0) {
    return {
      ok: false,
      why: `a SHELL parameter expansion was reported as money (${shellHits
        .map((h) => h.text)
        .join(" | ")})`,
    };
  }
  // LATEX DISPLAY MATH. `$$…$$` around an interpolation is THREE dollars, and
  // four markdown renderers in this fleet build it exactly this way.
  const latex = [
    "const wrapped = `\\n\\n$$${mathContent}$$\\n\\n`;",
    "const inline = `$$${mathContent}$$`;",
  ].join("\n");
  const latexHits = moneyShapeIn(latex);
  if (latexHits.length !== 0) {
    return {
      ok: false,
      why: `LaTeX display math (\`$$…$$\` around an interpolation) was reported as money — money is EXACTLY two dollars (${latexHits
        .map((h) => h.text)
        .join(" | ")})`,
    };
  }
  // A POSTGRES POSITIONAL PARAMETER. `$1`, `$2` — two dollars, an
  // interpolation, and a loop index where money would have a value.
  const sqlPlaceholder = [
    "const label = arg.name || `$${index + 1}`;",
    "const ref = `$${i}`;",
    "parts.push(`${name} => $${values.length}::${type}`);",
  ].join("\n");
  const sqlHits = moneyShapeIn(sqlPlaceholder);
  if (sqlHits.length !== 0) {
    return {
      ok: false,
      why: `a Postgres positional parameter (\`$1\`, built as \`$\${index + 1}\`) was reported as money (${sqlHits
        .map((h) => h.text)
        .join(" | ")})`,
    };
  }
  // A CSS/SCSS variable and a jQuery-style `$(` call.
  const cssAndJquery = [
    'const token = "$primary";',
    'const el = $("#root");',
    "const scss = `$spacing-4`;",
  ].join("\n");
  const cssHits = moneyShapeIn(cssAndJquery);
  if (cssHits.length !== 0) {
    return {
      ok: false,
      why: `a CSS variable or a \`$(\` selector was reported as money (${cssHits
        .map((h) => h.text)
        .join(" | ")})`,
    };
  }
  // `.toFixed(2)` with NO currency in sight: a percentage, a score, a latency.
  const notMoney = [
    "const pct = `${(ratio * 100).toFixed(2)}%`;",
    "const score = confidence.toFixed(2);",
    "const latency = `${ms.toFixed(2)} ms`;",
  ].join("\n");
  const notMoneyHits = moneyShapeIn(notMoney);
  if (notMoneyHits.length !== 0) {
    return {
      ok: false,
      why: `a fixed-decimal NON-money value was reported (${notMoneyHits
        .map((h) => h.text)
        .join(" | ")})`,
    };
  }
  // `/ 100` AS A PERCENTAGE, which is the commonest `/ 100` there is.
  const percentStep = [
    "const fraction = percentComplete / 100;",
    "const opacity = alphaPercent / 100;",
  ].join("\n");
  const percentHits = moneyShapeIn(percentStep);
  if (percentHits.length !== 0) {
    return {
      ok: false,
      why: `a PERCENTAGE step (\`/ 100\`) was reported as a cents conversion — arm (d) requires the dividend to NAME itself cents/millicents (${percentHits
        .map((h) => h.text)
        .join(" | ")})`,
    };
  }
  // A NON-currency Intl.NumberFormat belongs to the COUNT lane, not this one.
  const countFormatter = [
    'const COUNT = new Intl.NumberFormat("en-US");',
    "const label = COUNT.format(rows.length);",
  ].join("\n");
  const countHits = moneyShapeIn(countFormatter);
  if (countHits.length !== 0) {
    return {
      ok: false,
      why: `a NON-currency Intl.NumberFormat was reported by the MONEY lane — it is the COUNT lane's, and reporting it here would put every count body in the wrong register row (${countHits
        .map((h) => h.text)
        .join(" | ")})`,
    };
  }
  // A MINIFIED BUNDLE is not source.
  const minified = [
    '"use strict";(()=>{' +
      "x".repeat(400) +
      'let a=`$${n.toFixed(2)}`,b=c/100;' +
      "y".repeat(200) +
      "})();",
  ].join("\n");
  const minifiedHits = moneyShapeIn(minified);
  if (minifiedHits.length !== 0) {
    return {
      ok: false,
      why: `a MINIFIED BUNDLE line was reported as a money body (${minifiedHits
        .map((h) => h.text.slice(0, 60))
        .join(" | ")})`,
    };
  }
  // AN ADOPTED CALL SITE is silent.
  const adopted = [
    'import { formatUsd } from "@ai-matrx/kit/format";',
    'const label = formatUsd(row.total_cost, { digits: "adaptive" });',
  ].join("\n");
  const adoptedHits = moneyShapeIn(adopted);
  if (adoptedHits.length !== 0) {
    return {
      ok: false,
      why: `an adopted formatUsd call site was reported (${adoptedHits
        .map((h) => h.text)
        .join(" | ")})`,
    };
  }
  return { ok: true };
}
