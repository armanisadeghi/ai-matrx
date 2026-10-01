// scripts/safety-net/walks/data-home.mjs — LANE SN-DH (2026-10-01), check `datahome.walk-home`.
// Items: D01 lanes · D02 organization filter (URL only, All on every visit) · D03 search · D04 kinds ·
// D05 saved views · D06 New table carries the ACTIVE organization · and "the data home is quiet"
// (no red developer sentence, no 4xx/5xx on All organizations — BREAKER-4 B4-02, fixed baf4ae4ad8).
//
// Runs unchanged on live (https://www.aimatrx.com) and the clone preview. Seats: admin@admin.com, then
// test@test.com. The fixture table is born through the product in Cedar Ridge Physical Therapy while the
// filter names a DIFFERENT organization, carries STAMP in its name, and is archived in cleanup.
//
// A feature the page does not have on this build (title search, saved views: DATA-HOME-3 is rebuilding
// /data-v2) is a SKIP naming it — never a pass. When DATA-HOME-3 lands, the search / views steps light up
// by themselves: they look for a search box and a Views control on the page.
import { openWalk, bodyText, sleep, until, FIXTURE_ORG, FIXTURE_ORG_ID, STAMP } from "../lib/harness.mjs";

const ctx = await openWalk("data-home");
const LANES = ["All", "Mine", "My team", "My Orgs", "Shared", "Public"]; // System follows only when the page offers it
const RED = /could not be read|statement timeout|canceling statement|schema cache|PGRST\d+|permission denied|violates (row|check|foreign)|Something went wrong|\[object Object\]|undefined is not/i;

/** The harness' own sign-in helper on the shared preview posts to /__dev-walk; that 400 is not the page. */
const pageHttp = (since) => ctx.errors.http.slice(since).filter((e) => !/__dev-walk/.test(e.url));
const mark = () => ctx.errors.http.length;

async function listingState(page, timeoutMs = 150000) {
  const r = await until(
    "the Tables listing to settle",
    async () =>
      page.evaluate(() => {
        const toggle = document.querySelector('[data-hub-listing-toggle="tables"]');
        if (!toggle) return null;
        const section = document.querySelector('[data-hub-listing="tables"]');
        const text = section?.innerText ?? toggle.textContent ?? "";
        if (/reading/.test(toggle.textContent ?? "")) return null;
        const rows = section?.querySelectorAll("li[data-hub-row]").length ?? 0;
        if (rows > 0) return { state: "rows", text: text.slice(0, 200) };
        if (/could not be read|not an empty list/i.test(text)) return { state: "error", text: text.replace(/\s+/g, " ").slice(0, 300) };
        return { state: "empty", text: text.replace(/\s+/g, " ").slice(0, 200) };
      }),
    timeoutMs,
  );
  await sleep(800);
  return r.v ?? { state: "timeout", text: "the Tables listing never left 'reading'" };
}

const facts = (page) =>
  page.evaluate(() => {
    const root = document.querySelector("[data-hub-scope]");
    const section = document.querySelector('[data-hub-listing="tables"]');
    const rows = [...(section?.querySelectorAll("li[data-hub-row]") ?? [])].map((li) => ({
      org: li.querySelector("[data-hub-row-organization]")?.textContent?.trim() ?? "",
      kind: li.querySelector("[data-hub-row-kind]")?.textContent?.trim() ?? "",
      text: (li.innerText ?? "").replace(/\s+/g, " ").trim(),
    }));
    const tabs = [...(root?.querySelectorAll('[role="tablist"] [role="tab"]') ?? [])].map((b) => {
      const t = (b.textContent ?? "").trim();
      const m = t.match(/(\d+)$/);
      return { name: t.replace(/\d+$/, "").trim(), count: m ? Number(m[1]) : null, selected: b.getAttribute("aria-selected") === "true" };
    });
    return {
      rows,
      tabs,
      filter: root?.querySelector("[data-entity-org-filter]")?.textContent?.trim() ?? null,
      kind: root?.querySelector("[data-hub-kind]")?.value ?? null,
      kinds: [...(root?.querySelectorAll("[data-hub-kind] option") ?? [])].map((o) => ({ value: o.value, label: (o.textContent ?? "").trim() })),
      working: document.querySelector("[data-shell-org-switcher]")?.getAttribute("aria-label") ?? "",
      url: location.pathname + location.search,
    };
  });

/** The sentences a person would call red: the hub's own text with any developer wording in it. */
async function redSentence(page) {
  const t = await page.evaluate(() => document.querySelector("[data-hub-root]")?.innerText ?? document.body.innerText).catch(() => "");
  const m = t.match(RED);
  return m ? t.slice(Math.max(0, m.index - 80), m.index + 120).replace(/\s+/g, " ") : null;
}

async function openHome(page, query = "") {
  await ctx.goto(page, `/data-v2${query}`);
  return listingState(page);
}

async function orgMenu(page) {
  await page.keyboard.press("Escape").catch(() => {});
  await sleep(400);
  await page.click("[data-entity-org-filter]");
  await page.waitForSelector('[role="menu"] [role="menuitem"]', { timeout: 20000 }).catch(() => {});
  await sleep(700);
  const items = await page.evaluate(() => [...document.querySelectorAll('[role="menuitem"], [role="menuitemradio"], [role="option"]')].map((e) => (e.textContent ?? "").replace(/\s+/g, " ").trim()).filter(Boolean));
  return items;
}
async function chooseOrg(page, name) {
  const find = page.locator('input[aria-label="Find an organization"]');
  if (await find.count()) { await find.fill(name.slice(0, 20)); await sleep(500); }
  await page.locator('[role="menuitem"], [role="menuitemradio"], [role="option"]').filter({ hasText: name }).first().click();
  await sleep(1500);
}

const failBodies = [];
function watch(page) {
  page.on("response", async (r) => {
    if (r.status() < 400 || /__dev-walk|\/_next\/|favicon|\.map$/.test(r.url())) return;
    const body = await r.text().catch(() => "");
    failBodies.push({ status: r.status(), url: r.url().replace(/^https?:\/\/[^/]+/, "").slice(0, 80), body: body.replace(/\s+/g, " ").slice(0, 160) });
  });
}
const SCOPE_PARAM = { Mine: "mine", "My team": "team", "My Orgs": "orgs", Shared: "shared", Public: "public", System: "system" };
const singular = (w) => (w ?? "").toLowerCase().replace(/ies$/, "y").replace(/s$/, "");

const seatsRun = [];
try {
  for (const seat of ["admin", "member"]) {
    const page = await ctx.page(seat, { fresh: true });
    watch(page);
    const tag = seat === "admin" ? "admin@admin.com" : "test@test.com";
    const workingOk = page.__org === FIXTURE_ORG;

    // ── S1: a fresh visit opens on All organizations, never the active one ─────────────────────────
    let since = mark();
    let home = await openHome(page);
    let f = await facts(page);
    await ctx.step(["D02"], `${seat}: a fresh visit opens on All organizations (working in ${f.working.replace(/^Organization: /, "").split(".")[0] || "?"})`, page, async () => {
      const allFilter = /All organizations/.test(f.filter ?? "");
      const noParam = !/org_filter/.test(f.url);
      const rowOrgs = new Set(f.rows.map((r) => r.org).filter(Boolean));
      const narrowedToWorking = workingOk && rowOrgs.size === 1 && [...rowOrgs][0] === FIXTURE_ORG && seat === "admin";
      return {
        ok: home.state === "rows" && allFilter && noParam && !narrowedToWorking,
        detail: `${tag}: filter reads ${JSON.stringify(f.filter)}, address ${f.url}, ${f.rows.length} rows from ${rowOrgs.size} organizations; listing ${home.state}${home.state !== "rows" ? " — " + home.text : ""}`,
      };
    });
    await ctx.step(["D01", "D02"], `${seat}: the data home is quiet on All organizations (no red sentence, no 4xx/5xx)`, page, async () => {
      const bad = pageHttp(since);
      const red = await redSentence(page);
      return {
        ok: !red && bad.length === 0,
        detail: red ? `red sentence on the page: "${red}"` : bad.length ? `${bad.length} failed calls: ${bad.slice(0, 4).map((e) => `${e.status} ${e.url.replace(/^https?:\/\/[^/]+/, "").slice(0, 70)}`).join(" | ")}` : "no red sentence, no failed call",
      };
    });
    if (home.state !== "rows") {
      await ctx.step(["D01", "D02", "D03", "D04", "D05", "D06"], `${seat}: the rest of the walk needs a readable Tables listing`, page, async () => ({ ok: false, detail: `the Tables listing is ${home.state} — ${home.text}` }));
      continue;
    }

    // ── S2: every lane the page offers, in order ──────────────────────────────────────────────────
    await ctx.step(["D01"], `${seat}: the lanes ${LANES.join(" | ")} (System when offered)`, page, async () => {
      const names = f.tabs.map((t) => t.name);
      const inOrder = LANES.every((l, i) => names[i] === l);
      const system = names.includes("System");
      const defaultAll = f.tabs.find((t) => t.selected)?.name === "All";
      return {
        ok: inOrder && defaultAll,
        detail: `lanes on the page: ${f.tabs.map((t) => `${t.name} ${t.count ?? "?"}`).join(" · ")}; default ${f.tabs.find((t) => t.selected)?.name ?? "none"}; System ${system ? "offered" : "absent (declared absent in OrganizationHub: no person can reach platform tables yet)"}`,
      };
    });
    const allCount = f.tabs.find((t) => t.name === "All")?.count ?? null;
    for (const lane of [...LANES, ...(f.tabs.some((t) => t.name === "System") ? ["System"] : [])]) {
      if (lane === "All") continue;
      since = mark();
      await ctx.step(["D01"], `${seat}: lane ${lane}`, page, async () => {
        const clickLane = () =>
          page.evaluate((want) => {
            const tab = [...document.querySelectorAll('[data-hub-scope] [role="tablist"] [role="tab"]')].find((b) => (b.textContent ?? "").replace(/\d+$/, "").trim() === want);
            tab?.click();
            return !!tab;
          }, lane);
        const wantUrl = () => page.url().includes(`scope=${SCOPE_PARAM[lane]}`) || null;
        await clickLane();
        let urlOk = (await until(`scope=${SCOPE_PARAM[lane]} in the address`, async () => wantUrl(), 15000)).v;
        if (!urlOk) {
          await clickLane();
          urlOk = (await until(`scope=${SCOPE_PARAM[lane]} in the address (2nd press)`, async () => wantUrl(), 20000)).v;
        }
        await sleep(1500);
        const st = await listingState(page, 90000);
        const g = await facts(page);
        const tabCount = g.tabs.find((t) => t.name === lane)?.count;
        const bad = pageHttp(since);
        const red = await redSentence(page);
        const subset = allCount == null || g.rows.length <= (f.rows.length || 0) + 0 || g.rows.length <= allCount;
        const countsAgree = tabCount == null || tabCount > 300 || st.state === "empty" ? true : g.rows.length === tabCount;
        return {
          ok: !!urlOk && st.state !== "error" && st.state !== "timeout" && !red && bad.length === 0 && subset && countsAgree,
          detail: `${g.rows.length} rows (tab says ${tabCount ?? "?"}, All says ${allCount ?? "?"}); address ${g.url}; listing ${st.state}${red ? "; red: " + red : ""}${bad.length ? `; ${bad.length} failed calls (${bad[0].status})` : ""}`,
        };
      });
    }
    await page.evaluate(() => [...document.querySelectorAll('[data-hub-scope] [role="tablist"] [role="tab"]')].find((b) => /^All/.test((b.textContent ?? "").trim()))?.click());
    await sleep(1500);

    // ── S3: the organization filter, through its control and through the URL ─────────────────────────
    home = await openHome(page);
    f = await facts(page);
    let menu = [];
    await ctx.step(["D02"], `${seat}: the organization filter lists the person's organizations`, page, async () => {
      menu = await orgMenu(page);
      await page.keyboard.press("Escape");
      const orgsInMenu = menu.filter((m) => !/^All organizations/.test(m));
      return { ok: menu.some((m) => /^All organizations/.test(m)) && orgsInMenu.length >= 1, detail: `${menu.length} entries: ${menu.slice(0, 8).join(" | ")}` };
    });
    const otherOrg = menu.map((m) => m.replace(/\s*\d+$/, "").trim()).find((m) => m && !/^All organizations/.test(m) && !m.startsWith(FIXTURE_ORG));
    const pickName = menu.map((m) => m.replace(/\s*\d+$/, "").trim()).find((m) => m.startsWith(FIXTURE_ORG)) ? FIXTURE_ORG : otherOrg;
    if (pickName) {
      since = mark();
      await ctx.step(["D02"], `${seat}: choose ${pickName} in the control — the address carries org_filter, only that organization is listed`, page, async () => {
        await orgMenu(page);
        await chooseOrg(page, pickName);
        const url = (await until("org_filter in the address", async () => page.url().match(/org_filter=([0-9a-f-]{36})/)?.[0] ?? null, 30000)).v;
        const st = await listingState(page, 120000);
        const g = await facts(page);
        const wrong = g.rows.filter((r) => r.org && r.org !== pickName);
        const bad = pageHttp(since);
        return {
          ok: !!url && !/[?&]org=/.test(page.url()) && st.state !== "error" && g.rows.length > 0 && wrong.length === 0 && /^[^]*/.test(g.filter ?? "") && (g.filter ?? "").includes(pickName.slice(0, 12)) && bad.length === 0,
          detail: `${g.rows.length} rows, ${wrong.length} from another organization; address ${g.url}; control reads ${JSON.stringify(g.filter)}; ${bad.length} failed calls`,
        };
      });
    } else {
      await ctx.step(["D02"], `${seat}: choose an organization in the control`, page, async () => ({ skip: "this seat has only one organization to choose" }));
    }
    // by URL: Cedar Ridge named in the address
    since = mark();
    await ctx.step(["D02"], `${seat}: ?org_filter=<Cedar Ridge> in the address lists only Cedar Ridge`, page, async () => {
      const st = await openHome(page, `?org_filter=${FIXTURE_ORG_ID}`);
      const g = await facts(page);
      const member = menu.some((m) => m.startsWith(FIXTURE_ORG));
      if (!member) return { skip: `${tag} is not a member of ${FIXTURE_ORG}; the address is read as All organizations` };
      const wrong = g.rows.filter((r) => r.org && r.org !== FIXTURE_ORG);
      return { ok: st.state !== "error" && (g.filter ?? "").includes("Cedar Ridge") && wrong.length === 0, detail: `${g.rows.length} rows, ${wrong.length} elsewhere; control reads ${JSON.stringify(g.filter)}` };
    });
    await ctx.step(["D02"], `${seat}: an organization id that is not hers reads as All organizations`, page, async () => {
      const st = await openHome(page, `?org_filter=00000000-0000-4000-8000-000000000001`);
      const g = await facts(page);
      return { ok: st.state !== "error" && /All organizations/.test(g.filter ?? ""), detail: `control reads ${JSON.stringify(g.filter)}; ${g.rows.length} rows` };
    });
    await ctx.step(["D02"], `${seat}: the pick is never remembered — back on /data-v2 it is All organizations again`, page, async () => {
      await openHome(page, `?org_filter=${FIXTURE_ORG_ID}`);
      const st = await openHome(page);
      const g = await facts(page);
      const rowOrgs = new Set(g.rows.map((r) => r.org).filter(Boolean));
      return { ok: st.state === "rows" && /All organizations/.test(g.filter ?? "") && !/org_filter/.test(g.url), detail: `control reads ${JSON.stringify(g.filter)}, address ${g.url}, ${rowOrgs.size} organizations` };
    });

    // ── S4: kinds ────────────────────────────────────────────────────────────────────────────────────
    home = await openHome(page);
    f = await facts(page);
    const pickKind = f.kinds.find((k) => k.value && k.value !== "all" && !/^All kinds/i.test(k.label));
    await ctx.step(["D04"], `${seat}: Kind narrows the tables to one kind`, page, async () => {
      if (!pickKind) return { skip: `the Kind control offers only "${f.kinds.map((k) => k.label).join(", ")}" for ${tag}` };
      since = mark();
      await page.selectOption("[data-hub-kind]", pickKind.value);
      await until("kind in the address", async () => /kind=/.test(page.url()) || null, 20000);
      const st = await listingState(page, 90000);
      const g = await facts(page);
      const wrong = g.rows.filter((r) => r.kind && singular(r.kind) !== singular(pickKind.label));
      const bad = pageHttp(since);
      return { ok: st.state !== "error" && g.rows.length > 0 && wrong.length === 0 && bad.length === 0, detail: `kind "${pickKind.label}" (of ${f.kinds.length}): ${g.rows.length} rows, ${wrong.length} of another kind; address ${g.url}` };
    });
    if (pickKind) {
      await page.selectOption("[data-hub-kind]", f.kinds[0].value).catch(() => {});
      await sleep(1500);
    }

    // ── S5: title search ─────────────────────────────────────────────────────────────────────────────
    home = await openHome(page);
    f = await facts(page);
    await ctx.step(["D03"], `${seat}: title search finds a table by part of its name`, page, async () => {
      const box = page.locator('[data-hub-root] input[type="search"], [data-hub-root] [role="searchbox"], [data-hub-root] input[placeholder*="earch" i], main input[type="search"], main [role="searchbox"], main input[placeholder*="earch" i]').first();
      if (!(await box.count())) return { skip: "the data home has no title search on this build (the UI lane DATA-HOME-3 adds it; this step lights up when the page offers a search box)" };
      const name = f.rows.map((r) => r.text.split(/ [—·|] /)[0]).find((t) => t && t.length > 8) ?? f.rows[0]?.text ?? "";
      const words = name.split(/\s+/).filter((w) => w.length >= 4);
      const frag = (words[Math.floor(words.length / 2)] ?? name.slice(2, 8)).toLowerCase();
      await box.fill(frag);
      await sleep(2500);
      const g = await facts(page);
      const hit = g.rows.filter((r) => r.text.toLowerCase().includes(frag));
      await box.fill("");
      await sleep(1500);
      const back = await facts(page);
      return { ok: g.rows.length > 0 && hit.length === g.rows.length && back.rows.length >= g.rows.length, detail: `typed "${frag}" (a part of "${name.slice(0, 50)}"): ${g.rows.length} rows, ${hit.length} contain it; cleared → ${back.rows.length} rows` };
    });

    // ── S6: saved views ──────────────────────────────────────────────────────────────────────────────
    await ctx.step(["D05"], `${seat}: a saved view`, page, async () => {
      const ctl = page.locator('[data-hub-root] [data-hub-views], [data-hub-root] button:has-text("Views"), [data-hub-root] button:has-text("Save view"), main [aria-label*="aved view" i], main button:has-text("Save view")').first();
      if (!(await ctl.count())) return { skip: "the data home offers no saved views on this build (views live on a table's own page; the UI lane DATA-HOME-3 may add them here)" };
      return { ok: true, detail: "a views control is on the page" };
    });

    // ── S7: New table carries the ACTIVE organization (admin only; he works in Cedar Ridge) ─────────────
    if (seat === "admin") {
      const NAME = `Visit Log ${STAMP}`;
      let tableId = null;
      await ctx.step(["D06"], `New table, while working in ${FIXTURE_ORG} with the filter on a different organization → it is born in ${FIXTURE_ORG}`, page, async () => {
        if (!workingOk) return { skip: `the switcher did not name ${FIXTURE_ORG} for this seat` };
        // the filter on a DIFFERENT organization than the working one
        await openHome(page);
        const entries = await orgMenu(page);
        const other = entries.map((m) => m.replace(/\s*\d+$/, "").trim()).find((m) => m && !/^All organizations/.test(m) && !m.startsWith(FIXTURE_ORG));
        if (!other) return { skip: "admin has no second organization to put the filter on" };
        await chooseOrg(page, other);
        await listingState(page, 120000);
        const g0 = await facts(page);
        const btn = page.getByRole("button", { name: "New table" }).first();
        await btn.waitFor({ timeout: 60000 });
        await btn.click();
        await page.getByPlaceholder("Table name").fill(NAME);
        await page.getByRole("button", { name: "Create", exact: true }).click();
        const opened = await until("the new table opens", async () => page.url().match(/\/data-v2\/([0-9a-f-]{36})/)?.[1] ?? null, 120000);
        tableId = opened.v;
        if (!tableId) return { ok: false, detail: `the new table did not open (still at ${page.url()}) with the filter on ${other}` };
        ctx.cleanup(async () => {
          const p = page;
          await ctx.goto(p, `/data-v2/${tableId}`);
          await sleep(6000);
          if (await p.getByText("This table is archived").count()) return;
          await p.getByRole("button", { name: "Table menu" }).first().click();
          await sleep(1000);
          await p.locator("[role=menu] [role^=menuitem]").filter({ hasText: /^Settings|Table settings/ }).first().click();
          await sleep(3000);
          const archive = p.getByRole("button", { name: "Archive this table", exact: true });
          await archive.first().click();
          await sleep(1500);
          await archive.last().click();
          await until("archived", async () => (await p.getByText(/is archived|This table is archived/).count()) > 0 || null, 120000);
        });
        await sleep(3000);
        // where did it land? Cedar Ridge's filter lists it; the other organization's does not.
        const inCedar = await openHome(page, `?org_filter=${FIXTURE_ORG_ID}`);
        const gc = await facts(page);
        const rowC = gc.rows.find((r) => r.text.includes(NAME));
        return {
          ok: !!rowC && rowC.org === FIXTURE_ORG,
          detail: `filter was on ${other} (${g0.rows.length} rows); "${NAME}" ${rowC ? `is listed under ${JSON.stringify(rowC.org)}` : `is NOT listed under ${FIXTURE_ORG} (listing ${inCedar.state})`}`,
        };
      });
      await ctx.step(["D06"], `the new table is not listed under the filter's organization`, page, async () => {
        if (!tableId) return { skip: "no fixture table was made" };
        const entries = await (async () => { await openHome(page); const e = await orgMenu(page); await page.keyboard.press("Escape"); return e; })();
        const other = entries.map((m) => m.replace(/\s*\d+$/, "").trim()).find((m) => m && !/^All organizations/.test(m) && !m.startsWith(FIXTURE_ORG));
        await openHome(page);
        await orgMenu(page);
        await chooseOrg(page, other);
        await listingState(page, 120000);
        const g = await facts(page);
        const leaked = g.rows.filter((r) => r.text.includes(NAME));
        return { ok: leaked.length === 0 && g.rows.length > 0, detail: `filter on ${other}: ${g.rows.length} rows, ${leaked.length} carry "${NAME}"` };
      });
    }
    seatsRun.push(seat);
  }
} finally {
  await ctx.step(["D01"], "every 4xx/5xx the page fired during the whole walk (recorded)", null, async () => {
    const bad = ctx.errors.http.filter((e) => !/__dev-walk/.test(e.url));
    const sample = bad.slice(0, 8).map((e) => `${e.seat} ${e.status} ${e.url.replace(/^https?:\/\/[^/]+/, "").slice(0, 80)} ${JSON.stringify((failBodies.find((b) => e.url.includes(b.url.slice(0, 60)) && b.status === e.status) ?? {}).body ?? "")}`);
    return { ok: bad.length === 0, detail: `${bad.length} failed calls in the walk${sample.length ? ": " + sample.join(" | ") : ""}` };
  });
  await ctx.finish();
}
