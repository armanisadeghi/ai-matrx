#!/usr/bin/env node
/**
 * check-jsx-text-comments.mjs — a `//` line inside JSX children is not a
 * comment. It is TEXT, and it renders on the screen.
 *
 * THE CLASS (found live 2026-09-17): the Data Doctrine stamp sweep placed
 * `// CONVERGE: C-3 — is_personal is dropped; …` lines above the expressions
 * they annotate. Where that expression was a JSX child, the "comment" became a
 * JsxText node, so the "Add brand" dialog on /marketing/brands showed the
 * organization name followed by the whole convergence note. TypeScript is
 * silent (JsxText containing `//` is legal) and ESLint's
 * react/jsx-no-comment-textnodes is not enabled in eslint.config.mjs nor run
 * as a gate, so nothing stopped seven such lines shipping.
 *
 * THE RULE: no JsxText node may contain a line whose first non-blank
 * characters are `//`. Inside JSX, a note is written `{/* … *\/}`.
 *
 * The one lawful exception is text that really MEANS a literal "//" (e.g.
 * `<code>// comments</code>` describing JSON5). It opts out with the same
 * marker ESLint already knows, on the line before, with a reason:
 *   {/* eslint-disable-next-line react/jsx-no-comment-textnodes -- why *\/}
 *
 * Parse-only (TypeScript parser, no program), seconds over the whole tree.
 *
 * Usage:
 *   pnpm check:jsx-text-comments              # all tracked .tsx/.jsx — exit 1 on any finding
 *   pnpm check:jsx-text-comments --fix        # rewrite each offending line as {/* … *\/}
 *   pnpm check:jsx-text-comments --self-test  # prove the guard fails on the 2026-09-17 shape
 *
 * Exit: 0 clean · 1 finding(s) · 3 self-test failed
 */

import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import ts from "typescript";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARGS = process.argv.slice(2);
const SELF_TEST = ARGS.includes("--self-test");
const FIX = ARGS.includes("--fix");

const OPT_OUT = /eslint-disable-next-line[^\n]*react\/jsx-no-comment-textnodes/;
const LINE_COMMENT = /^(\s*)\/\/\s?(.*?)\s*$/;

/** Every `//` line that sits inside a JsxText node: { line, start, end, indent, text }. */
export function findJsxTextComments(file, source) {
  const sf = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".jsx") ? ts.ScriptKind.JSX : ts.ScriptKind.TSX,
  );
  const findings = [];
  const lines = source.split("\n");
  const visit = (node) => {
    if (node.kind === ts.SyntaxKind.JsxText) {
      const full = source.slice(node.pos, node.end);
      let offset = node.pos;
      for (const raw of full.split("\n")) {
        const m = LINE_COMMENT.exec(raw);
        if (m) {
          const { line } = sf.getLineAndCharacterOfPosition(offset);
          const prev = line > 0 ? lines[line - 1] : "";
          if (OPT_OUT.test(prev)) {
            offset += raw.length + 1;
            continue;
          }
          findings.push({
            line: line + 1,
            start: offset,
            end: offset + raw.length,
            indent: m[1],
            text: m[2],
          });
        }
        offset += raw.length + 1;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return findings;
}

/** Rewrite each finding as `{/* … *\/}`, preserving the note text. */
export function fixJsxTextComments(source, findings) {
  let out = source;
  for (const f of [...findings].sort((a, b) => b.start - a.start)) {
    const safe = f.text.replace(/\*\//g, "* /");
    out = out.slice(0, f.start) + `${f.indent}{/* ${safe} */}` + out.slice(f.end);
  }
  return out;
}

function trackedFiles() {
  return execFileSync("git", ["ls-files", "*.tsx", "*.jsx"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\n")
    .filter(Boolean);
}

function selfTest() {
  const planted = [
    "export function A({ org }: { org: { name: string; is_personal: boolean } }) {",
    "  // CONVERGE: a real comment in code position — must NOT be flagged",
    "  return (",
    "    <option>",
    "      {org.name}",
    "      // CONVERGE: C-3 — is_personal is dropped",
    "      {org.is_personal ? ' (personal)' : ''}",
    "      {/* eslint-disable-next-line react/jsx-no-comment-textnodes -- literal JSON5 syntax */}",
    "      // comments are fine",
    "    </option>",
    "  );",
    "}",
  ].join("\n");
  const found = findJsxTextComments("planted.tsx", planted);
  const fixed = fixJsxTextComments(planted, found);
  const refound = findJsxTextComments("planted.tsx", fixed);
  const ok =
    found.length === 1 &&
    found[0].line === 6 &&
    fixed.includes("{/* CONVERGE: C-3 — is_personal is dropped */}") &&
    fixed.includes("  // CONVERGE: a real comment in code position") &&
    refound.length === 0;
  if (!ok) {
    console.error("check-jsx-text-comments self-test FAILED", { found, fixed, refound });
    process.exit(3);
  }
  console.log("check-jsx-text-comments self-test: planted JSX-text `//` line detected, code comment ignored, --fix repairs it.");
  process.exit(0);
}

if (SELF_TEST) selfTest();

let total = 0;
for (const rel of trackedFiles()) {
  const abs = resolve(ROOT, rel);
  let source;
  try {
    source = readFileSync(abs, "utf8");
  } catch {
    continue; // deleted in worktree
  }
  if (!source.includes("//")) continue;
  const findings = findJsxTextComments(rel, source);
  if (!findings.length) continue;
  total += findings.length;
  for (const f of findings) {
    console.log(`${rel}:${f.line}  JSX text renders a "//" line: ${f.text.slice(0, 100)}`);
  }
  if (FIX) writeFileSync(abs, fixJsxTextComments(source, findings));
}

if (total === 0) {
  console.log("check-jsx-text-comments: no `//` lines inside JSX text.");
  process.exit(0);
}
if (FIX) {
  console.log(`check-jsx-text-comments: rewrote ${total} line(s) as {/* … */}. Re-run to confirm.`);
  process.exit(0);
}
console.error(
  `\ncheck-jsx-text-comments: ${total} "//" line(s) inside JSX children render as visible text. Write them as {/* … */} (pnpm check:jsx-text-comments --fix).`,
);
process.exit(1);
