import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import { createOnigurumaEngine } from "shiki/engine/oniguruma";
import { refractor } from "refractor/all";
import { toHtml } from "hast-util-to-html";
import fs from "node:fs";
const files = {
  tsx515: ["tsx", fs.readFileSync("features/code-editor/components/code-block/CodeBlock.tsx", "utf8")],
  py: ["python", fs.readFileSync("../aidream/aidream/kinds/seo_keywords.py", "utf8")],
  json: ["json", fs.readFileSync("package.json", "utf8")],
};
for (const [engineName, engine] of [["js", createJavaScriptRegexEngine({ forgiving: true })], ["onig", await createOnigurumaEngine(import("shiki/wasm"))]]) {
  const hl = await createHighlighterCore({ engine, themes: [import("@shikijs/themes/dark-plus"), import("@shikijs/themes/light-plus")], langs: [import("@shikijs/langs/tsx"), import("@shikijs/langs/python"), import("@shikijs/langs/json")] });
  for (const [name, [lang, code]] of Object.entries(files)) {
    hl.codeToTokens(code, { lang, themes: { light: "light-plus", dark: "dark-plus" } }); // warm
    const a = performance.now();
    for (let i = 0; i < 5; i++) hl.codeToTokens(code, { lang, themes: { light: "light-plus", dark: "dark-plus" } });
    console.log(`shiki-${engineName} ${name} lines=${code.split("\n").length} one-shot=${((performance.now() - a) / 5).toFixed(1)}ms`);
  }
}
for (const [name, [lang, code]] of Object.entries(files)) {
  toHtml(refractor.highlight(code, lang));
  const a = performance.now();
  for (let i = 0; i < 5; i++) toHtml(refractor.highlight(code, lang));
  console.log(`prism ${name} one-shot=${((performance.now() - a) / 5).toFixed(1)}ms`);
}
