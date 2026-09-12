#!/usr/bin/env npx tsx
/**
 * check:record-toasts — a toast that NAMES a record must carry that record's
 * identity.
 *
 * THE LAW (`lib/toast.ts`, FIX-R17 / FIX-Q12). Sonner PAUSES every dismiss
 * timer while `document.hidden` is true — an agent browser pane, a background
 * tab and a second window all count as hidden. So a bare
 * `toast.success(`Created "${row.name}"`)` can still be on screen after the SPA
 * has client-side navigated to a different record, after that record was
 * renamed, or after it was deleted. The sentence is then false, and a screen
 * that lies is forbidden outright (law 4).
 *
 * The fix is not "shorter toasts": it is identity. `recordToast.*` from
 * `@/lib/toast` takes the record's `{ type, id, title }` — the same reference
 * shape the context menu uses (`CONTEXT_MENU_ENTITY_KEY`) — and the toast it
 * raises runs on the WALL CLOCK, is dropped when the route leaves that record,
 * and can be withdrawn by `dismissRecordToasts(ref)` the moment the record is
 * deleted or renamed. None of that is possible for a toast that does not know
 * which record it is talking about.
 *
 * WHAT IT FAILS ON
 *   A call `toast.success|error|info|warning(...)` (or any identifier ending in
 *   `toast`/`Toast` other than the helper itself) whose FIRST argument is a
 *   template literal with an interpolation that names a record — an expression
 *   whose final property is one of the record-label words below. Anything in
 *   the baseline is reported but does not fail: this guard's job is to stop the
 *   class GROWING while the existing population is routed surface by surface.
 *
 * WHAT IT DELIBERATELY DOES NOT FAIL ON
 *   • `recordToast.*` — the helper is the destination, not the offence.
 *   • A template that interpolates a count, an id, a status or a duration —
 *     «Deleted 4 rows» names no record and nothing about it can go stale.
 *   • Tests and fixtures, and `lib/toast.ts` itself.
 *   • The baselined population (`scripts/record-toasts.baseline.json`). Shrink
 *     it by routing call sites, then `--update`; it may never grow by hand.
 *
 * WHAT IT CANNOT SEE (never let a green run imply more than it proves)
 *   • A record named through a plain string variable built elsewhere
 *     (`toast.success(msg)`), or through `.description`. Static text is all
 *     this reads.
 *   • Whether a routed call passes the RIGHT record — that a toast about
 *     mandate A carries A's id and not the page's is a reading, not a regex.
 *   • Whether the record-label word actually refers to a record: `${label}` in
 *     «Copied ${label}» is a field name. Those live in the baseline honestly
 *     rather than being silently excluded by a cleverer pattern.
 *
 * Usage:
 *   pnpm check:record-toasts             # report; exit 0
 *   pnpm check:record-toasts:strict      # exit 1 on anything not baselined
 *   pnpm check:record-toasts:update      # re-baseline after routing call sites
 *   pnpm check:record-toasts:self-test   # prove the guard can still fail
 */

import { execFileSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import ts from "typescript";

const REPO_ROOT = resolve(__dirname, "..");
const SCANNED_DIRS = ["features", "lib", "app", "components", "hooks"] as const;
const BASELINE_PATH = join(REPO_ROOT, "scripts/record-toasts.baseline.json");

const TOAST_METHODS = new Set(["success", "error", "info", "warning"]);

/**
 * The final property names that mean "this is a record's human label". Kept
 * deliberately short and literal — a longer list buys a worse false-positive
 * rate, not more safety.
 */
const RECORD_LABEL_WORDS = [
  "name",
  "title",
  "label",
  "key",
  "filename",
  "displayname",
  "listname",
];

export interface Finding {
  file: string;
  line: number;
  method: string;
  snippet: string;
  /** Baseline key: stable across line churn. */
  id: string;
}

function namesARecord(expr: ts.Expression): boolean {
  const text = expr.getText();
  // The last identifier segment of the expression — `row.mandateKey` -> mandateKey.
  const segments = text.split(/[^A-Za-z0-9_$]+/).filter(Boolean);
  const last = segments[segments.length - 1];
  if (!last) return false;
  const lower = last.toLowerCase();
  // `mandateKey` -> "mandatekey" ends with "key"; `list_name` splits to "name".
  return RECORD_LABEL_WORDS.some((w) => lower === w || lower.endsWith(w));
}

function scanSource(relPath: string, source: string): Finding[] {
  const sf = ts.createSourceFile(
    relPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    relPath.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const findings: Finding[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      const receiver = node.expression.expression.getText();
      const isToastReceiver = /(^|\.)[a-zA-Z]*[tT]oast$/.test(receiver);
      const isHelper = /(^|\.)recordToast$/.test(receiver);
      const arg = node.arguments[0];
      if (
        isToastReceiver &&
        !isHelper &&
        TOAST_METHODS.has(method) &&
        arg &&
        ts.isTemplateExpression(arg) &&
        arg.templateSpans.some((s) => namesARecord(s.expression))
      ) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        const snippet = arg.getText().replace(/\s+/g, " ").slice(0, 160);
        findings.push({
          file: relPath,
          line: line + 1,
          method,
          snippet,
          id: `${relPath}::${snippet}`,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return findings;
}

function listFiles(): string[] {
  const out = execFileSync(
    "git",
    ["ls-files", "--", ...SCANNED_DIRS.map((d) => `${d}/**/*.ts`), ...SCANNED_DIRS.map((d) => `${d}/**/*.tsx`)],
    { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return out
    .split("\n")
    .filter(Boolean)
    .filter(
      (f) =>
        !/__tests__|\.test\.|\.spec\.|\/fixtures\//.test(f) &&
        f !== "lib/toast.ts",
    );
}

function collect(): Finding[] {
  const findings: Finding[] = [];
  for (const file of listFiles()) {
    let source: string;
    try {
      source = readFileSync(join(REPO_ROOT, file), "utf8");
    } catch {
      continue;
    }
    if (!/toast\s*\.\s*(success|error|info|warning)\s*\(/.test(source)) continue;
    findings.push(...scanSource(file, source));
  }
  return findings;
}

function loadBaseline(): Set<string> {
  if (!existsSync(BASELINE_PATH)) return new Set();
  const raw = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as {
    ids: string[];
  };
  return new Set(raw.ids ?? []);
}

function selfTest(): number {
  const dir = mkdtempSync(join(tmpdir(), "record-toasts-selftest-"));
  try {
    const file = join(dir, "offender.tsx");
    const bad = [
      'import { toast } from "@/lib/toast";',
      "export function save(row: { id: string; mandateKey: string }) {",
      "  toast.success(`Created \"${row.mandateKey}\"`);",
      "}",
    ].join("\n");
    writeFileSync(file, bad);
    const hits = scanSource("offender.tsx", readFileSync(file, "utf8"));
    if (hits.length !== 1) {
      console.error(
        `[check:record-toasts] SELF-TEST FAILED — the guard did not flag a bare record-naming toast (${hits.length} findings). It can no longer fail, so a green run proves nothing.`,
      );
      return 1;
    }
    const good = bad.replace(
      "toast.success(`Created \"${row.mandateKey}\"`);",
      "recordToast.success({ type: \"mandate\", id: row.id }, `Created \"${row.mandateKey}\"`);",
    );
    if (scanSource("ok.tsx", good).length !== 0) {
      console.error(
        "[check:record-toasts] SELF-TEST FAILED — the guard flags the canonical `recordToast` helper, which would push people off it.",
      );
      return 1;
    }
    console.log(
      "[check:record-toasts] self-test OK — flags a bare record-naming toast, ignores the `recordToast` helper.",
    );
    return 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function main(): number {
  const argv = process.argv.slice(2);
  if (argv.includes("--self-test")) return selfTest();

  const findings = collect();

  if (argv.includes("--update")) {
    const ids = [...new Set(findings.map((f) => f.id))].sort();
    writeFileSync(
      BASELINE_PATH,
      `${JSON.stringify(
        {
          note: "Record-naming toasts not yet routed through recordToast (lib/toast.ts). This list may only SHRINK — see scripts/check-record-toasts.ts.",
          updated: new Date().toISOString().slice(0, 10),
          count: ids.length,
          ids,
        },
        null,
        2,
      )}\n`,
    );
    console.log(`[check:record-toasts] baseline rewritten: ${ids.length} call sites.`);
    return 0;
  }

  const baseline = loadBaseline();
  const fresh = findings.filter((f) => !baseline.has(f.id));

  console.log(
    `[check:record-toasts] ${findings.length} record-naming toast(s) outside the helper; ${baseline.size} baselined; ${fresh.length} NOT baselined.`,
  );
  for (const f of fresh) {
    console.log(
      `  ${f.file}:${f.line}  toast.${f.method}(${f.snippet}) — route it through \`recordToast.${f.method}({ type, id, title }, …)\` from "@/lib/toast" so it can be withdrawn when the record is renamed, deleted, or left behind.`,
    );
  }
  if (fresh.length === 0) {
    console.log(
      "[check:record-toasts] no new offenders. Shrink the baseline by routing call sites, then run --update.",
    );
  }
  const strict = argv.includes("--strict");
  return strict && fresh.length > 0 ? 1 : 0;
}

if (require.main === module) process.exit(main());
