#!/usr/bin/env tsx
/**
 * check:access-errors — every surface that still tells a user the wrong thing
 * when a read fails.
 *
 * Under RLS, a zero-row read means one of four different things (denied,
 * deleted, never existed, signed-out). A surface that picks one and asserts it
 * is wrong most of the time — that is the class `features/access-gate/` exists
 * to kill, and this script is the worklist for finishing the job.
 *
 * It finds three offenders:
 *
 *   raw-supabase-message  `throw new Error(error.message)` — PostgREST prose,
 *                         RLS codes, and schema names handed to a human.
 *   claims-deleted        A hand-written sentence asserting deletion or absence
 *                         that the code cannot actually know.
 *   claims-denied         A hand-written permission sentence where the platform
 *                         could say who owns it and offer a request.
 *
 * LOUD, NEVER BLOCKING — per house rule, a guard screams and does not stop a
 * build. `--write` refreshes the committed snapshot; `--strict` exits non-zero
 * for anyone who deliberately wants a gate.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const REPORT = join(ROOT, "scripts/access-errors/report.json");

type Kind = "raw-supabase-message" | "claims-deleted" | "claims-denied";

interface Finding {
  file: string;
  line: number;
  kind: Kind;
  snippet: string;
}

/** Directories whose copy a user never reads. */
const SKIP =
  /(^|\/)(node_modules|\.next|\.next-|dist|build|coverage|scripts|migrations|__tests__|__mocks__)(\/|$)/;

const RULES: Array<{ kind: Kind; re: RegExp }> = [
  // `throw new Error(<something>.message)` — the raw PostgREST string.
  {
    kind: "raw-supabase-message",
    re: /throw new Error\(\s*[A-Za-z_$][\w$]*(\?)?\.message/,
  },
  // A sentence asserting the record is gone.
  //
  // `doesn&apos;t exist` / `doesn’t exist` count: JSX escapes the apostrophe,
  // and a plain `'?` missed every escaped copy — including the research-topic
  // 404 that said "doesn't exist or may have been deleted", which sat
  // invisible to this report until 2026-08-11.
  {
    kind: "claims-deleted",
    re: /["'`][^"'`]*\b(was deleted|no longer accessible|has been deleted|doesn(&apos;|&#39;|['’])?t exist|does not exist|not found)\b[^"'`]*["'`]/i,
  },
  // A sentence asserting a permission outcome.
  {
    kind: "claims-denied",
    re: /["'`][^"'`]*\b(don'?t have (access|permission)|do not have (access|permission)|permission denied|access denied|not authorized|unauthorized)\b[^"'`]*["'`]/i,
  },
];

/**
 * Copy that is FINE. The access gate itself obviously names these states, and a
 * few surfaces legitimately describe a permission rather than report one.
 */
const ALLOW = [
  /^features\/access-gate\//,
  /^lib\/records\/recordUnavailable\.ts$/,
  /^lib\/coming-soon\//,
  // API routes answer MACHINES. A JSON 404 with "not found" is the correct
  // response there, not a lie told to a person — flagging ~250 of them would
  // only teach the next agent to ignore this report. This sweep is strictly
  // about copy a HUMAN reads on a page.
  /^app\/api\//,
  // Same rule, same reason, one directory up: EVERY Route Handler answers a
  // machine. `app/(core)/podcast/[slug]/feed.xml/route.ts` returning the body
  // "Podcast not found" with a 404 is what a podcast client expects to read —
  // it renders on nobody's screen. Route Handlers live outside `app/api/`
  // whenever the URL has to sit beside the page it belongs to, and the
  // original `^app/api/` rule missed exactly those.
  /(^|\/)route\.(ts|tsx|js|jsx)$/,
  /(^|\/)route\.dev\.(ts|tsx|js|jsx)$/,
  // Browser-local stores. IndexedDB has no RLS, no owner and no organization,
  // so "record not found" there is a FACT the code verified — not a guess
  // about someone else's permissions.
  /^lib\/idb\//,
  // The integrity and diagnostic catalogs DESCRIBE broken rows to an operator.
  // Those strings are findings in a report, not copy shown to a person who hit
  // a wall.
  /^lib\/integrity\//,
  /^lib\/diagnostics\//,
];

/**
 * BARE JSX TEXT — the blind spot that hid the research-topic 404 for months.
 *
 * `<p>This doesn&apos;t exist…</p>` contains no quote characters, so the quoted
 * rules above can never see it. These two shapes catch it: phrase text sitting
 * between tags on one line, and a bare text line (JSX children on their own
 * line, no code punctuation). They run ONLY on lines with no quote character —
 * a quoted line is the other rule set's turf — so the two sets never
 * double-report one line.
 */
const DELETED_PHRASE =
  /\b(was deleted|no longer accessible|has been deleted|no longer exists?|doesn(&apos;|&#39;|['’])?t exist|does not exist|not found)\b/i;
const DENIED_PHRASE =
  /\b(don(&apos;|&#39;|['’])?t have (access|permission)|do not have (access|permission)|permission denied|access denied|not authorized|unauthorized|isn(&apos;|&#39;|['’])?t yours)\b/i;
const JSX_BARE_TEXT = /^[A-Za-z][^;{}=()<>"'`]*$/;

function jsxTextKind(trimmed: string): Kind | null {
  if (/["'`]/.test(trimmed)) return null;
  const isText =
    JSX_BARE_TEXT.test(trimmed) || />[^<>{}]*\w[^<>{}]*</.test(trimmed);
  if (!isText) return null;
  if (DENIED_PHRASE.test(trimmed)) return "claims-denied";
  if (DELETED_PHRASE.test(trimmed)) return "claims-deleted";
  return null;
}

/**
 * A line that COMPARES against an error string is not a line that SHOWS one.
 * `m.includes("unauthorized")` is error HANDLING — frequently the good kind —
 * and flagging it teaches the next reader to ignore this report, which is the
 * one outcome that would make the whole sweep worthless.
 */
const MATCHING =
  /\.(includes|match|test|startsWith|endsWith|indexOf|search)\s*\(|[=!]==\s*["'`]|case\s+["'`]/;

/**
 * The escape hatch, and the ONLY one: `// access-errors: ok — <reason>` on the
 * line itself or the line above it.
 *
 * These regexes cannot tell "this record was deleted" (a guess about someone
 * else's permissions) from "this page does not exist on the website yet" (a
 * fact the content plan verified) or "Keyword NOT found in the title" (a
 * finding about a crawled page, not about a read). Marketing alone carries ten
 * of those. Without a way to mark them the count can never reach zero, and a
 * report that can never reach zero is one the next agent learns to skip — the
 * single outcome that would make this whole sweep worthless.
 *
 * The reason is REQUIRED and is printed in the summary, so a suppression is a
 * sentence someone has to defend, not a silent `--fix`.
 */
const PRAGMA = /\/\/\s*access-errors:\s*ok\s*[—-]\s*\S/;

function listFiles(): string[] {
  const out = execSync(
    "git ls-files 'app/**/*.ts' 'app/**/*.tsx' 'features/**/*.ts' 'features/**/*.tsx' " +
      "'components/**/*.ts' 'components/**/*.tsx' 'lib/**/*.ts' 'lib/**/*.tsx' 'hooks/**/*.ts'",
    { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return out
    .split("\n")
    .filter(Boolean)
    .filter((f) => !SKIP.test(f))
    .filter((f) => !ALLOW.some((re) => re.test(f)));
}

let suppressed = 0;

function scan(): Finding[] {
  const findings: Finding[] = [];
  suppressed = 0;
  for (const file of listFiles()) {
    const abs = join(ROOT, file);
    if (!existsSync(abs)) continue;
    const lines = readFileSync(abs, "utf8").split("\n");
    lines.forEach((text, i) => {
      // A comment explaining the class is not an instance of it — including
      // a JSX comment, which opens `{/*` and so slipped past the first two
      // tests for years (NodePanel's note about the unbuilt-page state was
      // reported as copy no human reads). A bare `/*` opener (a comment as a
      // JSX expression after `(`/`?`) is the same case in a fourth spelling.
      const trimmed = text.trim();
      if (
        trimmed.startsWith("*") ||
        trimmed.startsWith("//") ||
        trimmed.startsWith("{/*") ||
        trimmed.startsWith("/*")
      )
        return;
      if (MATCHING.test(text)) return;
      if (PRAGMA.test(text) || PRAGMA.test(lines[i - 1] ?? "")) {
        if (
          RULES.some((rule) => rule.re.test(text)) ||
          (file.endsWith(".tsx") && jsxTextKind(trimmed) !== null)
        )
          suppressed += 1;
        return;
      }
      let matched = false;
      for (const rule of RULES) {
        if (rule.re.test(text)) {
          findings.push({
            file,
            line: i + 1,
            kind: rule.kind,
            snippet: trimmed.slice(0, 160),
          });
          matched = true;
          break;
        }
      }
      if (!matched && file.endsWith(".tsx")) {
        const kind = jsxTextKind(trimmed);
        if (kind) {
          findings.push({ file, line: i + 1, kind, snippet: trimmed.slice(0, 160) });
        }
      }
    });
  }
  return findings;
}

/**
 * PASS 2 — SWALLOWED ERRORS. A converted throw means nothing if no render site
 * reads it. Proven 2026-08-12: `getBrand` threw the canonical
 * `RecordUnavailableError`, but the consumer did `brand.data ?? null` and never
 * read `brand.error` — the copy sweep counted marketing as ZERO while a denied
 * brand rendered nothing at all. This pass makes that class visible:
 *
 *   1. A module that calls `recordUnavailable(` exports THROWERS.
 *   2. A hook whose `useQuery` body calls a thrower is a GATED HOOK.
 *   3. A component that binds a gated hook (or such a `useQuery` directly) and
 *      never reads `.error` / `.isError` / `.status` on the binding — and never
 *      passes the whole query onward — is SWALLOWING the truth.
 *
 * Heuristic, in-file only, and advisory like everything here. The same pragma
 * (`// access-errors: ok — <reason>`) on the binding line clears a site that
 * genuinely should stay silent (a count badge, an optional decoration).
 */
interface SwallowFinding {
  file: string;
  line: number;
  hook: string;
  binding: string;
}

function scanSwallowed(): SwallowFinding[] {
  const sources = new Map<string, string>();
  for (const file of listFiles()) {
    const abs = join(ROOT, file);
    if (existsSync(abs)) sources.set(file, readFileSync(abs, "utf8"));
  }

  const exportRe =
    /export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|export\s+const\s+([A-Za-z_$][\w$]*)\s*=/g;
  const throwers = new Set<string>();
  for (const src of sources.values()) {
    if (!src.includes("recordUnavailable(")) continue;
    for (const m of src.matchAll(exportRe)) throwers.add(m[1] ?? m[2]);
  }
  ["recordUnavailable", "recordUnavailableMessage", "isRecordUnavailableError"].forEach(
    (n) => throwers.delete(n),
  );

  const hookDef =
    /(?:export\s+)?function\s+(use[A-Z]\w*)|(?:export\s+)?const\s+(use[A-Z]\w*)\s*=/;
  const callsThrower = (chunk: string) =>
    [...throwers].some((t) => new RegExp(`\\b${t}\\s*\\(`).test(chunk));

  /** hook name -> defining file */
  const gated = new Map<string, string>();
  for (const [file, src] of sources) {
    if (!src.includes("useQuery")) continue;
    const lines = src.split("\n");
    let current: string | null = null;
    lines.forEach((l, i) => {
      const m = hookDef.exec(l);
      if (m) current = m[1] ?? m[2];
      if (/useQuery[<(]/.test(l) && current) {
        if (callsThrower(lines.slice(i, i + 30).join("\n"))) {
          gated.set(current, file);
        }
      }
    });
  }

  const findings: SwallowFinding[] = [];
  const bindingReads = (src: string, binding: string) =>
    new RegExp(`${binding}\\.(error|isError|status)\\b`).test(src) ||
    new RegExp(`\\.\\.\\.${binding}\\b`).test(src) ||
    new RegExp(`\\breturn\\s+${binding}\\b`).test(src);

  for (const [file, src] of sources) {
    const lines = src.split("\n");
    for (const [hook, defFile] of gated) {
      if (file === defFile || !src.includes(hook)) continue;
      lines.forEach((l, i) => {
        if (PRAGMA.test(l) || PRAGMA.test(lines[i - 1] ?? "")) return;
        const m = new RegExp(
          `const\\s+(\\{[^}]*\\}|[A-Za-z_$][\\w$]*)\\s*=\\s*${hook}[<(]`,
        ).exec(l);
        if (!m) return;
        const binding = m[1];
        if (binding.startsWith("{")) {
          if (/\b(error|isError|status)\b/.test(binding)) return;
          findings.push({ file, line: i + 1, hook, binding: binding.slice(0, 60) });
        } else if (!bindingReads(src, binding)) {
          findings.push({ file, line: i + 1, hook, binding });
        }
      });
    }
  }
  return findings;
}

/** Group by the feature that owns the file, so the sweep can go out in waves. */
function featureOf(file: string): string {
  const parts = file.split("/");
  if (parts[0] === "features") return `features/${parts[1]}`;
  if (parts[0] === "app") return `app/${parts[1] ?? ""}`;
  return parts[0];
}

function main() {
  const write = process.argv.includes("--write");
  const strict = process.argv.includes("--strict");
  const findings = scan();
  const swallowed = scanSwallowed();

  const byFeature = new Map<string, Finding[]>();
  for (const f of findings) {
    const key = featureOf(f.file);
    byFeature.set(key, [...(byFeature.get(key) ?? []), f]);
  }
  const ranked = [...byFeature.entries()].sort(
    (a, b) => b[1].length - a[1].length,
  );

  const byKind = (k: Kind) => findings.filter((f) => f.kind === k).length;

  console.log("");
  console.log(
    findings.length === 0
      ? "[32m[OK][0m Access errors: every failed read explains itself."
      : `[33m[LOUD][0m Access errors: ${findings.length} surfaces still guess why a read failed. (non-blocking)`,
  );
  console.log(
    `       raw supabase message: ${byKind("raw-supabase-message")}  ` +
      `claims deleted: ${byKind("claims-deleted")}  ` +
      `claims denied: ${byKind("claims-denied")}` +
      (suppressed > 0
        ? `  ·  ${suppressed} marked \`access-errors: ok\` with a stated reason`
        : ""),
  );
  console.log("");
  console.log("  Worst features first:");
  for (const [feature, list] of ranked.slice(0, 20)) {
    console.log(`    ${String(list.length).padStart(4)}  ${feature}`);
  }
  console.log("");
  console.log(
    "  Fix: replace the hand-written branch with <AccessGate token id error onRetry/>",
  );
  console.log("       — features/access-gate/FEATURE.md");
  console.log("");
  if (swallowed.length > 0) {
    console.log(
      `[33m[LOUD][0m Swallowed reads: ${swallowed.length} components bind a ` +
        "recordUnavailable-gated query and never read its error. (non-blocking)",
    );
    const byF = new Map<string, number>();
    for (const s of swallowed)
      byF.set(featureOf(s.file), (byF.get(featureOf(s.file)) ?? 0) + 1);
    for (const [feature, n] of [...byF.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)) {
      console.log(`    ${String(n).padStart(4)}  ${feature}`);
    }
    console.log(
      "  Fix: gate the render on .isError (AccessGate / UnresolvedEntityRef),",
    );
    console.log(
      "       or defend silence with `// access-errors: ok — <reason>` on the binding.",
    );
    console.log("");
  }

  if (write) {
    writeFileSync(
      REPORT,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString().slice(0, 10),
          total: findings.length,
          suppressed,
          byKind: {
            "raw-supabase-message": byKind("raw-supabase-message"),
            "claims-deleted": byKind("claims-deleted"),
            "claims-denied": byKind("claims-denied"),
          },
          byFeature: Object.fromEntries(
            ranked.map(([k, v]) => [k, v.length]),
          ),
          findings,
          swallowed,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(`  Snapshot written: ${relative(ROOT, REPORT)}`);
    console.log("");
  }

  if (strict && findings.length > 0) process.exit(1);
}

main();
