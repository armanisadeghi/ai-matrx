/**
 * An install never breaks the dev server's stylesheet (root cause 2026-09-26):
 * while pnpm relinks a package, Tailwind v4 registers a dir-dependency for every
 * ancestor of the momentarily-missing `@source` path — up to "/". Next's Turbopack
 * loader throws for a dependency outside the project root, the evaluation is
 * cached as failed, and every route 500s until a restart. The guard plugin drops
 * those and keeps the in-root ones, and postcss.config wires it LAST.
 */
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import postcss, { type Plugin } from "postcss";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const keepDependenciesInRoot = require("../keep-dependencies-in-root.cjs") as (o?: { root?: string }) => Plugin;

const ROOT = "/Users/someone/code/matrx-frontend";
/** What Tailwind emits while node_modules/@ai-matrx/print is being relinked. */
const tailwindDuringRelink: Plugin = {
  postcssPlugin: "tailwind-during-relink",
  OnceExit(_css, { result }) {
    for (const dir of ["/", "/Users", "/Users/someone", "/Users/someone/code", ROOT, `${ROOT}/node_modules`, `${ROOT}/node_modules/@ai-matrx`]) {
      result.messages.push({ type: "dir-dependency", plugin: "tw", dir, glob: "**" });
    }
    result.messages.push({ type: "dependency", plugin: "tw", file: `${ROOT}/node_modules/tailwindcss/index.css` });
    result.messages.push({ type: "warning", plugin: "tw", text: "kept as is" });
  },
};

it("drops every dependency outside the project root and keeps the rest", async () => {
  const result = await postcss([tailwindDuringRelink, keepDependenciesInRoot({ root: ROOT })]).process("a{}", { from: `${ROOT}/app/globals.css` });
  const deps = result.messages.filter((m) => /dependency/.test(m.type)).map((m) => (m.dir ?? m.file) as string);
  expect(deps).toEqual([ROOT, `${ROOT}/node_modules`, `${ROOT}/node_modules/@ai-matrx`, `${ROOT}/node_modules/tailwindcss/index.css`]);
  expect(deps.every((d) => !path.relative(ROOT, d).startsWith(".."))).toBe(true);
  expect(result.messages.some((m) => m.type === "warning")).toBe(true);
});

it("postcss.config wires the guard LAST, by an absolute path Turbopack can load", () => {
  // Loaded in a real Node ESM context (the config uses import.meta.url), as Next loads it.
  const out = execFileSync(process.execPath, ["--input-type=module", "-e", "const c = (await import(process.argv[1])).default; process.stdout.write(JSON.stringify(Object.keys(c.plugins)));", pathToFileURL(path.resolve(__dirname, "../../../postcss.config.mjs")).href], { encoding: "utf8" });
  const keys = JSON.parse(out) as string[];
  const last = keys[keys.length - 1] as string;
  expect(path.isAbsolute(last)).toBe(true);
  expect(last.endsWith("scripts/postcss/keep-dependencies-in-root.cjs")).toBe(true);
});
