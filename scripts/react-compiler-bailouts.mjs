// LANE RENDER-AUDIT — which components does the React Compiler SKIP, and why.
//
// `reactCompiler: true` compiles a component only when it can prove the Rules of React hold;
// otherwise it SKIPS the whole component silently (the default panicThreshold) and leaves it
// exactly as written. This repo's rule is "no manual useMemo/useCallback/React.memo", so a
// skipped component has NO memoization at all: every parent render re-creates every callback
// and object it hands down, and every child re-renders. This lists, per file, what compiled and
// what was skipped with the compiler's own reason.
//
// Usage: node scripts/react-compiler-bailouts.mjs <file.tsx> [...]
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const pnpm = new URL("../node_modules/.pnpm/", import.meta.url).pathname;
const babel = require(`${pnpm}@babel+core@7.29.7/node_modules/@babel/core`);
const compiler = require(`${pnpm}babel-plugin-react-compiler@1.0.0/node_modules/babel-plugin-react-compiler`);
const ts = require(`${pnpm}@babel+plugin-syntax-typescript@7.29.7_@babel+core@7.29.7/node_modules/@babel/plugin-syntax-typescript`);
let total = { compiled: 0, skipped: 0 };
const args = process.argv.slice(2);
const summary = args[0] === "--summary";
const files = summary ? readFileSync(0, "utf8").split("\n").filter(Boolean) : args;
const skippedRows = [];
for (const file of files) {
  const events = [];
  const logger = { logEvent: (_f, e) => events.push(e) };
  try {
    babel.transformSync(readFileSync(file, "utf8"), {
      filename: file,
      babelrc: false,
      configFile: false,
      plugins: [[ts, { isTSX: true }], [compiler, { logger, panicThreshold: "none" }]],
    });
  } catch (e) {
    if (!summary) console.log(`${file}: transform failed ${String(e).slice(0, 200)}`);
    continue;
  }
  const ok = events.filter((e) => e.kind === "CompileSuccess");
  const bad = events.filter((e) => e.kind === "CompileError" || e.kind === "CompileSkip" || e.kind === "PipelineError");
  total.compiled += ok.length;
  total.skipped += bad.length;
  if (summary) {
    const byFn = new Map();
    for (const e of bad) {
      const d = e.detail ?? {};
      const line = e.fnLoc?.start?.line ?? "?";
      if (!byFn.has(line)) byFn.set(line, String(d.reason ?? d.options?.reason ?? e.reason ?? "").slice(0, 120));
    }
    for (const [line, reason] of byFn) skippedRows.push({ file, line, reason });
    continue;
  }
  console.log(`\n${file}: compiled ${ok.length} [${ok.map((e) => e.fnName).join(", ")}]  skipped ${bad.length}`);
  for (const e of bad) {
    const d = e.detail ?? {};
    const loc = e.fnLoc?.start?.line ?? d.loc?.start?.line ?? d.options?.loc?.start?.line ?? "?";
    const reason = d.reason ?? d.options?.reason ?? e.reason ?? String(d).slice(0, 160);
    const at = d.loc?.start?.line ?? d.options?.details?.[0]?.loc?.start?.line ?? d.primaryLocation?.()?.start?.line ?? "";
    console.log(`   SKIPPED fn@${loc} (${e.kind}): ${String(reason).slice(0, 220)} ${at ? `[line ${at}]` : ""}`);
  }
}
if (summary) {
  const reasons = {};
  for (const r of skippedRows) {
    const k = r.reason.replace(/\[line.*$/, "").slice(0, 90);
    reasons[k] = (reasons[k] ?? 0) + 1;
  }
  console.log(JSON.stringify({ files: files.length, compiledFunctions: total.compiled, skippedFunctions: skippedRows.length, reasons, skipped: skippedRows }, null, 1));
} else console.log(`\nTOTAL compiled ${total.compiled}, skipped ${total.skipped}`);
