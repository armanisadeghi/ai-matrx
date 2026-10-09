// components/merge-field-input/__tests__/typing-a-multiline-template.test.mjs
//
// REAL-BROWSER guard: the merge-field editor typed in Chromium, the only place
// contenteditable caret and text insertion are real (jsdom has neither).
// Typing `a`, Enter, `b` saved "ab\n" — the newline typed at the END of the
// text went in without the <br> that gives the new line a place to draw, so
// the caret stayed on line one and `b` landed before the newline (2026-10-07
// final pass, /chat/message-templates/new and edit). Bundles the real
// MergeFieldInput with esbuild (formatting hook stubbed: it is not on the
// typing path) and drives it with Playwright.
//
// Run: node --test components/merge-field-input/__tests__/typing-a-multiline-template.test.mjs
// Proof against another DOM helper: MERGE_FIELD_DOM=<path to merge-field-dom.ts>.

import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { chromium } from "playwright";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");

async function bundle() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "merge-field-typing-"));
  const entry = path.join(dir, "entry.tsx");
  fs.writeFileSync(
    entry,
    `import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { MergeFieldInput } from "@/components/merge-field-input/MergeFieldInput";
function Host({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return <MergeFieldInput value={value} onChange={(v) => { (window as any).__value = v; setValue(v); }} fieldLabel={(p) => "L:" + p} multiline aria-label="body" />;
}
(window as any).__mount = (initial: string) => { (window as any).__value = initial; createRoot(document.getElementById("root")!).render(<Host initial={initial} />); };
`,
  );
  const override = process.env.MERGE_FIELD_DOM;
  const result = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"' },
    alias: { "@": ROOT },
    nodePaths: [path.join(ROOT, "node_modules")],
    logLevel: "error",
    plugins: [
      {
        name: "typing-path-only",
        setup(b) {
          if (override) b.onResolve({ filter: /merge-field-dom$/ }, () => ({ path: path.resolve(override) }));
          b.onResolve({ filter: /useMergeFieldFormatting$/ }, () => ({ path: "stub", namespace: "stub" }));
          b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export function useMergeFieldFormatting() {}", loader: "ts" }));
        },
      },
    ],
  });
  fs.rmSync(dir, { recursive: true, force: true });
  return result.outputFiles[0].text;
}

// The component's own layout classes, as Tailwind draws them.
const CSS = `.block{display:block}.whitespace-pre-wrap{white-space:pre-wrap}.break-words{overflow-wrap:break-word}.min-h-40{min-height:10rem}`;

test("typing a multi-line template keeps every line, in order", async () => {
  const js = await bundle();
  const browser = await chromium.launch({ headless: true });
  try {
    const run = async (initial, steps) => {
      // A fresh page per case: nothing a previous case left on the window carries over.
      const page = await browser.newPage();
      await page.setContent(`<style>${CSS}</style><div id="root"></div>`);
      await page.addScriptTag({ content: js });
      await page.evaluate((i) => window.__mount(i), initial);
      await page.getByRole("textbox").click();
      for (const step of steps) {
        if (step.press) await page.keyboard.press(step.press);
        else if (step.paste !== undefined) {
          await page.evaluate((text) => {
            const data = new DataTransfer();
            data.setData("text/plain", text);
            document.querySelector("[role=textbox]").dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
          }, step.paste);
        } else await page.keyboard.type(step.type);
        await page.waitForTimeout(20);
      }
      await page.waitForTimeout(50);
      const value = await page.evaluate(() => window.__value);
      await page.close();
      return value;
    };
    const t = (type) => ({ type });
    const enter = { press: "Enter" };

    assert.equal(await run("", [t("a"), enter, t("b")]), "a\nb", "Enter at the end, then a letter");
    assert.equal(await run("", [t("a"), enter, enter, t("b")]), "a\n\nb", "a blank line between");
    assert.equal(await run("", [t("Hi"), enter, t("there"), enter, t("Thanks")]), "Hi\nthere\nThanks", "three lines typed");
    assert.equal(await run("x", [{ press: "End" }, enter, t("b")]), "x\nb", "Enter at the end of a saved value");
    assert.equal(await run("ab", [{ press: "End" }, { press: "ArrowLeft" }, enter]), "a\nb", "Enter in the middle");
    assert.equal(await run("", [t("Hi {{name}}"), enter, t("b")]), "Hi {{name}}\nb", "Enter after a chip");
    assert.equal(await run("", [{ paste: "one\ntwo\n" }, t("three")]), "one\ntwo\nthree", "paste ending in a newline, then typing");
  } finally {
    await browser.close();
  }
});
