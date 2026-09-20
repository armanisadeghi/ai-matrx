#!/usr/bin/env npx tsx
/**
 * check:unbounded-reads — find list reads that are TREATED AS COMPLETE but are not.
 *
 * PostgREST caps every response at `db-max-rows` (1000 on Matrx Main) and says
 * so only in a `Content-Range` header. A plain `.select()` therefore returns a
 * successful-looking short list, and any code that turns that list into an
 * EXISTENCE / DIFF / COMPLETENESS verdict starts answering confidently wrong
 * the moment its table crosses 1000 rows. FOUND_DEFECTS D190.
 *
 * The fix is `readAllRows` (from `@ai-matrx/data/db`), which pages to a verified total and
 * throws rather than returning a partial list.
 *
 * WHAT THIS FLAGS — two shapes of the same verdict:
 *
 *   1. DIRECT. An unbounded `.from(...).select(...)` / `.rpc(...)` — no
 *      `.limit()`, `.range()`, `.single()`, `.maybeSingle()`, `head: true` —
 *      whose result variable is later consumed by an existence/diff operator
 *      (`new Set(`, `.find(`, `.some(`, `.every(`, `.includes(`, `.has(`,
 *      `.filter(…).length`, `.length ===` / `!==` / `<` / `>`).
 *
 *   2. INDEXED (added 2026-09-20, V-27 NEW-8). The same unbounded read whose
 *      rows are first loaded into a `Map` / `Record` / plain-object INDEX
 *      (`new Map(`, `Object.fromEntries(`, a `reduce` into an object, or a
 *      `for … of rows` loop writing `idx.set(…)` / `idx[key] = …`), and the
 *      index is then used to DECIDE (`.get(…) === undefined`, `.has(`, `key in
 *      idx`, `idx[key] === undefined`, `idx[key] ?? …`).
 *
 *      Shape 2 is why this guard did not name `lib/knobs/featureKnobs.ts`
 *      before `95b3f864`: the knob catalogue read ~870 `platform.feature_knob`
 *      rows with a bare `.select()`, poured them into a `Map`, returned that
 *      map from `loadAll()`, and every `knobInt` / `knobBool` / `knobStringList`
 *      call decided a knob was MISSING — and raised — on `map.get(addr) ===
 *      undefined`. No `.find(`, no `new Set(`, no `.length` comparison
 *      anywhere; the detector saw nothing while the bug shipped. An index is a
 *      lookup table, and a lookup table built from a first page answers
 *      "absent" for rows that exist. Because the index usually OUTLIVES the
 *      function that built it, shape 2 also fires when the index is returned or
 *      parked in a module-level variable and the lookup decision is made
 *      elsewhere in the same file.
 *
 *   3. RETURNED (added 2026-09-20, V-28 NEW-7). The read lives in a helper
 *      that hands the rows back (`return data ?? []`), and a CALLER in the same
 *      file asks the shape-1 or shape-2 question of what it received. The
 *      finding is reported at the READ line, because that is the line that has
 *      to change. V-28's verifier planted the original knob bug in exactly this
 *      spelling — `const rows = await loadRows(); const byKey = new
 *      Map(rows.map(…)); byKey.get(k) === undefined` — and this guard said
 *      nothing, while the two in-function variants beside it were flagged. ONE
 *      hop, one file: a helper imported from another module is still invisible.
 *
 * WHAT IT DOES NOT FLAG: a read that only renders. That is not this bug.
 *
 * Loud, ADVISORY, never blocking (exit 0 always, per the repo's scream-never-
 * block rule). A finding is a question — "is this list allowed to be short?" —
 * not an automatic defect.
 *
 * KNOWN LIMITS — a clean run is a floor, NOT a proof. This is a line-window
 * text scan, tuned for precision over recall so the output stays worth reading:
 *   - raw `fetch(.../rest/v1/...)` reads are invisible to it (that is exactly
 *     how the original D190 bug in scripts/check-migrations.ts was written);
 *   - reads destructured out of `Promise.all([...])` are skipped — no single
 *     variable to follow;
 *   - a list read in one function and judged in another is tracked through an
 *     index that escapes its function (shape 2) and across ONE return to a
 *     caller in the SAME file (shape 3) — never across a module boundary, and
 *     never two hops;
 *   - a helper whose return is DERIVED from the rows (`.filter(…)`, `.length`)
 *     is not treated as a read source: what the caller holds is no longer the
 *     list;
 *   - it stops looking `WINDOW` lines after the read, and `WINDOW` lines after
 *     the index is built.
 * When you write an existence check, reach for readAllRows because the rule
 * says so, not because this script noticed.
 *
 *   pnpm check:unbounded-reads
 *   pnpm check:unbounded-reads --json
 *   pnpm check:unbounded-reads --self-test   (proves it can FAIL — red then green)
 *   pnpm check:unbounded-reads --file <path>  (one file, anywhere — replay a pre-fix version)
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { exitAfterDrain } from "./lib/exit-after-drain";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_DIRS = ["scripts", "lib", "features", "app", "utils"];
const SKIP_DIR =
  /(^|\/)(node_modules|\.next[^/]*|dist|build|coverage|__tests__|\.git)(\/|$)/;
const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  white: "\x1b[97m",
};

/** Chain terminators that prove the caller bounded or single-rowed the read. */
const BOUNDED = [
  ".limit(",
  ".range(",
  ".single(",
  ".maybeSingle(",
  "head: true",
  "readAllRows",
  "readAllRowsRest",
];

/** Consumers that turn a list into a verdict about the whole set. */
const EXISTENCE_OPS = [
  "new Set(",
  ".find(",
  ".some(",
  ".every(",
  ".includes(",
  ".has(",
  ".findIndex(",
];
const LENGTH_CMP = /\.length\s*(===|!==|==|!=|<|>|>=|<=)/;
/** `rows.filter(…).length` — a count of the whole set, comparison or not. */
const FILTER_LENGTH = /\.filter\(.*\)\s*\.\s*length/;

/** How far past the read (and past the index build) we look. */
const WINDOW = 60;
/** How far into a `for … of rows` body we look for the index being written. */
const LOOP_BODY = 20;

type Shape = "direct" | "index" | "returned";

interface Finding {
  file: string;
  line: number;
  target: string;
  variable: string;
  consumer: string;
  consumerLine: number;
  shape: Shape;
  /** The Map/Record the rows were poured into, for shape `index`. */
  via?: string;
  /**
   * The read carries `.in("col", ids)`. It is still capped at 1000 — an id list
   * longer than that loses rows silently — but the ceiling is the CALLER's list,
   * not the table, so these sort below a read of a whole table.
   */
  filteredByIn?: boolean;
}

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e);
    if (SKIP_DIR.test(p)) continue;
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mts)$/.test(p)) out.push(p);
  }
}

/**
 * The variable a read lands in. Handles the three shapes we actually write:
 *   const rows = await sb...            -> rows
 *   const { data: rows } = await sb...  -> rows
 *   const { data } = await sb...        -> data
 * Returns null for anything else (inline reads, Promise.all destructuring) —
 * we would rather miss a hit than print a guess.
 */
function assignedVariable(stmt: string): string | null {
  const destructured = stmt.match(
    /(?:const|let)\s*\{\s*data\s*:\s*([A-Za-z_$][\w$]*)/,
  );
  if (destructured) return destructured[1] ?? null;
  if (/(?:const|let)\s*\{\s*data\s*[,}]/.test(stmt)) return "data";
  const plain = stmt.match(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/);
  return plain ? (plain[1] ?? null) : null;
}

function word(name: string): RegExp {
  return new RegExp(`\\b${name.replace(/\$/g, "\\$")}\\b`);
}

/** Shape 1: the rows themselves are asked a completeness question. */
function directConsumer(
  lines: string[],
  from: number,
  to: number,
  variable: string,
): { op: string; line: number } | null {
  const use = word(variable);
  for (let j = from; j < to; j++) {
    const l = lines[j] ?? "";
    if (!use.test(l)) continue;
    const op =
      EXISTENCE_OPS.find((o) => l.includes(o)) ??
      (FILTER_LENGTH.test(l)
        ? ".filter(…).length"
        : LENGTH_CMP.test(l)
          ? ".length comparison"
          : null);
    if (!op) continue;
    return { op, line: j };
  }
  return null;
}

/**
 * Shape 2, half one: the rows are poured into a Map / Record / object index.
 * Returns the index's variable name and the line it was built on.
 */
function indexBuiltFrom(
  lines: string[],
  from: number,
  to: number,
  variable: string,
): { name: string; line: number; how: string } | null {
  const use = word(variable);
  const forOf = new RegExp(
    `\\bfor\\s*\\(\\s*(?:const|let|var)\\s[^)]*\\bof\\b[^)]*\\b${variable.replace(/\$/g, "\\$")}\\b`,
  );
  for (let j = from; j < to; j++) {
    const l = lines[j] ?? "";

    // (a) `for (const row of rows)` whose body writes an index.
    if (forOf.test(l)) {
      const stop = Math.min(lines.length, j + 1 + LOOP_BODY);
      for (let k = j + 1; k < stop; k++) {
        const b = lines[k] ?? "";
        const set = b.match(/\b([A-Za-z_$][\w$]*)\s*\.\s*set\(/);
        if (set && set[1] !== variable)
          return { name: set[1] ?? "", line: k, how: "for…of → .set(" };
        const idx = b.match(/\b([A-Za-z_$][\w$]*)\s*\[[^\]]+\]\s*=[^=]/);
        if (idx && idx[1] !== variable)
          return { name: idx[1] ?? "", line: k, how: "for…of → [key] =" };
      }
    }

    // (b) `const m = new Map(...)` / `Object.fromEntries(...)`, with the rows
    //     named on the same line or in the next few (multi-line arguments).
    const ctor = l.match(
      /(?:(?:const|let|var)\s+)?([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*(?:await\s+)?(new Map[<(]|Object\.fromEntries\(|new Map\()/,
    );
    if (ctor && ctor[1] !== variable) {
      const stop = Math.min(lines.length, j + 5);
      for (let k = j; k < stop; k++) {
        if (use.test(lines[k] ?? "")) {
          return {
            name: ctor[1] ?? "",
            line: j,
            how: (ctor[2] ?? "").startsWith("new Map")
              ? "new Map("
              : "Object.fromEntries(",
          };
        }
      }
    }

    // (c) `const idx = rows.reduce((acc, r) => …, {})` — reduce INTO an object.
    const red = l.match(
      /(?:(?:const|let|var)\s+)?([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*[\s\S]*\breduce\(/,
    );
    if (red && red[1] !== variable && use.test(l)) {
      const stop = Math.min(lines.length, j + 8);
      let objectAccumulator = false;
      for (let k = j; k < stop; k++) {
        const b = lines[k] ?? "";
        if (
          /\{\s*\}\s*[),]/.test(b) ||
          /\bacc\s*\[/.test(b) ||
          /\.\.\.acc\b/.test(b) ||
          /\bnew Map[<(]/.test(b) ||
          /\bacc\s*\.\s*set\(/.test(b)
        ) {
          objectAccumulator = true;
          break;
        }
      }
      if (objectAccumulator)
        return { name: red[1] ?? "", line: j, how: "reduce(… , {})" };
    }
  }
  return null;
}

/** An index that is returned or parked in an outer variable outlives its scope. */
function indexEscapes(lines: string[], at: number, name: string): boolean {
  const n = name.replace(/\$/g, "\\$");
  const ret = new RegExp(`\\breturn\\s+${n}\\b`);
  const park = new RegExp(
    `^\\s*(?:[A-Za-z_$][\\w$]*\\s*=\\s*${n}\\s*;|resolve\\(\\s*${n}\\s*\\))`,
  );
  const stop = Math.min(lines.length, at + 1 + WINDOW);
  for (let j = at; j < stop; j++) {
    const l = lines[j] ?? "";
    if (ret.test(l) || park.test(l)) return true;
  }
  return false;
}

/**
 * Shape 2, half two: somebody asks the index whether a key EXISTS. `name` is
 * the index when we can still follow it; when the index escaped its function,
 * `name` is null and any lookup-decision in the file answers the question
 * (that is the knob reader: the Map is built in `loadAll`, returned, cached,
 * and interrogated in `readKnob`).
 */
function lookupDecision(
  lines: string[],
  from: number,
  to: number,
  name: string | null,
): { op: string; line: number } | null {
  const use = name ? word(name) : null;
  for (let j = from; j < to; j++) {
    const l = lines[j] ?? "";
    if (use && !use.test(l)) continue;
    if (/\.\s*has\(/.test(l)) return { op: ".has(", line: j };
    if (/\[[^\]]+\]\s*(===|!==)\s*undefined/.test(l))
      return { op: "[key] === undefined", line: j };
    // `??` DECIDES; `??=` BUILDS. `(byKind[row.kind] ??= []).push(…)` is the
    // index being filled, not the index being asked, and counting it made the
    // browse services the loudest false positives in the sweep.
    if (/\[[^\]]+\]\s*\?\?(?!=)/.test(l))
      return { op: "[key] ?? fallback", line: j };
    if (name && new RegExp(`\\bin\\s+${name.replace(/\$/g, "\\$")}\\b`).test(l))
      return { op: "`in` operator", line: j };
    if (!name && /\bif\s*\(\s*!?\s*[^()]*\s+in\s+[A-Za-z_$]/.test(l))
      return { op: "`in` operator", line: j };
    if (/\.\s*get\(/.test(l)) {
      const stop = Math.min(lines.length, j + 4);
      for (let k = j; k < stop; k++) {
        const b = lines[k] ?? "";
        if (
          /(===|!==)\s*(undefined|null)/.test(b) ||
          /\?\?/.test(b) ||
          /^\s*if\s*\(\s*!/.test(b)
        )
          return { op: ".get(…) → undefined check", line: k };
      }
    }
  }
  return null;
}

/**
 * Shape 2, assembled: the rows become a lookup table and the table DECIDES.
 * Returns the decision when both halves are present in this function's window
 * (or anywhere in the file, when the index escapes its scope).
 */
function indexConsumer(
  lines: string[],
  from: number,
  to: number,
  variable: string,
): { op: string; line: number; via: string; how: string } | null {
  const index = indexBuiltFrom(lines, from, to, variable);
  if (!index || !index.name) return null;
  const near = lookupDecision(
    lines,
    index.line + 1,
    Math.min(lines.length, index.line + 1 + WINDOW),
    index.name,
  );
  const far =
    near ??
    (indexEscapes(lines, index.line, index.name)
      ? (lookupDecision(lines, index.line + 1, lines.length, null) ??
        lookupDecision(lines, 0, index.line, null))
      : null);
  if (!far) return null;
  return { op: far.op, line: far.line, via: index.name, how: index.how };
}

/** The declaration line this read sits inside, by name. */
const FUNCTION_HEAD =
  /(?:^|\s)(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*[(<]|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*(?:async\s*)?(?:function\b|[(<])/;

function enclosingFunction(
  lines: string[],
  readLine: number,
): { name: string; line: number } | null {
  for (let j = readLine; j >= 0; j--) {
    const m = FUNCTION_HEAD.exec(lines[j] ?? "");
    const name = m?.[1] ?? m?.[2];
    if (name) return { name, line: j };
  }
  return null;
}

/**
 * The first line that hands `variable` itself back — `return rows;`,
 * `return data ?? [];`, `return (data ?? []) as Row[];`. A return of something
 * DERIVED from the rows (`return rows.length`, `return (data ?? []).length`,
 * `return rows.map(…)`) is not a read source: what the caller receives is no
 * longer the list, so indexing it decides nothing about the table.
 */
function returnsVariable(
  lines: string[],
  from: number,
  to: number,
  variable: string,
): number | null {
  const v = variable.replace(/\$/g, "\\$");
  const re = new RegExp(
    `^\\s*return\\s*\\(*\\s*(?:await\\s+)?${v}\\s*(?:\\)|;|$|\\?\\?|\\|\\||\\bas\\b)`,
  );
  const derived = new RegExp(`(?:\\)\\s*\\.|\\b${v}\\s*\\.)`);
  for (let j = from; j < to; j++) {
    const l = lines[j] ?? "";
    if (re.test(l) && !derived.test(l)) return j;
  }
  return null;
}

/**
 * Shape 3 (added 2026-09-20, V-28 NEW-7). ONE HOP ACROSS A RETURN.
 *
 * Shapes 1 and 2 both need the read and the verdict inside one function. The
 * original knob bug's most natural spelling is neither:
 *
 *     async function loadRows() {            // ← the bare complete-list read
 *       const { data } = await sb.from("feature_knob").select("feature, key");
 *       return data ?? [];
 *     }
 *     const rows = await loadRows();         // ← the caller
 *     const byKey = new Map(rows.map((r) => [addr(r), r]));
 *     if (byKey.get(wanted) === undefined) throw new Error("missing knob");
 *
 * V-28's hostile verifier planted exactly that (`missC`) and this guard said
 * nothing, while the two in-function variants beside it were flagged. A
 * service/hook split is the normal way this code is written, so the miss was
 * the common case, not the corner.
 *
 * So: a function whose body performs a bare complete-list read and RETURNS
 * those rows is a READ SOURCE. Every call of it in the same file is then asked
 * the shape-1 and shape-2 questions of its own result variable, and a verdict
 * there is reported AT THE READ LINE — the line that has to change.
 *
 * ONE hop, one file, deliberately: a second hop, or a source imported from
 * another module, is out of reach of a line-window text scan and stays in the
 * KNOWN LIMITS above. The helper must actually hand the rows back, so a
 * function that reads and only renders is still quiet.
 */
function returnedRowsConsumer(
  lines: string[],
  readLine: number,
  stmtEnd: number,
  variable: string,
): { fn: string; consumer: string; line: number; via?: string } | null {
  const fn = enclosingFunction(lines, readLine);
  if (!fn) return null;
  // Never read past the END of the function the read sits in: the next helper
  // down the file almost always has a `return data ?? []` of its OWN, and
  // borrowing it turns every read in a service module into a read source.
  let bodyEnd = Math.min(lines.length, stmtEnd + 1 + WINDOW);
  for (let j = stmtEnd + 1; j < bodyEnd; j++) {
    const l = lines[j] ?? "";
    if (/^[})\]];?\s*$/.test(l) || FUNCTION_HEAD.test(l)) {
      bodyEnd = j + 1; // the closing brace line itself may carry `return x; }`
      break;
    }
  }
  const returnAt = returnsVariable(lines, stmtEnd + 1, bodyEnd, variable);
  if (returnAt === null) return null;

  const call = new RegExp(
    `(?:const|let|var)\\s*(?:\\{[^}]*\\}|[A-Za-z_$][\\w$]*)\\s*(?::[^=]*)?=\\s*(?:await\\s+)?${fn.name.replace(/\$/g, "\\$")}\\s*\\(`,
  );
  for (let j = 0; j < lines.length; j++) {
    // Never the body we just came out of — a recursive call is not a consumer.
    if (j >= fn.line && j <= returnAt) continue;
    const l = lines[j] ?? "";
    if (!call.test(l)) continue;

    let end = j;
    while (end < lines.length && !(lines[end] ?? "").includes(";")) end++;
    const stmt = lines.slice(j, Math.min(end + 1, lines.length)).join("\n");
    const held = assignedVariable(stmt);
    if (!held) continue;

    const from = end + 1;
    const to = Math.min(lines.length, end + 1 + WINDOW);
    const direct = directConsumer(lines, from, to, held);
    if (direct)
      return { fn: fn.name, consumer: `${held} ${direct.op}`, line: direct.line };
    const index = indexConsumer(lines, from, to, held);
    if (index)
      return {
        fn: fn.name,
        consumer: `${index.how} → ${index.via} ${index.op}`,
        line: index.line,
        via: index.via,
      };
  }
  return null;
}

export function scanSource(src: string, rel: string): Finding[] {
  if (!src.includes(".from(") && !src.includes(".rpc(")) return [];
  const lines = src.split("\n");
  const findings: Finding[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const m =
      line.match(/\.from\(\s*["'`]([^"'`]+)["'`]/) ??
      line.match(/\.rpc\(\s*["'`]([^"'`]+)["'`]/);
    if (!m) continue;

    // Collect the statement: from the line that opens the assignment through
    // the first line ending the chain (`;`).
    // Walk BACK over a fluent chain to the line that opens the assignment.
    // `const { data } = await sb` / `.schema(…)` / `.from(…)` / `.select(…)` is
    // the shape the knob reader was written in, and the old walk stopped at the
    // `.from(` line — so `assignedVariable` saw no `const` and the read was
    // dropped before any consumer was even considered.
    let start = i;
    while (start > 0) {
      const cur = (lines[start] ?? "").trim();
      const prev = (lines[start - 1] ?? "").trim();
      if (!cur.startsWith(".") && !/(?:=|await)$/.test(prev)) break;
      if (/[;{}]$/.test(prev)) break;
      start -= 1;
    }
    let end = i;
    while (end < lines.length && !(lines[end] ?? "").includes(";")) end++;
    const stmt = lines.slice(start, Math.min(end + 1, lines.length)).join("\n");

    if (!stmt.includes(".select(") && !stmt.includes(".rpc(")) continue;
    if (BOUNDED.some((b) => stmt.includes(b))) continue;

    const variable = assignedVariable(stmt);
    if (!variable) continue;
    const filteredByIn = /\.in\(/.test(stmt);

    const from = end + 1;
    const to = Math.min(lines.length, end + 1 + WINDOW);

    // Shape 1 — the rows are asked directly.
    const direct = directConsumer(lines, from, to, variable);
    if (direct) {
      findings.push({
        file: rel,
        line: i + 1,
        target: m[1] ?? "?",
        variable,
        consumer: direct.op,
        consumerLine: direct.line + 1,
        shape: "direct",
        ...(filteredByIn ? { filteredByIn: true } : {}),
      });
      continue;
    }

    // Shape 2 — the rows become a lookup table, and the table decides.
    const index = indexConsumer(lines, from, to, variable);
    if (index) {
      findings.push({
        file: rel,
        line: i + 1,
        target: m[1] ?? "?",
        variable,
        consumer: `${index.how} → ${index.via} ${index.op}`,
        consumerLine: index.line + 1,
        shape: "index",
        via: index.via,
        ...(filteredByIn ? { filteredByIn: true } : {}),
      });
      continue;
    }

    // Shape 3 — the read is in a helper that RETURNS the rows, and a CALLER in
    // this file asks the completeness question of what it got back.
    const hop = returnedRowsConsumer(lines, i, end, variable);
    if (!hop) continue;
    findings.push({
      file: rel,
      line: i + 1,
      target: m[1] ?? "?",
      variable,
      consumer: `returned from ${hop.fn}() → ${hop.consumer}`,
      consumerLine: hop.line + 1,
      shape: "returned",
      ...(hop.via ? { via: hop.via } : {}),
      ...(filteredByIn ? { filteredByIn: true } : {}),
    });
  }
  return findings;
}

/** The guard's own fixtures are deliberate defects, not findings. */
const SELF = "scripts/check-unbounded-reads.ts";

function scanFile(abs: string): Finding[] {
  const rel = relative(ROOT, abs);
  if (rel === SELF) return [];
  return scanSource(readFileSync(abs, "utf8"), rel);
}

/**
 * Prove the guard can FAIL, then that it passes on the fix — on the real bug.
 *
 * Fixture A is `lib/knobs/featureKnobs.ts` as it stood before `95b3f864`
 * (the loader and the reader, verbatim in shape): a bare `.select()` poured
 * into a `Map`, returned, and interrogated with `=== undefined`. Fixture B is
 * the same module after the fix. A is flagged; B is clean.
 */
const FIXTURE_PRE_FIX = `
import { createClient } from "@/utils/supabase/client";

let cache: Map<string, KnobValue> | null = null;

function addr(feature: string, key: string): string {
  return \`\${feature} \${key}\`;
}

async function loadAll(): Promise<Map<string, KnobValue>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("platform")
    .from("feature_knob")
    .select("feature, key, value");
  if (error) throw new Error(\`feature_knob read failed: \${error.message}\`);
  const next = new Map<string, KnobValue>();
  for (const row of data ?? []) {
    next.set(addr(row.feature, row.key), row.value);
  }
  return next;
}

async function readKnob(feature: string, key: string): Promise<KnobValue> {
  const all = await ensureLoaded();
  const hit = all.get(addr(feature, key));
  if (hit === undefined) {
    throw new Error(\`Missing feature knob "\${feature}.\${key}".\`);
  }
  return hit;
}
`;

const FIXTURE_POST_FIX = `
import { readAllRows } from "@ai-matrx/data/db";
import { createClient } from "@/utils/supabase/client";

async function loadAll(): Promise<Map<string, KnobValue>> {
  const supabase = createClient();
  const rows = await readAllRows<KnobRow>(
    ({ from, to }) =>
      supabase
        .schema("platform")
        .from("feature_knob")
        .select("feature, key, value", { count: "exact" })
        .order("feature")
        .order("key")
        .range(from, to),
    { label: "platform.feature_knob" },
  );
  const next = new Map<string, KnobValue>();
  for (const row of rows) {
    next.set(addr(row.feature, row.key), row.value);
  }
  return next;
}

async function readKnob(feature: string, key: string): Promise<KnobValue> {
  const all = await ensureLoaded();
  const hit = all.get(addr(feature, key));
  if (hit === undefined) throw new Error("missing");
  return hit;
}
`;

function selfTest(): number {
  const checks: Array<[string, boolean]> = [];
  const shapes = (src: string) => scanSource(src, "fixture.ts");

  // 🚨 THE REAL BUG, red then green.
  const pre = shapes(FIXTURE_PRE_FIX);
  checks.push([
    "pre-95b3f864 knob catalogue (bare .select() → Map → .get() === undefined) is FLAGGED",
    pre.length === 1 && pre[0]?.shape === "index" && pre[0]?.via === "next",
  ]);
  checks.push([
    "the same module read through readAllRows is CLEAN",
    shapes(FIXTURE_POST_FIX).length === 0,
  ]);

  // The other index shapes of the same class.
  checks.push([
    "Object.fromEntries index + [key] === undefined is FLAGGED",
    shapes(`
      const { data } = await sb.from("t").select("id, name");
      const byId = Object.fromEntries((data ?? []).map((r) => [r.id, r]));
      if (byId[wanted] === undefined) throw new Error("absent");
    `).length === 1,
  ]);
  checks.push([
    "new Map(rows.map(…)) + .has( is FLAGGED",
    shapes(`
      const rows = await sb.from("t").select("id");
      const index = new Map(rows.map((r) => [r.id, r]));
      const known = index.has(candidate);
    `).length === 1,
  ]);
  checks.push([
    "reduce into an object + [key] ?? fallback is FLAGGED",
    shapes(`
      const { data: rows } = await sb.from("t").select("slug, label");
      const bySlug = rows.reduce((acc, r) => ({ ...acc, [r.slug]: r }), {});
      const label = bySlug[slug] ?? "unknown";
    `).length === 1,
  ]);
  checks.push([
    "for…of writing idx[key] + `in` check is FLAGGED",
    shapes(`
      const { data } = await sb.from("t").select("key, value");
      const map: Record<string, string> = {};
      for (const row of data ?? []) {
        map[row.key] = row.value;
      }
      if (!(wanted in map)) throw new Error("absent");
    `).length === 1,
  ]);
  checks.push([
    ".filter(…).length over a bare read is FLAGGED",
    shapes(`
      const rows = await sb.from("t").select("state");
      const stuck = rows.filter((r) => r.state === "stuck").length;
    `).length === 1,
  ]);

  // And the shapes that must stay quiet.
  // 🚨 ONE HOP ACROSS A RETURN — V-28 NEW-7's `missC`, verbatim in shape. This
  // was the MISS: the read lives in a helper, the caller indexes what it hands
  // back, and the existence question is asked there.
  checks.push([
    "a helper returning rows + caller Map index + .get() === undefined is FLAGGED",
    (() => {
      const hits = shapes(`
        async function loadRows() {
          const { data } = await sb.from("feature_knob").select("feature, key, value");
          return data ?? [];
        }

        async function readKnob(wanted) {
          const rows = await loadRows();
          const byKey = new Map(rows.map((r) => [addr(r), r]));
          const hit = byKey.get(wanted);
          if (hit === undefined) throw new Error("missing knob");
          return hit;
        }
      `);
      return (
        hits.length === 1 &&
        hits[0]?.shape === "returned" &&
        hits[0]?.line === 3 &&
        (hits[0]?.consumer ?? "").includes("loadRows()")
      );
    })(),
  ]);
  checks.push([
    "a helper returning rows + caller .find( is FLAGGED",
    (() => {
      const hits = shapes(`
        const loadAll = async () => {
          const rows = await sb.from("t").select("id, slug");
          return rows;
        };

        async function exists(slug) {
          const all = await loadAll();
          return Boolean(all.find((r) => r.slug === slug));
        }
      `);
      return hits.length === 1 && hits[0]?.shape === "returned";
    })(),
  ]);
  checks.push([
    "a helper returning rows whose caller only RENDERS is CLEAN",
    shapes(`
      async function loadRows() {
        const { data } = await sb.from("t").select("id, name");
        return data ?? [];
      }

      async function Page() {
        const rows = await loadRows();
        const byId = new Map(rows.map((r) => [r.id, r]));
        return [...byId.values()].map((r) => <Row key={r.id} row={r} />);
      }
    `).length === 0,
  ]);
  checks.push([
    "a BOUNDED read returned from a helper is CLEAN",
    shapes(`
      async function loadRows() {
        const { data } = await sb.from("t").select("id, name").limit(50);
        return data ?? [];
      }

      async function check(wanted) {
        const rows = await loadRows();
        const byId = new Map(rows.map((r) => [r.id, r]));
        return byId.get(wanted) !== undefined;
      }
    `).length === 0,
  ]);
  checks.push([
    "a helper that reads and never hands the rows back is CLEAN",
    shapes(`
      async function loadRows() {
        const { data } = await sb.from("t").select("id, name");
        return (data ?? []).length;
      }

      async function check(wanted) {
        const rows = await loadRows();
        const byId = new Map(rows.map((r) => [r.id, r]));
        return byId.get(wanted) !== undefined;
      }
    `).length === 0,
  ]);

  checks.push([
    "a bounded read feeding an index is CLEAN",
    shapes(`
      const { data } = await sb.from("t").select("id, name").limit(50);
      const byId = new Map((data ?? []).map((r) => [r.id, r]));
      if (byId.has(wanted)) return byId.get(wanted);
    `).length === 0,
  ]);
  checks.push([
    "an index built only to RENDER is CLEAN",
    shapes(`
      const { data } = await sb.from("t").select("id, name");
      const byId = new Map((data ?? []).map((r) => [r.id, r]));
      return [...byId.values()].map((r) => <Row key={r.id} row={r} />);
    `).length === 0,
  ]);
  checks.push([
    "the direct shape this guard already caught still fires",
    shapes(`
      const { data: rows } = await sb.from("t").select("id");
      const known = new Set(rows.map((r) => r.id));
    `).length === 1,
  ]);

  let ok = true;
  for (const [label, pass] of checks) {
    if (!pass) ok = false;
    console.log(`[self-test] ${pass ? "PASS" : "FAIL"}  ${label}`);
  }
  console.log(
    ok
      ? `[self-test] PASS — the rule fails on the real pre-fix knob reader, on every index shape of the class and on the same bug split across a helper's return, and passes on the fix.`
      : `[self-test] FAIL — the rule no longer separates the bug from the fix.`,
  );
  return ok ? 0 : 1;
}

function main(): number {
  if (process.argv.includes("--self-test")) return selfTest();

  // `--file <path>` scans ONE file, anywhere on disk, and prints its findings as
  // JSON. It is how you replay a file as it stood before a fix (`git show
  // <sha>^:<path> > /tmp/pre.ts`) and watch this guard name it.
  const fileFlag = process.argv.indexOf("--file");
  if (fileFlag !== -1) {
    const target = process.argv[fileFlag + 1];
    if (!target) {
      console.error("--file needs a path");
      return 1;
    }
    const abs = resolve(ROOT, target);
    console.log(
      JSON.stringify(
        scanSource(readFileSync(abs, "utf8"), relative(ROOT, abs)),
        null,
        2,
      ),
    );
    return 0;
  }

  const files: string[] = [];
  for (const d of SCAN_DIRS) walk(resolve(ROOT, d), files);
  const findings = files.flatMap(scanFile);

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(findings, null, 2));
    return 0;
  }
  if (findings.length === 0) {
    console.log(
      `${C.cyan}[INFO]${C.reset} Unbounded reads: none feeding an existence/diff decision.`,
    );
    return 0;
  }

  const byFile = new Map<string, Finding[]>();
  for (const f of findings)
    byFile.set(f.file, [...(byFile.get(f.file) ?? []), f]);

  console.log();
  const filtered = findings.filter((f) => f.filteredByIn).length;
  console.log(
    `${C.yellow}[WARN]${C.reset} ${C.bold}${findings.length}${C.reset} unbounded read(s) whose result is used as a COMPLETE list ` +
      `${C.dim}(${findings.length - filtered} over a whole table, ${filtered} over an \`.in(…)\` id list; advisory, non-blocking)${C.reset}`,
  );
  console.log(
    `  ${C.dim}PostgREST silently caps a plain .select() at 1000 rows. If the list decides ` +
      `whether something EXISTS — directly, or through a Map/Record index built from it — ` +
      `a short read is a wrong answer, not a short page.${C.reset}`,
  );
  for (const [file, hits] of [...byFile].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    console.log(`\n  ${C.white}${file}${C.reset}`);
    for (const h of hits) {
      console.log(
        `    ${C.dim}:${h.line}${C.reset} ${C.cyan}${h.target}${C.reset} → ` +
          `${C.white}${h.variable}${C.reset} used with ${C.yellow}${h.consumer}${C.reset} ${C.dim}at :${h.consumerLine}${C.reset}` +
          (h.filteredByIn
            ? ` ${C.dim}[.in(…) list — capped only if that list exceeds 1000]${C.reset}`
            : ""),
      );
    }
  }
  console.log(
    `\n  ${C.white}Fix — read it through readAllRows (@ai-matrx/data/db):${C.reset}\n` +
      `    ${C.dim}const rows = await readAllRows(({from,to}) => sb.from("t")` +
      `.select("*", { count: "exact" }).order("id").range(from,to), { label: "t" });${C.reset}\n` +
      `  ${C.dim}Not a defect if a short list is an acceptable answer here (rendering, preview, sampling).${C.reset}`,
  );
  console.log();
  return 0; // ALWAYS advisory — scream, never block.
}

exitAfterDrain(main());
