#!/usr/bin/env node
// check-matrx-lockfile — EVERY @ai-matrx VERSION THE LOCKFILE NAMES IS ACTUALLY SERVED BY NPM.
//
// THE DEFECT THIS EXISTS FOR (2026-10-05)
// ---------------------------------------
// pnpm-lock.yaml was bumped to @ai-matrx/agents 0.45.1 while npm still answered 404 for its
// tarball (a publish prints "+" long before the CDN serves the bytes; @ai-matrx/design-system
// 0.66.x took ~40 minutes). `pnpm install --frozen-lockfile` then failed half-way and left
// node_modules WITHOUT @ai-matrx/design-system and @ai-matrx/agents, while the app code that
// needed 0.66.x shipped in release-all v0.4.2868. `check:matrx-packages` compares VERSIONS
// (installed vs npm `latest`) — it never asks whether the version the LOCKFILE names can be
// downloaded by the next person, CI or Vercel. This does: one HEAD per locked version.
//
// MODES
//   node scripts/check-matrx-lockfile.mjs                     # every locked version answers 200
//   node scripts/check-matrx-lockfile.mjs --lockfile <path>   # audit another lockfile
//   node scripts/check-matrx-lockfile.mjs --await-latest [--max-wait-minutes N]
//       THE SAFE UPDATE PATH (run by `pnpm sync:matrx-packages` BEFORE `pnpm update` touches the
//       lockfile): every @ai-matrx package this repo declares or locks — npm's `latest` tarball
//       must answer 200. Polls until it does (default 10 min, AWAIT_MAX_MINUTES). Still 404 →
//       exit 1, so the `&&` chain never reaches `pnpm update` and node_modules is never
//       half-uninstalled by a version nobody can download.
//   node scripts/check-matrx-lockfile.mjs --self-test         # RED on a planted 404 fixture, GREEN on a served one
//
// Exit codes: 0 every tarball served · 1 a version is not served (named, with its HTTP status)
//             · 2 UNMEASURED (the registry could not be reached at all) — never a quiet green.

import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { emitItem, endItems } from "./checks/items.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = "https://registry.npmjs.org";
const SCOPE = "@ai-matrx/";
const CONCURRENCY = 8;
const REQUEST_TIMEOUT_MS = 15_000;
// How long the safe update path waits for npm's CDN before refusing to touch the lockfile.
// Long enough for a normal propagation (seconds to a few minutes); a stuck one (the 40-minute
// 2026-10-05 case) is refused instead of blocking sync-main for the whole window.
// Review 2026-11-05 (agent-chosen starting value).
export const AWAIT_MAX_MINUTES = 10;
const AWAIT_POLL_SECONDS = 20;

/** Every distinct `@ai-matrx/<name>@<version>` a pnpm lockfile resolves. */
export function lockedVersions(text) {
  const out = new Map();
  const re = /^\s+'?(@ai-matrx\/[a-z0-9._-]+)@(\d[^('":\s]*)/gm;
  let m;
  while ((m = re.exec(text))) out.set(`${m[1]}@${m[2]}`, { name: m[1], version: m[2] });
  return [...out.values()];
}

export function tarballUrl(name, version) {
  const bare = name.slice(SCOPE.length);
  return `${REGISTRY}/${name}/-/${bare}-${version}.tgz`;
}

async function headStatus(url) {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    return res.status;
  } catch (err) {
    return `network: ${err?.cause?.code ?? err?.name ?? err}`;
  }
}

async function pool(items, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}

/** [{ name, version, url, status }] for every entry. */
export async function probe(entries) {
  return pool(entries, async (e) => {
    const url = e.url ?? tarballUrl(e.name, e.version);
    return { ...e, url, status: await headStatus(url) };
  });
}

function verdict(results, what) {
  const bad = results.filter((r) => r.status !== 200);
  for (const r of bad) {
    if (typeof r.status === "string") continue;
    emitItem({
      key: `${r.name}@${r.version}`,
      title: `${r.name}@${r.version} is locked but npm answers HTTP ${r.status} for its tarball`,
      file: "pnpm-lock.yaml",
      unit: r.name,
      rule: "tarball-not-served",
    });
  }
  if (bad.every((r) => typeof r.status !== "string")) endItems();
  const unreachable = bad.length > 0 && bad.every((r) => typeof r.status === "string");
  if (!bad.length) {
    console.log(`[matrx-lockfile] OK — ${results.length} ${what} tarball(s) answer 200.`);
    return 0;
  }
  if (unreachable) {
    console.error(`[matrx-lockfile] UNMEASURED — the npm registry could not be reached (${bad[0].status}).`);
    return 2;
  }
  console.error(`[FAIL] [matrx-lockfile] ${bad.length} ${what} version(s) are NOT served by npm:`);
  for (const r of bad) console.error(`    ${r.name}@${r.version}  HTTP ${r.status}  ${r.url}`);
  console.error(
    `\n  A lockfile naming a version npm does not serve breaks \`pnpm install --frozen-lockfile\` for\n` +
      `  everyone (CI, Vercel, the next agent) and can leave node_modules half-uninstalled.\n` +
      `  Wait until the tarball answers 200, then \`pnpm sync:matrx-packages\` (it waits for you).\n` +
      `  Never commit app code that uses the new API before then.`,
  );
  return 1;
}

export async function checkLockfile(path) {
  if (!existsSync(path)) {
    console.error(`[matrx-lockfile] UNMEASURED — no lockfile at ${path}.`);
    return 2;
  }
  const entries = lockedVersions(readFileSync(path, "utf8"));
  if (!entries.length) {
    console.log(`[matrx-lockfile] OK — ${path} locks no @ai-matrx package.`);
    return 0;
  }
  return verdict(await probe(entries), "locked @ai-matrx");
}

/** Every @ai-matrx package name this repo declares (root manifest) or locks. */
function packageNames(root) {
  const names = new Set();
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  for (const section of ["dependencies", "devDependencies", "optionalDependencies"]) {
    for (const n of Object.keys(manifest[section] ?? {})) if (n.startsWith(SCOPE)) names.add(n);
  }
  const lock = join(root, "pnpm-lock.yaml");
  if (existsSync(lock)) for (const e of lockedVersions(readFileSync(lock, "utf8"))) names.add(e.name);
  return [...names].sort();
}

async function latestOf(name) {
  try {
    const res = await fetch(`${REGISTRY}/${name}`, {
      headers: { accept: "application/vnd.npm.install-v1+json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return { name, error: `packument HTTP ${res.status}` };
    const doc = await res.json();
    const version = doc["dist-tags"]?.latest;
    if (!version) return { name, error: "no latest dist-tag" };
    return { name, version, url: doc.versions?.[version]?.dist?.tarball ?? tarballUrl(name, version) };
  } catch (err) {
    return { name, error: `network: ${err?.cause?.code ?? err?.name ?? err}` };
  }
}

export async function awaitLatest(root, maxMinutes) {
  const names = packageNames(root);
  const deadline = Date.now() + maxMinutes * 60_000;
  for (let attempt = 1; ; attempt++) {
    const latest = await pool(names, latestOf);
    const errors = latest.filter((l) => l.error);
    const results = await probe(latest.filter((l) => !l.error));
    const bad = [
      ...errors.map((e) => ({ ...e, version: "?", status: e.error, url: `${REGISTRY}/${e.name}` })),
      ...results.filter((r) => r.status !== 200),
    ];
    if (!bad.length) {
      console.log(`[matrx-lockfile] npm latest is served for all ${names.length} @ai-matrx package(s) — safe to update.`);
      return 0;
    }
    if (Date.now() + AWAIT_POLL_SECONDS * 1000 > deadline) {
      console.error(
        `[FAIL] [matrx-lockfile] npm latest is still NOT served after ${maxMinutes} min — the lockfile was NOT touched:`,
      );
      for (const r of bad) console.error(`    ${r.name}@${r.version}  ${r.status}  ${r.url}`);
      console.error(`  Re-run \`pnpm sync:matrx-packages\` once the tarball answers 200.`);
      return 1;
    }
    console.log(
      `[matrx-lockfile] waiting for npm to serve ${bad.map((r) => `${r.name}@${r.version} (${r.status})`).join(", ")} — attempt ${attempt}, retry in ${AWAIT_POLL_SECONDS}s`,
    );
    await new Promise((r) => setTimeout(r, AWAIT_POLL_SECONDS * 1000));
  }
}

async function selfTest() {
  const failures = [];
  const dir = mkdtempSync(join(tmpdir(), "matrx-lockfile-"));
  try {
    // A real served version, read from this repo's own lockfile so the fixture never goes stale.
    const real = lockedVersions(readFileSync(join(REPO_ROOT, "pnpm-lock.yaml"), "utf8")).find((e) => e.name === "@ai-matrx/agents");
    if (!real) throw new Error("this repo's lockfile locks no @ai-matrx/agents to use as the served fixture");
    const fixture = (agentsVersion) =>
      `lockfileVersion: '9.0'\n\npackages:\n\n  '@ai-matrx/agents@${agentsVersion}':\n    resolution: {integrity: sha512-x}\n\nsnapshots:\n\n  '@ai-matrx/agents@${agentsVersion}(react@19.3.0)':\n    dependencies: {}\n`;
    const parsed = lockedVersions(fixture("0.45.1"));
    if (parsed.length !== 1 || parsed[0].version !== "0.45.1")
      failures.push(`PARSE: expected one @ai-matrx/agents@0.45.1 (peer suffix stripped), got ${JSON.stringify(parsed)}`);

    // RED: the 2026-10-05 shape — a lockfile naming a version npm answers 404 for.
    const red = join(dir, "red.yaml");
    writeFileSync(red, fixture("0.0.0-never-published"));
    const redCode = await checkLockfile(red);
    if (redCode === 2) throw new Error("registry unreachable — self-test UNMEASURED");
    if (redCode !== 1) failures.push(`RED: a 404 tarball fixture exited ${redCode}, expected 1`);

    // GREEN: the version this repo actually locks.
    const green = join(dir, "green.yaml");
    writeFileSync(green, fixture(real.version));
    const greenCode = await checkLockfile(green);
    if (greenCode !== 0) failures.push(`GREEN: served ${real.name}@${real.version} exited ${greenCode}, expected 0`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  if (failures.length) {
    console.error("check-matrx-lockfile --self-test FAILED:");
    for (const f of failures) console.error(`  - ${f}`);
    return 1;
  }
  console.log("check-matrx-lockfile --self-test OK — RED on a 404 tarball fixture, GREEN on a served version.");
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const arg = (flag) => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };
  let code;
  try {
    if (argv.includes("--self-test")) code = await selfTest();
    else if (argv.includes("--await-latest"))
      code = await awaitLatest(REPO_ROOT, Number(arg("--max-wait-minutes") ?? AWAIT_MAX_MINUTES));
    else code = await checkLockfile(resolve(arg("--lockfile") ?? join(REPO_ROOT, "pnpm-lock.yaml")));
  } catch (err) {
    console.error(`[matrx-lockfile] UNMEASURED — could not run: ${err?.stack ?? err}`);
    code = 2;
  }
  process.exitCode = code;
}
