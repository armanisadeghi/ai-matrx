// scripts/safety-net/walks/platform.mjs — LANE SAFETY-NET, items P01–P09 (read-only; creates nothing).
//
// Sign-in, organization switch, the key pages for both seats with every 5xx and console error
// recorded, 390 px light + dark, and three timings against budgets:
//   P07 data home: navigation → Tables listing settled ≤ 1000 ms (Arman's budget)
//   P08 table page: navigation → first grid row ≤ 3000 ms (this lane's budget, stated)
//   P09 scope tree: navigation → first scope link/tree item ≤ 3000 ms (this lane's budget, stated)
// On the clone preview a first visit includes the dev server's compile, so each timing is the
// SECOND visit there (said in the detail). On live it is the first warm visit after one priming load.
import { openWalk, bodyText, until, sleep, setOrganization, TARGET } from "../lib/harness.mjs";

// Cedar Ridge Physical Therapy's "Patients" table (made 2026-09-28; on live and on the 09-29 clone).
const TABLE = process.env.SN_PLATFORM_TABLE ?? "6d3b427c-f272-4118-8f14-3f431c78c75c";
const BUDGET = { P07: 1000, P08: 3000, P09: 3000 };

const ctx = await openWalk("platform");
const appPages = ["/data-v2", `/data-v2/${TABLE}`, "/lists/v3", "/trash", "/scopes", "/notes", "/tasks", "/chat", "/schedules"];
const adminPages = ["/administration/usage", "/administration/database/final-switch"];

async function visit(page, path, origin = ctx.origin) {
  const t0 = Date.now();
  let status = null;
  try {
    await ctx.goto(page, `${origin}${path}`);
    status = 200;
  } catch (e) {
    return { path, status: "error", ms: Date.now() - t0, err: String(e).slice(0, 160) };
  }
  await until("settled", async () => !/^\s*$/.test(await bodyText(page, 200)), 30000);
  await sleep(2500);
  return { path, status, ms: Date.now() - t0 };
}

async function timeTo(page, url, predicate, label) {
  const once = async () => {
    const t0 = Date.now();
    await ctx.goto(page, url, { waitUntil: "commit" });
    const r = await until(label, () => page.evaluate(predicate), 60000);
    return r.v ? Date.now() - t0 : null;
  };
  try {
    const first = await once();
    const second = await once();
    return { first, second, used: second ?? first };
  } catch (e) {
    return { first: null, second: null, used: null, err: String(e).slice(0, 160) };
  }
}

try {
  // ── P01 sign-in (the harness signs in through /login and checks /api/whoami) ─────────────────
  let admin;
  await ctx.step(["P01"], "admin signs in through the login form", null, async () => {
    admin = await ctx.page("admin");
    return { ok: true, detail: `signed in as admin@admin.com, working in ${admin.__org ?? "(no organization picked)"}` };
  });
  let member;
  await ctx.step(["P01"], "member signs in through the login form", null, async () => {
    member = await ctx.page("member");
    return { ok: true, detail: `signed in as test@test.com, working in ${member.__org ?? "(no organization picked)"}` };
  });

  // ── P02 organization switch ────────────────────────────────────────────────────────────────
  await ctx.step(["P02"], "switch organization and back", admin, async () => {
    // "admin's Workspace" is the name of ~26 of admin's organizations, so the switch goes to a
    // uniquely named one and back.
    const a = await setOrganization(admin, "Harbor Dental Group");
    const b = await setOrganization(admin, "Cedar Ridge Physical Therapy");
    return { ok: a && b, detail: `to Harbor Dental Group: ${a ? "switcher names it" : "NOT named"}; back to Cedar Ridge: ${b ? "named" : "NOT named"}` };
  });

  // ── P03 / P04 key pages, both seats ────────────────────────────────────────────────────────
  const visits = [];
  for (const p of appPages) visits.push({ seat: "admin", ...(await visit(admin, p)) });
  for (const p of adminPages) visits.push({ seat: "admin", ...(await visit(admin, p, ctx.manageOrigin)) });
  for (const p of appPages.filter((x) => !["/schedules", "/chat"].includes(x))) visits.push({ seat: "member", ...(await visit(member, p)) });
  await ctx.shot(admin, "last-admin-page");
  const fives = ctx.errors.http.filter((e) => e.status >= 500);
  const navBad = visits.filter((v) => v.status === "error" || (typeof v.status === "number" && v.status >= 500));
  await ctx.step(["P03"], `no 500s across ${visits.length} page visits`, null, async () => ({
    ok: fives.length === 0 && navBad.length === 0,
    detail: fives.length || navBad.length
      ? `${fives.length} responses ≥ 500: ${fives.slice(0, 5).map((e) => `${e.status} ${e.url} (on ${e.page})`).join(" · ")}${navBad.length ? ` · navigation failed: ${navBad.map((v) => `${v.path} ${v.status} ${v.err ?? ""}`).join(", ")}` : ""}`
      : `0 responses ≥ 500; 4xx seen: ${ctx.errors.http.length}`,
  }));
  await ctx.step(["P04"], "no console errors on the key pages", null, async () => {
    const errs = ctx.errors.console;
    const distinct = [...new Map(errs.map((e) => [e.text.slice(0, 120), e])).values()];
    return {
      ok: errs.length === 0,
      detail: errs.length ? `${errs.length} console errors (${distinct.length} distinct): ${distinct.slice(0, 5).map((e) => `[${e.seat}] ${e.text.slice(0, 140)} @ ${e.url.replace(ctx.origin, "")}`).join(" · ")}` : "0 console errors",
    };
  });

  // ── P05 / P06 390 px light and dark ───────────────────────────────────────────────────────
  for (const [item, scheme] of [["P05", "light"], ["P06", "dark"]]) {
    let phone;
    try {
      phone = await ctx.page("admin", { width: 390, height: 844, colorScheme: scheme, fresh: true });
    } catch (e) {
      await ctx.step([item], `390 ${scheme}: sign in on a phone`, null, async () => ({ ok: false, detail: String(e).slice(0, 200) }));
      continue;
    }
    for (const path of ["/data-v2", `/data-v2/${TABLE}`]) {
      await ctx.step([item], `390 ${scheme}: ${path === "/data-v2" ? "data home" : "Patients table"} fits the screen`, phone, async () => {
        await ctx.goto(phone, `${ctx.origin}${path}`);
        await sleep(6000);
        const m = await phone.evaluate(() => ({
          sw: document.documentElement.scrollWidth,
          iw: window.innerWidth,
          dark: document.documentElement.classList.contains("dark") || matchMedia("(prefers-color-scheme: dark)").matches,
          words: document.body.innerText.length,
        }));
        const fits = m.sw <= m.iw + 1;
        return { ok: fits && m.words > 40 && (scheme === "light" || m.dark), detail: `page width ${m.sw} vs screen ${m.iw}; ${m.words} characters of text; dark=${m.dark}` };
      });
    }
  }

  // ── P07 / P08 / P09 timings ───────────────────────────────────────────────────────────────
  const home = await timeTo(
    admin,
    `${ctx.origin}/data-v2`,
    () => {
      const t = document.querySelector('[data-hub-listing-toggle="tables"]')?.textContent ?? "";
      return t && !/reading|loading/i.test(t);
    },
    "data home Tables listing",
  );
  await ctx.step(["P07"], `data home interactive ≤ ${BUDGET.P07} ms`, admin, async () => ({
    ok: home.used != null && home.used <= BUDGET.P07,
    detail: `first ${home.first} ms, second ${home.second} ms (used ${TARGET === "clone" ? "second: dev compile on the first" : "second, warm"})`,
  }));
  const table = await timeTo(
    admin,
    `${ctx.origin}/data-v2/${TABLE}`,
    () => document.querySelectorAll('[role="row"], tbody tr, [data-matrx-grid-row], [data-row-id]').length > 1,
    "first grid row",
  );
  await ctx.step(["P08"], `table page first rows ≤ ${BUDGET.P08} ms`, admin, async () => ({
    ok: table.used != null && table.used <= BUDGET.P08,
    detail: `first ${table.first} ms, second ${table.second} ms`,
  }));
  const tree = await timeTo(
    admin,
    `${ctx.origin}/scopes`,
    // The tree's own rows, inside the page's main region (the sidebar's static "/scopes" links do not count).
    () => {
      const main = document.querySelector("main, [role='main']") ?? document.body;
      const rows = [...main.querySelectorAll('[role="treeitem"], [role="tree"] a, a[href*="/scopes/"]')].filter((e) => !e.closest("nav, aside, #shell-sidebar, [data-shell-sidebar]"));
      return rows.length > 0;
    },
    "scope tree",
  );
  await ctx.step(["P09"], `scope tree ≤ ${BUDGET.P09} ms`, admin, async () => ({
    ok: tree.used != null && tree.used <= BUDGET.P09,
    detail: `first ${tree.first} ms, second ${tree.second} ms`,
  }));
} finally {
  await ctx.finish();
}
