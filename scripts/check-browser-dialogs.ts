#!/usr/bin/env npx tsx
/**
 * check:browser-dialogs — no native browser dialog may be raised from
 * `features/**` or `app/**`.
 *
 * THE LAW (CLAUDE.md, "Browser dialogs are banned"): `window.confirm`,
 * `window.alert`, `window.prompt` and their bare global forms are banned
 * everywhere, demos included. The replacements:
 *
 *   • a confirmation → `confirm({ title, description, confirmLabel, variant })`
 *     from `@/components/dialogs/confirm/ConfirmDialogHost`, or
 *     `<ConfirmDialog />` from `@/components/ui/confirm-dialog`. The
 *     description must NAME THE CONSEQUENCE — what is lost, what is
 *     duplicated, what it costs — per
 *     ../../common-docs/policies/destructive-and-expensive-actions.md. A bare
 *     "Are you sure?" satisfies neither law.
 *   • a message → `toast.*` from `@/lib/toast` (never bare `sonner`).
 *   • a text input → `<TextInputDialog />`.
 *   • a copy fallback → `<ClipboardFallbackDialog />`.
 *
 * WHY A SCRIPT WHEN ESLINT ALREADY HAS THE RULES. `eslint.config.mjs` carries
 * `no-alert`, `no-restricted-globals` and `no-restricted-properties` for these
 * four forms (promoted warn → error 2026-08-12, D67), and they do fire — but
 * NOTHING AUTOMATED RUNS THEM. `pnpm lint` is not in `.github/workflows/ci.yml`
 * and was not in `scripts/run-release-gates.sh`, so the ban was an IDE
 * squiggle and a code-review habit, not a gate. A whole-repo `eslint .` cannot
 * take that seat either: it carries a large unrelated backlog and takes
 * minutes. This guard is the narrow, fast, zero-backlog half — the four forms,
 * the two directories, ~2s — so the class has something watching the door.
 *
 * WHY THE CLASS MATTERS BEYOND STYLE (2026-09-11, feedback
 * 11b0a90c-829b-4fc8-8c69-0f2dc6cf7d85). A native `window.confirm()` raised
 * from inside an open Radix Dialog cannot appear at all: the dialog holds
 * `document.body.style.pointerEvents = "none"` while it is open, and the
 * browser's modal prompt is suppressed behind it, so the handler that awaited
 * the answer never continues and the button reads as dead — exactly the
 * silent-failure class law 4 forbids. The canonical `confirm()` renders inside
 * the React tree and does not have that failure mode.
 *
 * WHAT IT FAILS ON
 *   1. `window.confirm(` / `window.alert(` / `window.prompt(` — any call.
 *   2. Bare `confirm(` / `alert(` / `prompt(` where the identifier is NOT bound
 *      in the file (no import, no local const/let/function/parameter of that
 *      name). An unbound identifier at a call position IS the global.
 *
 * WHAT IT DELIBERATELY DOES NOT FAIL ON
 *   • The canonical imperative `confirm({...})` — the file imports it.
 *   • A local helper or variable that happens to be named `confirm` /
 *     `alert` / `prompt` (`features/matrx-envelope/directiveHost.tsx` declares
 *     `async function confirm(shell)`; `features/marketing/seo/value-system/
 *     topics/ProposedQueue.tsx` binds `const confirm = async (...)`).
 *   • Anything that is not a call expression in the parsed tree: comments,
 *     strings, template literals, and — the reason this reads the AST rather
 *     than the text — JSX TEXT. Three sentences in this repo end in the words
 *     "…system prompt (what the LLM receives)" and a text scan called every one
 *     of them a `prompt()` call. A guard whose first real run is three false
 *     positives is a guard someone deletes.
 *   • Tests and fixtures (`__tests__`, `*.test.*`, `*.spec.*`), where
 *     `javascript:alert(1)` is XSS input, not a call.
 *
 * WHAT IT CANNOT SEE (never let a green run imply more than it proves)
 *   • A native dialog reached indirectly — `globalThis["con" + "firm"]`,
 *     `const f = window["alert"]`, or a call through a package. Static text is
 *     all this reads.
 *   • Whether a canonical `confirm()`'s description actually names the
 *     consequence. That is the destructive-click law's other half and is a
 *     reading, not a regex.
 *   • Directories outside `features/` and `app/` (the scope CLAUDE.md's ban is
 *     widest on, and the one this gate commits to keeping at zero).
 *
 * Usage:
 *   pnpm check:browser-dialogs             # report; exit 0
 *   pnpm check:browser-dialogs:strict      # exit 1 on findings
 *   pnpm check:browser-dialogs:self-test   # prove the guard can still fail
 */

import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import ts from "typescript";

const REPO_ROOT = resolve(__dirname, "..");
const SCANNED_DIRS = ["features", "app"] as const;
const BANNED = ["confirm", "alert", "prompt"] as const;
type Banned = (typeof BANNED)[number];

const REMEDY: Record<Banned, string> = {
  confirm:
    'use `confirm({ title, description, confirmLabel, variant })` from "@/components/dialogs/confirm/ConfirmDialogHost" (or `<ConfirmDialog />` from "@/components/ui/confirm-dialog"), and make the description name the consequence',
  alert: 'use `toast.error` / `toast.success` from "@/lib/toast"',
  prompt: "use `<TextInputDialog />` (or a `<Dialog />` with an `<Input />`)",
};

interface Finding {
  file: string;
  line: number;
  form: string;
  name: Banned;
}

/**
 * Every identifier NAME bound anywhere in this file — imports, declarations,
 * function and class names, parameters, destructures, catch clauses. If a
 * banned name is in here, a bare call to it is a local helper, not the global.
 * Deliberately file-wide rather than scope-accurate: a false NEGATIVE costs one
 * missed finding; a false positive costs the guard its life.
 */
function boundNames(sf: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  const addBinding = (node: ts.BindingName | undefined) => {
    if (!node) return;
    if (ts.isIdentifier(node)) {
      names.add(node.text);
      return;
    }
    for (const el of node.elements) {
      if (ts.isBindingElement(el)) addBinding(el.name);
    }
  };
  const walk = (node: ts.Node): void => {
    if (ts.isImportClause(node)) {
      if (node.name) names.add(node.name.text);
    } else if (ts.isImportSpecifier(node) || ts.isNamespaceImport(node)) {
      names.add(node.name.text);
    } else if (ts.isVariableDeclaration(node) || ts.isParameter(node)) {
      addBinding(node.name);
    } else if (
      (ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isFunctionExpression(node)) &&
      node.name
    ) {
      names.add(node.name.text);
    } else if (ts.isCatchClause(node)) {
      addBinding(node.variableDeclaration?.name);
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return names;
}

const isBanned = (name: string): name is Banned =>
  (BANNED as readonly string[]).includes(name);

function scanFile(absPath: string, relPath: string): Finding[] {
  const raw = readFileSync(absPath, "utf8");
  // Cheap prefilter — parsing every file in features/ and app/ to find the
  // handful that even mention these names is wasted work.
  if (!/\b(?:confirm|alert|prompt)\s*\(/.test(raw)) return [];

  const sf = ts.createSourceFile(
    absPath,
    raw,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ false,
    absPath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const bound = boundNames(sf);
  const findings: Finding[] = [];
  const lineOf = (pos: number) =>
    sf.getLineAndCharacterOfPosition(pos).line + 1;

  const walk = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isIdentifier(callee) && isBanned(callee.text)) {
        // A bare call to a name nothing in the file binds IS the global.
        if (!bound.has(callee.text)) {
          findings.push({
            file: relPath,
            line: lineOf(callee.getStart(sf)),
            form: `${callee.text}()`,
            name: callee.text,
          });
        }
      } else if (
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        (callee.expression.text === "window" ||
          callee.expression.text === "globalThis") &&
        isBanned(callee.name.text)
      ) {
        findings.push({
          file: relPath,
          line: lineOf(callee.getStart(sf)),
          form: `${callee.expression.text}.${callee.name.text}()`,
          name: callee.name.text,
        });
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return findings;
}

function listFiles(root: string): string[] {
  const out = execFileSync(
    "git",
    [
      "-C",
      root,
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      ...SCANNED_DIRS.map((d) => `${d}/**/*.ts`),
      ...SCANNED_DIRS.map((d) => `${d}/**/*.tsx`),
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return out
    .split("\n")
    .filter(Boolean)
    .filter((f) => !/__tests__|\.test\.|\.spec\.|__mocks__/.test(f));
}

function run(root: string): Finding[] {
  const findings: Finding[] = [];
  for (const rel of listFiles(root)) {
    findings.push(...scanFile(join(root, rel), rel));
  }
  return findings.sort(
    (a, b) => a.file.localeCompare(b.file) || a.line - b.line,
  );
}

/** Prove the guard can still fail, and that it still passes lawful code. */
function selfTest(): number {
  const dir = mkdtempSync(join(tmpdir(), "browser-dialogs-selftest-"));
  const featDir = join(dir, "features", "planted");
  execFileSync("mkdir", ["-p", featDir]);
  execFileSync("git", ["-C", dir, "init", "-q"]);

  const violating = join(featDir, "Violation.tsx");
  writeFileSync(
    violating,
    [
      '"use client";',
      "export function Planted() {",
      "  const go = () => {",
      '    if (window.confirm("really?")) window.alert("done");',
      '    window.prompt("name?");',
      '    if (confirm("bare")) alert("bare");',
      '    prompt("bare");',
      "  };",
      "  return <button onClick={go}>x</button>;",
      "}",
      "",
    ].join("\n"),
    "utf8",
  );

  const lawful = join(featDir, "Lawful.tsx");
  writeFileSync(
    lawful,
    [
      '"use client";',
      'import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";',
      'import { toast } from "@/lib/toast";',
      "// A doc comment naming window.confirm(x) and window.alert(y) is not a call.",
      'const HINT = "window.prompt(message, url) in a string is not a call";',
      "export function Lawful() {",
      "  const go = async () => {",
      "    const ok = await confirm({",
      '      title: "Delete this?",',
      '      description: "The record and its history are removed for everyone.",',
      "    });",
      "    if (ok) toast.success(HINT);",
      "  };",
      "  return <button onClick={go}>x</button>;",
      "}",
      "",
    ].join("\n"),
    "utf8",
  );

  const findings = run(dir);
  const byFile = (f: string) =>
    findings.filter((x) => x.file.endsWith(f)).map((x) => x.form);

  const plantedForms = new Set(byFile("Violation.tsx"));
  const expected = [
    "window.confirm()",
    "window.alert()",
    "window.prompt()",
    "confirm()",
    "alert()",
    "prompt()",
  ];
  const missed = expected.filter((f) => !plantedForms.has(f));
  const falsePositives = byFile("Lawful.tsx");

  rmSync(dir, { recursive: true, force: true });

  if (missed.length > 0) {
    console.error(
      `SELF-TEST FAILED — the guard did not catch: ${missed.join(", ")}`,
    );
    return 1;
  }
  if (falsePositives.length > 0) {
    console.error(
      `SELF-TEST FAILED — the guard flagged lawful code: ${falsePositives.join(", ")}`,
    );
    return 1;
  }
  console.log(
    `SELF-TEST PASSED — all ${expected.length} banned forms caught in a planted file; the canonical confirm(), toast, comments and strings all read clean.`,
  );
  return 0;
}

function main(): number {
  const argv = process.argv.slice(2);
  if (argv.includes("--self-test")) return selfTest();
  const strict = argv.includes("--strict");

  const findings = run(REPO_ROOT);
  if (findings.length === 0) {
    console.log(
      `OK — no native browser dialog in ${SCANNED_DIRS.map((d) => `${d}/`).join(" or ")} (window.confirm/alert/prompt and their bare global forms).`,
    );
    return 0;
  }

  console.error(
    `\nBROWSER DIALOGS ARE BANNED — ${findings.length} finding${findings.length === 1 ? "" : "s"}:\n`,
  );
  for (const f of findings) {
    console.error(`  ${relative(REPO_ROOT, join(REPO_ROOT, f.file))}:${f.line}  ${f.form}`);
    console.error(`      → ${REMEDY[f.name]}`);
  }
  console.error(
    "\nWhy, beyond style: a native confirm() raised from inside an open Radix Dialog\n" +
      "cannot render at all — the dialog holds body pointer-events at none, so the\n" +
      "button reads as dead and the handler never continues. See CLAUDE.md\n" +
      '"Browser dialogs are banned" and common-docs/policies/destructive-and-expensive-actions.md.\n',
  );
  return strict ? 1 : 0;
}

process.exit(main());
