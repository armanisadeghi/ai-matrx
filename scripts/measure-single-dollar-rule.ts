#!/usr/bin/env npx tsx
/**
 * MEASURE a single-dollar math rule against the real corpus before adopting it (RC-B3).
 *
 * THE single-dollar rule (`isSingleDollarMath` in `@ai-matrx/content-ir/source`) decides
 * whether `$…$` is inline math or currency — on screen, in every export, in the editor's
 * islands. A rule change moves real stored answers between "math" and "text", so it is
 * measured here first: every `$…$` span in assistant chat messages and notes is judged by
 * the published rule and by each candidate, and every span whose verdict FLIPS is counted.
 *
 * The scan is the tokenizer's: prose only (code by `findCodeRanges`), `$$` pairs skipped
 * (`pairDisplayMath`), backslash escapes skipped, one line, content ≤ 400 characters, and a
 * failed opener moves on by one character — so a later `$` can open.
 *
 * PRIVACY: nothing a person wrote is ever printed — the console gets counts and span
 * SHAPES only (letters → a, digits → 9). `--samples <file>` writes flipped spans with a
 * little context to a local file for a reviewer, and only from ASSISTANT messages (model
 * output, not a person's words); notes contribute counts and shapes only.
 *
 * Usage:
 *   npx tsx scripts/measure-single-dollar-rule.ts
 *   … --samples /path/outside/the/repo.jsonl
 *   … --module <path to a candidate build of @ai-matrx/content-ir/source>  (its
 *     isSingleDollarMath is measured as `candidate_module` against the published rule)
 *
 * READ ONLY: the session is set read-only before the first query.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { connectDirect, loadDbEnv } from "./lib/direct-db";
import { exitAfterDrain, installBlockingStdio } from "./lib/exit-after-drain";

type SourceModule = typeof import("@ai-matrx/content-ir/source");
type Rule = (content: string, after: string | undefined) => boolean;

const args = process.argv.slice(2);
const argValue = (flag: string): string | undefined => {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
};
const samplesOut = argValue("--samples");
const modulePath = argValue("--module");

const TEX = /\\[A-Za-z]+|[\\^_{}]/;

/** Pandoc `tex_math_dollars` (what remark-math approximates): no math signal required. */
const pandoc: Rule = (content, after) =>
  content.length > 0 &&
  content.length <= 400 &&
  !/^\s/.test(content) &&
  !/\s$/.test(content) &&
  !(after !== undefined && /[0-9]/.test(after));

/** Pandoc, but content that opens with a digit still needs a real TeX signal (a price). */
const pandocDigitGuard: Rule = (content, after) =>
  pandoc(content, after) && (!/^[0-9]/.test(content) || TEX.test(content));

/**
 * Pandoc delimiters + the content must not read as prose, code or a price:
 *   - no unescaped `%` — TeX's comment character (KaTeX drops the rest of the
 *     formula), and the mark of a percentage (`$\ge$20% owners**…**$`);
 *   - it does not start with a closing bracket or end with an opening one
 *     (`[$X] plus [$Y]` — two bracketed placeholders, not one formula);
 *   - it does not start or end with a straight quote (`"$", "$"` in data);
 *   - it does not end with `:` `;` `,` `/` (`$HOME/.local/bin:$PATH`,
 *     `$AAPL/$TSLA` — a separator between two `$` words).
 */
const pandocContent: Rule = (content, after) =>
  pandoc(content, after) &&
  !/(?:^|[^\\])%/.test(content) &&
  !/^[)\]}"]/.test(content) &&
  !/[(\[{":;,/]$/.test(content);

/**
 * `pandocContent`, and a formula that opens with a digit is not glued to a following
 * letter — `$10$N9qo…` is the cost field of a bcrypt hash, not the number ten.
 */
const pandocContentGlue: Rule = (content, after) =>
  pandocContent(content, after) && !(/^[0-9]/.test(content) && after !== undefined && /[A-Za-z]/.test(after));

/**
 * What a rule reads after the closing `$`. Rules up to content-ir 0.18.x read ONE
 * character; from the variable-chain guard on, the rule reads the following name
 * (`singleDollarAfter`: up to 32 characters, `\n` marking the end of the text).
 */
type AfterMode = "char" | "name";
function afterOf(text: string, close: number, mode: AfterMode): string | undefined {
  if (mode === "char") return text[close + 1];
  const rest = text.slice(close + 1, close + 33);
  return rest.length < 32 ? `${rest}\n` : rest;
}

/**
 * The false-positive classes the variable-chain guard was built for (verify-RC-B3 F5),
 * counted so a candidate's lost spans can be read by class:
 *   - `template-literal`: `${a}${b}`, `${name}` — the span is `{identifier}` or the
 *     closer is glued to the next `${`;
 *   - `shell-variable-chain`: `$USER$HOSTNAME`, `A=$A$B`, `df$col$sub`, `$name.$ext`,
 *     `PS1='$USER@$HOST'` — an identifier span whose closer is glued to the next name;
 *   - `php-perl-member`: `$this->$prop`, `$obj->$method`, `$class::$instance`.
 */
function spanClass(content: string, afterName: string): string {
  if (/^\{[A-Za-z_][\w.]*\}$/.test(content) || afterName.startsWith("{")) return "template-literal";
  if (/^[A-Za-z_][A-Za-z0-9_]*(?:->|::)$/.test(content) && /^[A-Za-z0-9_]/.test(afterName)) return "php-perl-member";
  if (/^[A-Za-z_][A-Za-z0-9_]*[.@-]?$/.test(content) && /^[A-Za-z0-9_]/.test(afterName)) return "shell-variable-chain";
  return "other";
}

/** Every `$…$` span the scan finds with this rule: [open, closeExclusive]. */
function spans(m: SourceModule, text: string, rule: Rule, mode: AfterMode = "char"): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  if (!text.includes("$")) return out;
  const code = m.findCodeRanges(text);
  const pairs = m.pairDisplayMath(text);
  let c = 0;
  for (let i = 0; i < text.length; i += 1) {
    while (c < code.length && code[c]!.end <= i) c += 1;
    if (c < code.length && code[c]!.start <= i) {
      i = code[c]!.end - 1;
      continue;
    }
    const ch = text[i];
    if (ch === "\\") {
      i += 1;
      continue;
    }
    if (ch !== "$") continue;
    if (text[i + 1] === "$") {
      const close = pairs.get(i);
      i = close === undefined ? i + 1 : close + 1;
      continue;
    }
    const bound = Math.min(text.length, i + 403);
    let close = -1;
    for (let k = i + 1; k < bound; k += 1) {
      const d = text[k];
      if (d === "\n") break;
      if (d === "\\") {
        k += 1;
        continue;
      }
      if (d === "$") {
        close = k;
        break;
      }
    }
    if (close === -1 || text[close + 1] === "$") continue;
    if (rule(text.slice(i + 1, close), afterOf(text, close, mode))) {
      out.push([i, close + 1]);
      i = close;
    }
  }
  return out;
}

const shape = (s: string) => s.replace(/[A-Za-z]/g, "a").replace(/[0-9]/g, "9").slice(0, 40);

interface Tally {
  rows: number;
  rowsWithDollar: number;
  current: number;
  byCandidate: Record<string, { spans: number; gained: number; lost: number; rowsChanged: number; lostByClass: Record<string, number> }>;
}

async function main(): Promise<number> {
  installBlockingStdio();
  const m: SourceModule = await import("@ai-matrx/content-ir/source");
  const candidate = modulePath
    ? ((await import(pathToFileURL(resolve(modulePath)).href)) as SourceModule)
    : undefined;
  const candidates: Record<string, Rule> = {
    ...(candidate ? { candidate_module: candidate.isSingleDollarMath } : {}), pandoc, pandoc_digit_guard: pandocDigitGuard, pandoc_content: pandocContent, pandoc_content_glue: pandocContentGlue };
  const sampled = process.env.SAMPLE_RULE ?? "pandoc";

  const env = loadDbEnv();
  if ("missing" in env) {
    console.error(`UNMEASURED: no database connection — set ${env.missing.join(", ")}.`);
    return 2;
  }
  console.log(`Database connection from ${env.from}; session READ ONLY.`);
  const cx = await connectDirect(env, "measure-single-dollar-rule");
  await cx.query("set session characteristics as transaction read only");
  await cx.query("set statement_timeout = '120s'");

  const sources: Record<string, { sql: string; assistant: boolean }> = {
    assistant_messages: {
      sql: `select id::text as id, content from chat.message where role = 'assistant' and id > $1::uuid order by id limit 500`,
      assistant: true,
    },
    notes: {
      sql: `select id::text as id, content from workbench.notes where content is not null and id > $1::uuid order by id limit 500`,
      assistant: false,
    },
  };
  const tallies: Record<string, Tally> = {};
  const shapes = new Map<string, number>();
  const samples: string[] = [];
  try {
    for (const [source, plan] of Object.entries(sources)) {
      const tally: Tally = { rows: 0, rowsWithDollar: 0, current: 0, byCandidate: {} };
      for (const name of Object.keys(candidates)) tally.byCandidate[name] = { spans: 0, gained: 0, lost: 0, rowsChanged: 0, lostByClass: {} };
      tallies[source] = tally;
      let after = "00000000-0000-0000-0000-000000000000";
      for (;;) {
        const { rows } = await cx.query<{ id: string; content: unknown }>(plan.sql, [after]);
        if (rows.length === 0) break;
        for (const row of rows) {
          const texts = textsOf(row.content);
          for (const text of texts) {
            tally.rows += 1;
            if (!text.includes("$")) continue;
            tally.rowsWithDollar += 1;
            const now = spans(m, text, m.isSingleDollarMath);
            tally.current += now.length;
            const nowKeys = new Set(now.map(([a, b]) => `${a}:${b}`));
            for (const [name, rule] of Object.entries(candidates)) {
              const next = spans(m, text, rule, name === "candidate_module" ? "name" : "char");
              const nextKeys = new Set(next.map(([a, b]) => `${a}:${b}`));
              const t = tally.byCandidate[name]!;
              t.spans += next.length;
              let changed = false;
              for (const [a, b] of next) {
                if (nowKeys.has(`${a}:${b}`)) continue;
                t.gained += 1;
                changed = true;
                if (name === sampled) record(source, plan.assistant, row.id, text, a, b, "gained");
              }
              for (const [a, b] of now) {
                if (nextKeys.has(`${a}:${b}`)) continue;
                t.lost += 1;
                const cls = spanClass(text.slice(a + 1, b - 1), afterOf(text, b - 1, "name") ?? "");
                t.lostByClass[cls] = (t.lostByClass[cls] ?? 0) + 1;
                changed = true;
                if (name === sampled) record(source, plan.assistant, row.id, text, a, b, "lost");
              }
              if (changed) t.rowsChanged += 1;
            }
          }
        }
        after = rows[rows.length - 1]!.id;
        if (rows.length < 500) break;
      }
      console.log(`${source}: rows ${tally.rows}, rows with $ ${tally.rowsWithDollar}, current math spans ${tally.current}`);
      for (const [name, t] of Object.entries(tally.byCandidate)) {
        const classes = Object.entries(t.lostByClass).map(([k, v]) => `${k} ${v}`).join(", ");
        console.log(`  ${name.padEnd(20)} spans ${t.spans}  gained ${t.gained}  lost ${t.lost}${classes ? ` (${classes})` : ""}  rows changed ${t.rowsChanged}`);
      }
    }
  } finally {
    await cx.end();
  }

  function record(source: string, assistant: boolean, id: string, text: string, a: number, b: number, change: string) {
    const content = text.slice(a + 1, b - 1);
    // Notes (a person's words) are shown only as shapes, with a shaped neighbourhood.
    const key = assistant
      ? `${source} ${change} ${shape(content)}`
      : `${source} ${change} ${shape(text.slice(Math.max(0, a - 12), a))}⟦${shape(content)}⟧${shape(text.slice(b, b + 12))}`;
    shapes.set(key, (shapes.get(key) ?? 0) + 1);
    if (!assistant || !samplesOut) return;
    // Model output only: the span, a little context either side, and the verdict-relevant
    // neighbours — enough for a reviewer to say "currency" or "math".
    samples.push(
      JSON.stringify({
        id,
        change,
        before: text.slice(Math.max(0, a - 30), a),
        span: text.slice(a, b),
        after: text.slice(b, b + 30),
      }),
    );
  }

  console.log("\nFlipped span shapes (pandoc vs current; letters → a, digits → 9), top 60:");
  for (const [key, count] of [...shapes].sort((x, y) => y[1] - x[1]).slice(0, 60)) console.log(`  ${String(count).padStart(5)}  ${key}`);
  if (samplesOut) {
    writeFileSync(samplesOut, samples.join("\n") + "\n");
    console.log(`\n${samples.length} assistant-message samples written to ${samplesOut}`);
  }
  return 0;
}

function textsOf(content: unknown): string[] {
  if (typeof content === "string") return [content];
  if (!Array.isArray(content)) return [];
  const out: string[] = [];
  for (const part of content) {
    if (part && typeof part === "object" && (part as { type?: unknown }).type === "text") {
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string") out.push(text);
    }
  }
  return out;
}

main().then(exitAfterDrain, (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  exitAfterDrain(1);
});
