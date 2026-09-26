#!/usr/bin/env node
/**
 * surface-probe — read a live surface's Surface Context window, the same way a
 * person checks it, and print the result as JSON.
 *
 * WHY: verifying a surface needs no dev server. Production (the release train
 * ships main about every 30 minutes) is already built, so a headless browser can
 * check a surface in ~40 s with ~1 GB of memory, where a local dev server needs
 * ~8 GB and a 3-4 minute compile per route (measured 2026-09-25 in a 15 GB cloud
 * container). This is the verifier half of the surface campaign
 * (`.claude/skills/surface-authoring/references/campaign-worker.md`).
 *
 * Usage:
 *   node scripts/surface-probe.mjs --surface matrx-user/artifacts \
 *     --route /artifacts --route /artifacts/<id> \
 *     [--fill 'input[placeholder="Search"]=>zzqq'] [--base https://aimatrx.com] \
 *     [--out result.json] [--shots dir] [--settle 8000]
 *
 *   --fill 'SELECTOR=>TEXT'  after the first read, type TEXT into SELECTOR on each
 *                         route where it exists, then read again ("after" block).
 *   --commit SHA          first confirm the deployment at --base contains SHA
 *                         (via /api/version + git ancestry). Exits 3, without
 *                         probing, when it does not yet — wait for the release
 *                         train and run again.
 *   --base                defaults to https://aimatrx.com. A local preview works
 *                         too: http://<session>.localhost:3001.
 *
 * Signs in with AI_ADMIN_USERNAME / AI_ADMIN_PASSWORD from the environment (the
 * sanctioned test identity) through the /login form, in a persistent profile so
 * later runs reuse the session. On a *.localhost base, sign in with
 * `pnpm dev-login` first, or pass --login-url with the URL it prints.
 *
 * Read-only: it never clicks a destructive control. Exit 0 when every route names
 * the surface and shows no undeclared keys; exit 1 otherwise; exit 2 on a setup
 * error (the message says what to fix); exit 3 when --commit is not deployed yet.
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);

function fail(message) {
  console.error(`[surface-probe] ${message}`);
  process.exit(2);
}

// ── args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const opts = { routes: [], fills: [], base: "https://aimatrx.com", settle: 8000 };
for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  const v = args[i + 1];
  if (a === "--surface") (opts.surface = v), (i += 1);
  else if (a === "--route") opts.routes.push(v), (i += 1);
  else if (a === "--fill") opts.fills.push(v), (i += 1);
  else if (a === "--base") (opts.base = v.replace(/\/$/, "")), (i += 1);
  else if (a === "--out") (opts.out = v), (i += 1);
  else if (a === "--shots") (opts.shots = v), (i += 1);
  else if (a === "--settle") (opts.settle = Number(v)), (i += 1);
  else if (a === "--login-url") (opts.loginUrl = v), (i += 1);
  else if (a === "--commit") (opts.commit = v), (i += 1);
  else fail(`unknown argument ${a} — see the header of scripts/surface-probe.mjs`);
}
if (!opts.surface || opts.routes.length === 0)
  fail("--surface <client/name> and at least one --route are required");

// ── is the commit deployed? ───────────────────────────────────────────────
if (opts.commit) {
  let deployed;
  try {
    const res = await fetch(`${opts.base}/api/version`, { redirect: "follow" });
    deployed = (await res.json()).commit;
  } catch (error) {
    fail(`could not read ${opts.base}/api/version: ${error?.message ?? error}`);
  }
  if (!deployed) fail(`${opts.base}/api/version reported no commit`);
  const git = (cmd) => execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  try {
    git(`git cat-file -e ${deployed}^{commit}`);
  } catch {
    try {
      git(`git fetch -q --depth=400 origin main`);
    } catch {
      /* ancestry check below reports it */
    }
  }
  try {
    git(`git cat-file -e ${opts.commit}^{commit}`);
  } catch {
    fail(`--commit ${opts.commit} is not a commit in this checkout — pull origin main, or check the SHA`);
  }
  let contains = false;
  try {
    execSync(`git merge-base --is-ancestor ${opts.commit} ${deployed}`, { stdio: "ignore" });
    contains = true;
  } catch {
    contains = false;
  }
  if (!contains) {
    console.log(JSON.stringify({ surface: opts.surface, base: opts.base, commit: opts.commit, deployedCommit: deployed, deployed: false }));
    console.error(`[surface-probe] ${opts.commit.slice(0, 8)} is not in the deployment yet (${deployed.slice(0, 8)}); run again after the next release.`);
    process.exit(3);
  }
}

// ── browser setup ─────────────────────────────────────────────────────────
let chromium;
try {
  ({ chromium } = require("playwright-core"));
} catch {
  fail("playwright-core is not installed — run `pnpm install --frozen-lockfile` in this checkout");
}

const executablePath = ["/opt/pw-browsers/chromium", process.env.SURFACE_PROBE_CHROMIUM]
  .filter(Boolean)
  .find((p) => existsSync(p));

const isLocal = /\.localhost(:\d+)?$|\/\/localhost(:\d+)?$|127\.0\.0\.1/.test(opts.base);
const launchArgs = ["--no-sandbox"];
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
if (proxy) {
  launchArgs.push(`--proxy-server=${proxy}`);
  launchArgs.push("--proxy-bypass-list=<local>;*.localhost;localhost;127.0.0.1");
}
// Trust the egress proxy's CA by pinned key hash — never a blanket TLS disable
// (docs/official/browser-testing.md, "From a private worktree" step 3).
const caBundle = "/root/.ccr/ca-bundle.crt";
if (existsSync(caBundle)) {
  try {
    const pems = readFileSync(caBundle, "utf8").match(
      /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g,
    ) ?? [];
    const hashes = [];
    for (const pem of pems) {
      try {
        hashes.push(
          execSync(
            "openssl x509 -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | openssl base64",
            { input: pem, encoding: "utf8", shell: "/bin/bash", stdio: ["pipe", "pipe", "ignore"] },
          ).trim(),
        );
      } catch {
        /* a certificate openssl cannot read is skipped */
      }
    }
    if (hashes.length) launchArgs.push(`--ignore-certificate-errors-spki-list=${hashes.join(",")}`);
  } catch {
    console.error("[surface-probe] could not derive CA key hashes; continuing without them");
  }
}

const host = new URL(opts.base).host.replace(/[^a-z0-9.-]/gi, "_");
const profileDir = path.join(os.tmpdir(), "surface-probe-profiles", host);
mkdirSync(profileDir, { recursive: true });
if (opts.shots) mkdirSync(opts.shots, { recursive: true });

// ── page helpers (functions passed to page.evaluate run in the browser) ───
async function pointerClick(page, selector, textPrefix) {
  return page.evaluate(
    ([sel, prefix]) => {
      const els = Array.from(document.querySelectorAll(sel));
      const el = prefix
        ? els.find((e) => {
            const t = (e.textContent || "").trim();
            return t.startsWith(prefix) && !t.startsWith(`${prefix} Admin`);
          })
        : els[0];
      if (!el) return false;
      // Radix triggers ignore element.click(): send the whole pointer sequence.
      for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
        const Ctor = type.startsWith("pointer") ? PointerEvent : MouseEvent;
        el.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true }));
      }
      return true;
    },
    [selector, textPrefix ?? null],
  );
}

async function readProbe(page) {
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll("button[data-row-id]")).filter((r) =>
      r.querySelector("code"),
    );
    const supplied = [];
    const suppliedEmpty = [];
    const absent = [];
    const undeclared = [];
    const heading = Array.from(document.querySelectorAll("div")).find(
      (d) => (d.textContent || "").trim() === "Undeclared (runtime only)",
    );
    for (const row of rows) {
      const name = row.dataset.rowId;
      const dot = row.querySelector("[title]");
      const state = dot ? dot.getAttribute("title") : null;
      if (state === "Supplied") supplied.push(name);
      else if (state === "Supplied, empty") suppliedEmpty.push(name);
      else absent.push(name);
      if (heading && heading.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING)
        undeclared.push(name);
    }
    const footer = Array.from(document.querySelectorAll("div,span"))
      .filter((d) => /\d+\s*\/\s*\d+\s*supplied/.test(d.textContent || "") && (d.textContent || "").length < 300)
      .pop();
    return {
      counter: footer ? footer.textContent.replace(/\s+/g, " ").trim() : null,
      supplied,
      suppliedEmpty,
      absent,
      undeclared,
    };
  });
}

async function shot(page, name) {
  if (!opts.shots) return;
  try {
    await page.screenshot({ path: path.join(opts.shots, `${name}.png`), animations: "disabled", timeout: 20000 });
  } catch {
    /* screenshots time out on spinners; never fatal */
  }
}

// ── run ───────────────────────────────────────────────────────────────────
const t0 = Date.now();
const context = await chromium.launchPersistentContext(profileDir, {
  headless: true,
  viewport: { width: 1500, height: 950 },
  args: launchArgs,
  ...(executablePath ? { executablePath } : {}),
});
const page = context.pages()[0] ?? (await context.newPage());
const results = [];
let exitCode = 0;

try {
  if (opts.loginUrl) {
    await page.goto(opts.loginUrl, { timeout: 600000 });
    await page.waitForTimeout(5000);
  } else if (!isLocal) {
    await page.goto(`${opts.base}/login`, { timeout: 120000 });
    await page.waitForTimeout(4000);
    // After a first sign-in, /login renders the app shell: the email field's
    // ABSENCE is the signed-in signal, not the URL.
    if (await page.locator('input[type="email"]').count()) {
      const user = process.env.AI_ADMIN_USERNAME;
      const pass = process.env.AI_ADMIN_PASSWORD;
      if (!user || !pass) fail("AI_ADMIN_USERNAME / AI_ADMIN_PASSWORD are not set in the environment");
      await page.fill('input[type="email"]', user);
      await page.fill('input[type="password"]', pass);
      await page.evaluate(() => document.querySelector("form")?.requestSubmit());
      await page.waitForTimeout(8000);
    }
  }

  for (const [index, route] of opts.routes.entries()) {
    const result = { route, errors: [] };
    try {
      await page.goto(`${opts.base}${route}`, { timeout: 600000 });
      await page.waitForTimeout(opts.settle);
      result.finalUrl = page.url().replace(/\?.*$/, "");
      result.signedIn = (await page.locator('input[type="email"]').count()) === 0;

      if (!(await pointerClick(page, '[aria-label="Agents for this page"]')))
        result.errors.push('header button "Agents for this page" not found');
      await page.waitForTimeout(2500);
      const popover = await page.evaluate(() =>
        Array.from(document.querySelectorAll("[data-radix-popper-content-wrapper]"))
          .map((d) => d.textContent || "")
          .join(" "),
      );
      result.surfaceNamed = popover.includes(opts.surface);
      if (!(await pointerClick(page, "[data-radix-popper-content-wrapper] button", "Surface Context")))
        result.errors.push('"Surface Context" not found in the Agents popover');
      await page.waitForTimeout(4000);
      result.before = await readProbe(page);
      await shot(page, `${index}-before`);

      if (opts.fills.length) {
        const applied = [];
        for (const fill of opts.fills) {
          const sep = fill.indexOf("=>");
          if (sep < 0) fail(`--fill needs SELECTOR=>TEXT, got ${fill}`);
          const selector = fill.slice(0, sep);
          const text = fill.slice(sep + 2);
          if (await page.locator(selector).count()) {
            await page.fill(selector, text);
            applied.push(fill);
          }
        }
        if (applied.length) {
          await page.waitForTimeout(1500);
          result.applied = applied;
          result.after = await readProbe(page);
          await shot(page, `${index}-after`);
        }
      }

      // The canonical right-click menu must open on the page body.
      await page.keyboard.press("Escape");
      const menu = await page.evaluate(() => {
        const target =
          document.querySelector("main [data-surface-value]") || document.querySelector("main") || document.body;
        const r = target.getBoundingClientRect();
        target.dispatchEvent(
          new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2, clientX: r.left + 30, clientY: r.top + 30 }),
        );
        return true;
      });
      await page.waitForTimeout(2000);
      const menuText = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[role="menu"]')).map((m) => m.textContent || "").join(" "),
      );
      result.menuOpened = menu && menuText.length > 0;
      result.menuDiagnostics = /INERT MENU|VALUE MAPPING GAP/.test(menuText);
      await page.keyboard.press("Escape");
    } catch (error) {
      result.errors.push(String(error?.message ?? error).slice(0, 300));
    }
    const undeclared = [...(result.before?.undeclared ?? []), ...(result.after?.undeclared ?? [])];
    result.pass = Boolean(result.signedIn && result.surfaceNamed && undeclared.length === 0 && result.errors.length === 0);
    if (!result.pass) exitCode = 1;
    results.push(result);
  }
} finally {
  await context.close();
}

const report = { surface: opts.surface, base: opts.base, seconds: Math.round((Date.now() - t0) / 1000), results };
const json = JSON.stringify(report, null, 2);
if (opts.out) writeFileSync(opts.out, json);
console.log(json);
process.exit(exitCode);
