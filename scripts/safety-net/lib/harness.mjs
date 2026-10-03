// scripts/safety-net/lib/harness.mjs — LANE SAFETY-NET (2026-10-01)
//
// THE ONE HARNESS EVERY SAFETY-NET WALK USES. A walk is a chain of STEPS; each step names the
// coverage items (common-docs/projects/data-doctrine-adoption/v5/SAFETY-NET-COVERAGE.md, ids like
// T05, S09, C04) it proves, takes a screenshot, and records PASS / FAIL / SKIP with a plain detail.
//
// Run a walk only through the runner (`node scripts/safety-net/run.mjs --target live|clone`), which
// sets SN_TARGET, SN_ORIGIN, SN_OUT and the seats. Running a walk file directly works too:
//   SN_TARGET=clone SN_ORIGIN=http://safety-net.localhost:3001 node scripts/safety-net/walks/<walk>.mjs
//
// RULES BAKED IN (the lane brief, 2026-10-01):
// - Seats are admin@admin.com and test@test.com only; credentials come from .env.local / aidream/.env
//   and are never printed.
// - Fixtures are disposable, realistic, made through the product in Cedar Ridge Physical Therapy
//   (or admin's Workspace), carry the run stamp in their name, and are ARCHIVED at the end
//   (`ctx.cleanup(fn)` runs in reverse order, even when a step failed).
// - Never Arman's account, organization 3e790542-… or table c1aabdc0-…: `ctx.goto` refuses any URL
//   that names them.
// - A step that cannot run is SKIP with the reason — never a pass.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";

import { setOrganization as seatSetOrganization, signIn, sleep, until } from "../../lib/seat-browser.mjs";

export { sleep, until };

/**
 * PICK THE ORGANIZATION THE WAY A PERSON DOES (2026-10-01). Since 2026-09-30 the app chrome's ONE
 * organization control is the account rail's switcher (`[data-shell-org-switcher="rail"]`,
 * features/shell/components/account-rail/ShellOrgSwitcher.tsx); the sidebar group the shared
 * seat-browser opened is gone. Open the rail's popover first, then let seat-browser search, reveal
 * the test organizations and click the row. Returns true when the switcher then names `name`.
 */
export async function setOrganization(page, name) {
  // The trigger is a Radix popover: it opens on a real pointer press, never on element.click().
  // When nothing is chosen yet the "pick an organization" notice draws its own picker and sits over
  // the shell, so the press may be intercepted; seat-browser then types into the notice's picker.
  const visiblePicker = () =>
    page.evaluate(() => [...document.querySelectorAll('input[data-slot="organization-picker-search"]')].some((e) => e.offsetParent !== null)).catch(() => false);
  if (!(await visiblePicker())) {
    for (const sel of ['[data-shell-org-switcher="rail"]', '[data-shell-org-switcher="drawer"]']) {
      const loc = page.locator(sel).first();
      if (!(await loc.count().catch(() => 0))) continue;
      await loc.click({ timeout: 5000 }).catch(() => loc.click({ timeout: 5000, force: true }).catch(() => {}));
      await sleep(1200);
      if (await visiblePicker()) break;
    }
  }
  await seatSetOrganization(page, name);
  await sleep(1500);
  return page
    .evaluate((n) => {
      const b = document.querySelector('[data-shell-org-switcher="rail"]') ?? document.querySelector('[data-shell-org-switcher="drawer"]');
      return (b?.getAttribute("aria-label") ?? b?.textContent ?? "").includes(n);
    }, name)
    .catch(() => false);
}

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = resolve(HERE, "../../..");
export const TARGET = process.env.SN_TARGET ?? "clone";
export const ORIGIN =
  process.env.SN_ORIGIN ?? (TARGET === "live" ? "https://www.aimatrx.com" : "http://safety-net.localhost:3001");
export const MANAGE_ORIGIN =
  process.env.SN_MANAGE_ORIGIN ?? (TARGET === "live" ? "https://manage.aimatrx.com" : ORIGIN);
export const OUT = process.env.SN_OUT ?? join(REPO, "..", "common-docs/operations/for-arman/2026-10-01/safety-net/adhoc");
/** A short stamp that marks every fixture this run makes, e.g. "Oct 1 0214". */
export const STAMP =
  process.env.SN_STAMP ??
  new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Los_Angeles" }).replace(/[,:]/g, "").replace(/\s+/g, " ");
export const FIXTURE_ORG = process.env.SN_FIXTURE_ORG ?? "Cedar Ridge Physical Therapy";
export const FIXTURE_ORG_ID = "0a54df90-eab8-4d07-ab29-81a45fb41e04";

const FORBIDDEN = ["3e790542-fdaf-40b2-8bf3-658bf94fe67f", "c1aabdc0-4d94-42d4-9ddc-91b68ef9c0a7"];

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^"|"$/g, "");
  }
  return out;
}
const ENV = { ...readEnvFile(join(REPO, "../aidream/.env")), ...readEnvFile(join(REPO, ".env.local")), ...process.env };

export const SEATS = {
  admin: { email: ENV.AI_ADMIN_USERNAME ?? "admin@admin.com", password: ENV.AI_ADMIN_PASSWORD },
  member: { email: ENV.AI_MEMBER_USERNAME ?? "test@test.com", password: ENV.AI_MEMBER_PASSWORD },
};
for (const [k, s] of Object.entries(SEATS)) {
  if (!["admin@admin.com", "test@test.com"].includes(s.email)) throw new Error(`seat ${k} resolves to an account this lane may not use`);
}

/**
 * Open a walk. Returns ctx with: page(seat) → a signed-in page for that seat; step(); shot();
 * cleanup(); goto(); finish(). Console errors and 5xx/4xx responses are recorded per seat.
 */
export async function openWalk(name, { headless = true } = {}) {
  // A clone walk on the local preview must find the preview serving the clone (it switches modes).
  if (TARGET === "clone" && /localhost/.test(ORIGIN)) {
    const r = spawnSync("bash", [join(REPO, "scripts/agent-dev-server.sh"), "status"], { encoding: "utf8", cwd: REPO });
    const mode = (`${r.stdout}${r.stderr}`.match(/mode=(\w+)/) ?? [])[1];
    if (mode !== "clone") throw new Error(`refused: the preview is ${mode ? `in ${mode} mode` : "not running"}; a clone walk would ${mode === "live" ? "write to production" : "find nothing"} (pnpm preview:start)`);
  }
  const shotsDir = join(OUT, "shots");
  mkdirSync(shotsDir, { recursive: true });
  const browser = await chromium.launch({ headless });
  const results = [];
  const cleanups = [];
  const pages = {};
  const errors = { console: [], http: [] };
  let n = 0;

  async function resumeDevWalk(page) {
    if (ORIGIN.includes("aimatrx.com")) return;
    await page.goto(`${ORIGIN}/login`, { waitUntil: "domcontentloaded", timeout: 300000 }).catch(() => {});
    await page
      .evaluate(async () => {
        const body = new FormData();
        body.set("returnTo", "/login");
        return (await fetch("/__dev-walk", { method: "POST", body, redirect: "manual" })).status;
      })
      .catch(() => null);
    if (page.url().includes("__dev-walk")) await page.getByRole("button", { name: /Resume/ }).first().click().catch(() => {});
    await sleep(3000);
  }

  const ctx = {
    name,
    target: TARGET,
    origin: ORIGIN,
    manageOrigin: MANAGE_ORIGIN,
    stamp: STAMP,
    out: OUT,
    errors,
    results,
    /** A signed-in page for `admin` or `member`, working in `org` (default the fixture org). */
    async page(seat = "admin", { org = FIXTURE_ORG, width = 1600, height = 1000, colorScheme = "light", fresh = false } = {}) {
      const key = `${seat}|${width}|${colorScheme}`;
      if (pages[key] && !fresh) return pages[key];
      const s = SEATS[seat];
      if (!s?.password) throw new Error(`no password for seat ${seat} in .env.local / aidream/.env`);
      const context = await browser.newContext({ viewport: { width, height }, colorScheme });
      await installIntercepts(context);
      if (process.env.SN_INJECT_CSS) {
        await context.addInitScript((css) => {
          const add = () => {
            const st = document.createElement("style");
            st.setAttribute("data-safety-net-plant", "");
            st.textContent = css;
            document.documentElement.appendChild(st);
          };
          if (document.documentElement) add();
          else document.addEventListener("DOMContentLoaded", add);
        }, process.env.SN_INJECT_CSS);
      }
      const page = await context.newPage();
      page.on("console", (m) => {
        if (m.type() === "error") errors.console.push({ seat, url: page.url(), text: m.text().slice(0, 300) });
      });
      page.on("response", (r) => {
        const st = r.status();
        if (st >= 400 && !/\/_next\/|favicon|\.map$|__nextjs/.test(r.url())) errors.http.push({ seat, status: st, url: r.url().slice(0, 200), page: page.url() });
      });
      await resumeDevWalk(page);
      const who = await signIn(page, ORIGIN, s.email, s.password, seat);
      if (who !== s.email) throw new Error(`signed in as ${who}, expected ${s.email}`);
      page.__seat = seat;
      if (org) {
        await page.goto(`${ORIGIN}/data-v2`, { waitUntil: "domcontentloaded", timeout: 180000 });
        await sleep(2500);
        const ok = await setOrganization(page, org).catch((e) => {
          console.log(`[harness] could not pick ${org}: ${String(e).slice(0, 160)}`);
          return false;
        });
        page.__org = ok ? org : null;
        if (!ok) console.log(`[harness] ${seat}: the switcher does not name ${org} after picking`);
      }
      pages[key] = page;
      return page;
    },
    /**
     * A SIGNED-OUT page (MAKE-HOME W5): a stranger opening a link somebody sent — a public form, a
     * booking page. No sign-in, no organization; the same intercepts and injected CSS as every page.
     */
    async anonPage({ width = 390, height = 844, colorScheme = "light" } = {}) {
      const context = await browser.newContext({ viewport: { width, height }, colorScheme });
      await installIntercepts(context);
      if (process.env.SN_INJECT_CSS) {
        await context.addInitScript((css) => {
          const add = () => {
            const st = document.createElement("style");
            st.setAttribute("data-safety-net-plant", "");
            st.textContent = css;
            document.documentElement.appendChild(st);
          };
          if (document.documentElement) add();
          else document.addEventListener("DOMContentLoaded", add);
        }, process.env.SN_INJECT_CSS);
      }
      const page = await context.newPage();
      page.on("console", (m) => {
        if (m.type() === "error") errors.console.push({ seat: "stranger", url: page.url(), text: m.text().slice(0, 300) });
      });
      page.__seat = "stranger";
      return page;
    },
    /** Navigate, refusing Arman's own organization or table by id. */
    async goto(page, pathOrUrl, opts = {}) {
      const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${ORIGIN}${pathOrUrl}`;
      if (FORBIDDEN.some((f) => url.includes(f))) throw new Error(`refused: ${url} names Arman's own organization or table`);
      // The shared preview recompiles under other agents' edits: an aborted load is retried, said.
      for (let attempt = 1; ; attempt += 1) {
        try {
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000, ...opts });
          break;
        } catch (e) {
          if (attempt >= 3 || !/ERR_ABORTED|interrupted|frame was detached/i.test(String(e))) throw e;
          console.log(`[harness] ${url} load aborted (attempt ${attempt}); retrying`);
          await sleep(3000);
        }
      }
      if (!ORIGIN.includes("aimatrx.com")) {
        const resume = page.getByRole("button", { name: /Resume/ });
        if (await resume.count().catch(() => 0)) await resume.first().click().catch(() => {});
      }
      return page;
    },
    async shot(page, label) {
      if (!page) return null;
      n += 1;
      const file = `${name}-${String(n).padStart(2, "0")}-${label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;
      await page.screenshot({ path: join(shotsDir, file), fullPage: false }).catch(() => null);
      return `shots/${file}`;
    },
    /**
     * One step. `items` = coverage ids. `fn` returns { ok: boolean, detail: string, skip?: string }.
     * A throw is a FAIL with the message. A screenshot of `page` is taken after the step.
     */
    async step(items, label, page, fn) {
      const t0 = Date.now();
      let r;
      try {
        r = await fn();
      } catch (e) {
        r = { ok: false, detail: `threw: ${String(e?.message ?? e).slice(0, 400)}` };
      }
      const shot = page ? await ctx.shot(page, label) : null;
      const status = r?.skip ? "SKIP" : r?.ok ? "PASS" : "FAIL";
      const row = { walk: name, items: [].concat(items), step: label, status, detail: r?.skip ?? r?.detail ?? "", ms: Date.now() - t0, shot };
      results.push(row);
      console.log(`${status} [${row.items.join(",")}] ${label} — ${row.detail}`);
      return r;
    },
    cleanup(fn) {
      cleanups.push(fn);
    },
    async finish() {
      for (const fn of cleanups.reverse()) {
        try {
          await fn();
        } catch (e) {
          console.log(`[harness] cleanup failed: ${String(e).slice(0, 200)}`);
          results.push({ walk: name, items: [], step: "cleanup", status: "FAIL", detail: `cleanup failed: ${String(e).slice(0, 200)}`, ms: 0, shot: null });
        }
      }
      await browser.close().catch(() => {});
      const file = join(OUT, `${name}.json`);
      writeFileSync(file, JSON.stringify({ walk: name, target: TARGET, origin: ORIGIN, stamp: STAMP, results, errors, intercepts: interceptHits }, null, 2));
      if (INTERCEPTS.length && !interceptHits.length) console.log(`[harness] 🚨 an intercept plant was set but never fired — this run proves nothing about it`);
      const failed = results.filter((r) => r.status === "FAIL").length;
      console.log(`[harness] ${name}: ${results.filter((r) => r.status === "PASS").length} pass, ${failed} fail, ${results.filter((r) => r.status === "SKIP").length} skip → ${file}`);
      process.exitCode = failed ? 1 : 0;
      return failed;
    },
  };
  return ctx;
}

/**
 * INTERCEPT PLANTS (mode "intercept"): a break planted at the network boundary of THIS test browser
 * only — nothing on any server or database changes, so it is safe on live and on the clone. The runner
 * passes the plant's rules as SN_INTERCEPT (JSON array). Each rule: { match: "<url regex>",
 * method?: "POST", action: "status" | "drop" | "fake-ok" | "abort" | "rewrite", status?, keep?, body?,
 * from?, to? }.
 *   status  — answer with that status and a refusal body, the request never reaches the server
 *   drop    — let it through, then keep only the first `keep` (default 0) items of a JSON array answer
 *   fake-ok — answer 200 with `body` (default "null") WITHOUT sending: a write that claims success
 *   abort   — the request fails at the network
 *   rewrite — let it through, then replace the text `from` with `to` in the answer
 *   delay   — hold the request `ms` (default 3000) before it goes (a slow door)
 * SN_INJECT_CSS (a plant's `css`) is added to every page this walk opens (a layout fault).
 * Every interception is logged, so a red run shows the fault actually fired.
 */
export const INTERCEPTS = (() => {
  try {
    return JSON.parse(process.env.SN_INTERCEPT ?? "[]");
  } catch {
    throw new Error("SN_INTERCEPT is not JSON");
  }
})();
export const interceptHits = [];
async function installIntercepts(context) {
  for (const rule of INTERCEPTS) {
    const re = new RegExp(rule.match);
    // A route callback still running when the browser closes rejects; swallow it (said once) so the
    // walk's own result stands — an unhandled rejection here used to crash node and grade every item FAIL.
    await context.route(re, (route) => handle(route).catch((e) => {
      if (!/closed|Target page|has been closed/i.test(String(e))) console.log(`[harness] intercept handler error: ${String(e).slice(0, 160)}`);
    }));
    async function handle(route) {
      const req = route.request();
      if (rule.method && req.method() !== rule.method) return route.continue();
      interceptHits.push({ rule: rule.match, action: rule.action, url: req.url().slice(0, 160) });
      console.log(`[harness] PLANT intercept ${rule.action} ${req.method()} ${req.url().slice(0, 120)}`);
      if (rule.action === "abort") return route.abort();
      if (rule.action === "delay") {
        await sleep(rule.ms ?? 3000);
        return route.continue();
      }
      if (rule.action === "status")
        return route.fulfill({ status: rule.status ?? 500, contentType: "application/json", body: JSON.stringify({ message: "planted by safety-net", code: "SNPLANT" }) });
      if (rule.action === "fake-ok") return route.fulfill({ status: 200, contentType: "application/json", body: rule.body ?? "null" });
      const res = await route.fetch();
      let body = await res.text();
      if (rule.action === "drop") {
        try {
          const j = JSON.parse(body);
          if (Array.isArray(j)) body = JSON.stringify(j.slice(0, rule.keep ?? 0));
        } catch {}
      }
      if (rule.action === "rewrite") body = body.split(rule.from).join(rule.to);
      return route.fulfill({ response: res, body });
    }
  }
}

/**
 * ONE READ-ONLY QUERY ON THE CLONE, the safe way (W31): the clone's SESSION pooler (5432, a disconnect
 * ends the backend), `begin read only … rollback` with ON_ERROR_STOP=0 so the rollback always runs, and
 * an idle-in-transaction timeout as a backstop. Returns the result lines (command tags removed), or
 * null when the clone is not configured / the query errored. Never use it on live; walks read live
 * through the product only.
 */
export function cloneRead(sql) {
  const f = join(REPO, ".env.local");
  const m = existsSync(f) ? readFileSync(f, "utf8").match(/^CLONE_DATABASE_URL=(.*)$/m) : null;
  const psql = ["/opt/homebrew/opt/libpq/bin/psql", "/opt/homebrew/opt/postgresql@17/bin/psql"].find(existsSync);
  if (!m || !psql) return null;
  const dsn = m[1].replace(/^"|"$/g, "").replace(/:6543\//, ":5432/");
  const body = `begin read only;\nset local statement_timeout = '60s';\nset local idle_in_transaction_session_timeout = '90s';\n${sql};\nrollback;\n`;
  const r = spawnSync(psql, [dsn, "-X", "-At", "-F", "|", "-v", "ON_ERROR_STOP=0", "-f", "-"], { input: body, encoding: "utf8", timeout: 90000, env: { ...process.env, PGAPPNAME: "safety-net-clone-read" } });
  if (/\bERROR:/.test(r.stderr ?? "")) return null;
  return (r.stdout ?? "").split("\n").filter((l) => l && !["BEGIN", "SET", "ROLLBACK", "COMMIT"].includes(l)).join("\n").trim();
}

/** Wait until `fn` (run in the page) returns truthy; returns the value or null. */
export async function pageUntil(page, fn, arg, timeoutMs = 30000) {
  const r = await until("page condition", () => page.evaluate(fn, arg), timeoutMs);
  return r.v;
}

/** The visible text of the page body, trimmed to `max` characters. */
export async function bodyText(page, max = 20000) {
  return (await page.evaluate(() => document.body.innerText).catch(() => "")).slice(0, max);
}
