#!/usr/bin/env node
/**
 * check:fill-secret — a password, secret or token is never filled with a bare `.fill(` / `.type(`.
 *
 * Playwright's timeout error echoes the filled value in its call log, so a bare fill of a secret
 * prints it into whatever transcript reads the failure (the test admin's password, 2026-10-05).
 * `fillSecret(target, selector|undefined, value)` in scripts/lib/seat-browser.mjs fills and, on
 * error, scrubs the value from message and stack. This flags every `.fill(` / `.type(` call in
 * scripts/ and e2e/ whose arguments mention password, secret or token and which is not fillSecret.
 *
 *   node scripts/fill-secret/check-fill-secret.mjs [paths…] [--strict]
 *   node scripts/fill-secret/check-fill-secret.mjs --self-test
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { emitItem, endItems } from "../checks/items.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TAG = "[fill-secret]";
const RULE = "bare-secret-fill";
const SELF = "scripts/fill-secret/check-fill-secret.mjs";
export const FIX =
  "Fill it with fillSecret(page, selector, value) or fillSecret(locator, undefined, value) from scripts/lib/seat-browser.mjs — a bare fill echoes the secret in Playwright's timeout error.";

export function remedyForKey() {
  return FIX;
}

const CALL = /\.(fill|type)\(/g;
const SECRETISH = /password|secret|token/i;

/** The sites in one file: [{ line, call }]. A call's arguments are read to the matching paren. */
export function scanSource(file, text) {
  if (file === "scripts/lib/seat-browser.mjs" || file === SELF) return [];
  const sites = [];
  for (const m of text.matchAll(CALL)) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    while (i < text.length && depth > 0 && i - start < 600) {
      if (text[i] === "(") depth += 1;
      else if (text[i] === ")") depth -= 1;
      i += 1;
    }
    const args = text.slice(start, i - 1);
    if (!SECRETISH.test(args)) continue;
    const line = text.slice(0, m.index).split("\n").length;
    sites.push({ line, call: `.${m[1]}(${args.replace(/\s+/g, " ").slice(0, 60)})` });
  }
  return sites;
}

function listFiles(root) {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "scripts", "e2e"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\n")
    .filter((f) => /\.(m?js|cjs|ts|tsx)$/.test(f) && !/(^|\/)node_modules\//.test(f));
}

function narrowed(argv, env, root) {
  let paths = argv.filter((a) => !a.startsWith("--"));
  if (!paths.length && env.MATRX_FINDINGS_PATHS) {
    try {
      const parsed = JSON.parse(env.MATRX_FINDINGS_PATHS);
      if (Array.isArray(parsed)) paths = parsed.map(String);
    } catch {
      paths = [];
    }
  }
  if (!paths.length) return null;
  return paths.map((p) => relative(root, isAbsolute(p) ? p : resolve(process.cwd(), p)).split("\\").join("/").replace(/\/+$/, ""));
}

export function collect({ root = ROOT, paths = null } = {}) {
  let files = listFiles(root);
  if (paths) {
    const dirs = paths.filter((p) => p === "" || (existsSync(join(root, p)) && statSync(join(root, p)).isDirectory()));
    files = files.filter((f) => paths.includes(f) || dirs.some((d) => d === "" || f.startsWith(`${d}/`)));
  }
  const out = [];
  for (const file of files) {
    const abs = join(root, file);
    if (!existsSync(abs)) continue;
    const sites = scanSource(file, readFileSync(abs, "utf8"));
    if (sites.length) out.push({ key: `${RULE}|${file}`, file, sites });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

export function main(argv = process.argv.slice(2), env = process.env, root = ROOT) {
  if (argv.includes("--self-test")) return selfTest();
  const paths = narrowed(argv, env, root);
  const found = collect({ root, paths });
  for (const f of found) {
    emitItem({ key: f.key, status: "new", title: `${f.sites.length} × bare fill of a secret`, file: f.file, line: f.sites[0].line, rule: RULE });
  }
  if (!paths) endItems();
  for (const f of found) {
    for (const s of f.sites.slice(0, 5)) console.log(`  NEW ${f.file}:${s.line}  ${s.call}\n      fix: ${FIX}`);
  }
  console.log(`${TAG} ${found.length} item(s)${paths ? " (narrowed scan)" : ""}`);
  return argv.includes("--strict") && found.length ? 1 : 0;
}

/** Proves the census fires on a planted bare fill and stays quiet on fillSecret. */
function selfTest() {
  const dir = mkdtempSync(join(tmpdir(), "fill-secret-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: dir });
    mkdirSync(join(dir, "scripts"));
    mkdirSync(join(dir, "e2e"));
    const plant = {
      "scripts/bare-page.mjs": 'await page.fill("#password", process.env.AI_ADMIN_PASSWORD);\n',
      "scripts/bare-locator.mjs": 'await page.locator("#pw").fill(\n  token,\n);\n',
      "e2e/bare-type.ts": "await page.type('#x', apiSecret);\n",
      "scripts/clean-page.mjs": 'await fillSecret(page, "#password", process.env.AI_ADMIN_PASSWORD);\n',
      "scripts/clean-locator.mjs": 'await fillSecret(page.locator("#password"), undefined, PASSWORD);\n',
      "scripts/clean-email.mjs": 'await page.fill("#email", email);\n',
    };
    for (const [name, text] of Object.entries(plant)) writeFileSync(join(dir, name), text);
    const keys = collect({ root: dir }).map((f) => f.key);
    const want = [`${RULE}|e2e/bare-type.ts`, `${RULE}|scripts/bare-locator.mjs`, `${RULE}|scripts/bare-page.mjs`];
    const ok = JSON.stringify(keys) === JSON.stringify(want);
    console.log(`${TAG} self-test ${ok ? "PASS" : "FAIL"}: ${JSON.stringify(keys)}`);
    return ok ? 0 : 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
