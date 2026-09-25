// RC-B7 streaming highlight benchmark (temporary; not committed).
import { refractor } from "refractor/all";
import { toHtml } from "hast-util-to-html";
import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import { ShikiStreamTokenizer } from "@shikijs/stream";
import fs from "node:fs";

const code = fs.readFileSync("features/code-editor/components/code-block/CodeBlock.tsx", "utf8");
const CHUNK = 24;
const prefixes = [];
for (let end = CHUNK; end < code.length + CHUNK; end += CHUNK) prefixes.push(code.slice(0, Math.min(end, code.length)));

function stats(samples) {
  const s = [...samples].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return `chunks=${s.length} total=${s.reduce((a, b) => a + b, 0).toFixed(0)}ms p50=${q(0.5).toFixed(3)} p95=${q(0.95).toFixed(3)} max=${s[s.length - 1].toFixed(2)}`;
}

// Prism (what react-syntax-highlighter does per render): full re-highlight of the whole prefix.
{
  const t = [];
  for (const p of prefixes) { const a = performance.now(); toHtml(refractor.highlight(p, "tsx")); t.push(performance.now() - a); }
  console.log(`prism  full-rehighlight  ${stats(t)}  lines=${code.split("\n").length} chars=${code.length}`);
}
const hl = await createHighlighterCore({
  engine: createJavaScriptRegexEngine({ forgiving: true }),
  themes: [import("@shikijs/themes/light-plus"), import("@shikijs/themes/dark-plus")],
  langs: [import("@shikijs/langs/tsx")],
});
// Shiki full re-tokenize per chunk (naive).
{
  const t = [];
  for (const p of prefixes) { const a = performance.now(); hl.codeToTokens(p, { lang: "tsx", themes: { light: "light-plus", dark: "dark-plus" }, defaultColor: false }); t.push(performance.now() - a); }
  console.log(`shiki  full-retokenize   ${stats(t)}`);
}
// Shiki incremental (@shikijs/stream) — what CodeBlock now does.
{
  const tok = new ShikiStreamTokenizer({ highlighter: hl, lang: "tsx", themes: { light: "light-plus", dark: "dark-plus" }, defaultColor: false });
  const t = []; let prev = "";
  for (const p of prefixes) { const a = performance.now(); await tok.enqueue(p.slice(prev.length)); prev = p; t.push(performance.now() - a); }
  console.log(`shiki  incremental       ${stats(t)}`);
}
