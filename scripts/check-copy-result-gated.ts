/**
 * check:copy-result-gated — A "COPIED" STATE FOLLOWS A COPY THAT LANDED, NEVER A COPY THAT WAS ATTEMPTED.
 *
 * `copyText` / `copyImage` / `copyLink` (`@ai-matrx/kit/clipboard`, hook and standalone) resolve a
 * boolean: `true` only when the clipboard holds the content. A caller that drops the result and then
 * sets a copied flag or fires a success toast tells the person "Copied" after a refused copy.
 *
 * Rule: a statement that calls one of those functions and DISCARDS the result (`await copyText(x);`,
 * `void copyText(x);`, `copyText(x);`, `copyText(x).then(...)`) must not be followed, inside the same
 * block, by a copied-state setter or a success toast. Write `if (!(await copyText(x))) return;` or
 * `if (await copyText(x)) { setCopied(true) }`.
 *
 * Zero baseline: any finding fails. Scanned: tracked .ts/.tsx under app features components lib hooks
 * providers utils packages (tests, .d.ts excluded). `--self-test` proves red on a planted violation and
 * green on the gated form. `--list` prints findings.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { REPO_ROOT, repoFiles } from "./lib/repo-files";

const SCAN_DIRS = ["app", "features", "components", "lib", "hooks", "providers", "utils", "packages"];
const STMT = /^(\s*)(void\s+|await\s+)?copy(?:Text|Image|Link|ToClipboard)\(/;
const SUCCESS = /set\w*Copied\w*\(|setCopy\w*\(|setIsCopied|setJustCopied|setHasCopied|toast\.success|\btoast\(/i;

export interface Finding { file: string; line: number; text: string }

/** Remove comments, keeping line structure. */
function stripComments(src: string): string {
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  return noBlock.split("\n").map((l) => (/^\s*\/\//.test(l) ? "" : l)).join("\n");
}

export function scanSource(file: string, src: string): Finding[] {
  if (!/copy(?:Text|Image|Link|ToClipboard)\(/.test(src)) return [];
  const L = stripComments(src).split("\n");
  const out: Finding[] = [];
  for (let i = 0; i < L.length; i++) {
    const m = STMT.exec(L[i]);
    if (!m) continue;
    const text = L.slice(i, i + 40).join("\n");
    let depth = 0;
    let end = -1;
    for (let p = text.indexOf("(", m[0].length - 1); p < text.length; p++) {
      if (text[p] === "(") depth++;
      else if (text[p] === ")" && --depth === 0) { end = p; break; }
    }
    if (end < 0) continue;
    const tail = text.slice(end + 1);
    const endLine = i + text.slice(0, end).split("\n").length - 1;
    const indent = m[1].length;
    let region: string;
    if (/^\s*\.then\(/.test(tail)) {
      // `.then((ok) => ...)` consumes the result; `.then(() => ...)` is the discard.
      if (/^\s*\.then\(\s*(async\s*)?(\(\s*\w|\w+\s*=>)/.test(tail)) continue;
      region = tail.slice(0, 400);
    } else if (tail.startsWith(";")) {
      const seg: string[] = [];
      for (const l of L.slice(endLine + 1, endLine + 6)) {
        if (l.trim() === "") continue;
        if (l.length - l.trimStart().length < indent) break;
        seg.push(l);
      }
      region = seg.join("\n");
    } else continue;
    if (SUCCESS.test(region)) out.push({ file, line: i + 1, text: L[i].trim().slice(0, 100) });
  }
  return out;
}

function scanRepo(): Finding[] {
  const files = repoFiles(REPO_ROOT, { under: SCAN_DIRS, match: /\.tsx?$/ }).filter(
    (f) => !/\.d\.ts$|\.test\.|\.spec\.|__tests__|\/generated\/|node_modules/.test(f),
  );
  const out: Finding[] = [];
  for (const f of files) {
    let src: string;
    try { src = readFileSync(join(REPO_ROOT, f), "utf8"); } catch { continue; }
    out.push(...scanSource(f, src));
  }
  return out;
}

function selfTest(): number {
  const bad = [
    "const h = async () => {\n  await copyText(x);\n  setCopied(true);\n};\n",
    "const h = () => {\n  void copyText(x);\n  toast.success('Copied');\n};\n",
    "const h = () => {\n  copyText(x).then(() => setCopied(true));\n};\n",
    "const h = async () => {\n  await copyText(\n    a,\n    b,\n  );\n  setIsCopied(true);\n};\n",
  ];
  const good = [
    "const h = async () => {\n  if (!(await copyText(x))) return;\n  setCopied(true);\n};\n",
    "const h = async () => {\n  if (await copyText(x)) setCopied(true);\n};\n",
    "const h = async () => {\n  await copyText(x, 'Copied');\n};\n",
    "const h = async () => {\n  await copyText(x);\n};\nfunction other() {\n  setCopied(true);\n}\n",
  ];
  let fail = 0;
  bad.forEach((s, i) => { const n = scanSource("components/x/A.tsx", s).length; console.log(`[self-test] violation ${i + 1}: ${n ? "RED ok" : "NOT RED FAIL"}`); if (!n) fail++; });
  good.forEach((s, i) => { const n = scanSource("components/x/A.tsx", s).length; console.log(`[self-test] gated ${i + 1}: ${n ? "RED FAIL" : "GREEN ok"}`); if (n) fail++; });
  return fail ? 1 : 0;
}

function main(): number {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) return selfTest();
  const found = scanRepo();
  if (found.length) {
    console.error(`copy-result-gated: FAIL — ${found.length} copy call(s) discard the result, then show "copied":`);
    for (const f of found) console.error(`  ${f.file}:${f.line}  ${f.text}`);
    console.error("  -> if (!(await copyText(x))) return;   (copyText resolves true only when the clipboard holds it)");
    return 1;
  }
  console.log("copy-result-gated: ok (every copied state follows a copy that landed)");
  return 0;
}

if (require.main === module) process.exit(main());
