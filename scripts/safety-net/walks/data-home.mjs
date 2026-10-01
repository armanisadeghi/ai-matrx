// scripts/safety-net/walks/data-home.mjs — check `datahome.walk-home`, items D01–D06 + "the data home is quiet".
//
// REWRITTEN 2026-10-01 ~13:50 PT (SAFETY-NET, at the chair's request) for the NEW /data-v2: the list-shell
// page (features/unified-data/home/, knob custom.data_home_shell = true since 13:10 PT). The previous walk
// (lane SN-DH) read the old hub's markers (data-hub-*) and graded D01–D06 FAIL on the new page while the
// page itself was fine — a change of intended page, so the steps changed; what must hold did not:
//   D01 lanes All | Mine | My team | My Orgs | Shared | Public, each with a count, each opens its rows
//   D02 the organization filter ([data-entity-org-filter]) reads All organizations on every fresh visit;
//       choosing one puts ?org_filter= in the address and lists only that organization; a foreign id
//       reads as All; the pick is never remembered
//   D03 the search box finds a table by part of its name (?q= in the address)
//   D04 a kind narrows the list to that kind (the kind:<kind> token becomes a chip)
//   D05 the view tabs (a saved view) — the tab bar is checked; saving one is not walked (SKIP, said)
//   D06 New table while working in Cedar Ridge with the filter on another organization → born in Cedar Ridge
// Markers are the shell's own (scripts/data-home/data-home-shell-walk.mjs, lane DATA-HOME-3A):
// tr[data-row-id] rows, role=tab lanes, [data-entity-org-filter], role=searchbox, [data-entity-filter-chip],
// the Name | Kind | Organization | Records | Updated | Owner | Access columns.
import { openWalk, bodyText, sleep, until, FIXTURE_ORG, FIXTURE_ORG_ID, STAMP } from "../lib/harness.mjs";

const ctx = await openWalk("data-home");
const LANES = ["All", "Mine", "My team", "My Orgs", "Shared", "Public"];
const COLUMNS = ["Name", "Kind", "Organization", "Records", "Updated", "Owner", "Access"];
const RED = /could not be read|statement timeout|canceling statement|schema cache|PGRST\d+|permission denied|violates (row|check|foreign)|Something went wrong|\[object Object\]|undefined is not|Name the organization you are working in/i;
const ROW = "tr[data-row-id]:visible";
const FOREIGN = "11111111-2222-4333-8444-555555555555";

const mark = () => ctx.errors.http.length;
const httpSince = (n) => ctx.errors.http.slice(n).filter((e) => !/__dev-walk/.test(e.url));

async function home(page, query = "") {
  await ctx.goto(page, `/data-v2${query}`);
  const r = await until("the list", async () => {
    const n = await page.locator(ROW).count();
    if (n > 0) return "rows";
    const t = await bodyText(page, 4000);
    return /Nothing here|No tables|nothing matches|No results/i.test(t) ? "empty" : null;
  }, 120000);
  await sleep(1200);
  return r.v ?? "never";
}

/** Every visible row: id, Name, Kind, Organization cells by the header's own order. */
async function rows(page) {
  return page.evaluate(() => {
    const heads = [...document.querySelectorAll("thead th")].map((t) => (t.textContent ?? "").trim());
    const col = (name) => heads.findIndex((h) => h.toLowerCase().startsWith(name.toLowerCase()));
    const [n, k, o, rc, ow] = ["Name", "Kind", "Organization", "Records", "Owner"].map(col);
    return [...document.querySelectorAll("tr[data-row-id]")].filter((tr) => tr.offsetParent !== null).map((tr) => {
      const td = [...tr.querySelectorAll("td")].map((c) => (c.textContent ?? "").trim());
      return { id: tr.getAttribute("data-row-id"), name: td[n] ?? "", kind: td[k] ?? "", org: td[o] ?? "", records: td[rc] ?? "", owner: td[ow] ?? "" };
    });
  });
}
const orgFilterLabel = (page) => page.locator("[data-entity-org-filter]").first().getAttribute("aria-label").catch(() => null);
const optionsOpen = (page) => page.evaluate(() => [...document.querySelectorAll('[role="option"], [role="menuitem"], [role="menuitemradio"], [cmdk-item]')].some((e) => e.offsetParent !== null && /All organizations/.test(e.textContent ?? ""))).catch(() => false);
/** Open the organization filter's list (a second press would close it — Escape does not always). */
async function openOrgFilter(page) {
  // A list closing after Escape still reads as open for its animation: let it finish, then press.
  await page.keyboard.press("Escape").catch(() => {});
  await until("the filter's list closed", async () => !(await optionsOpen(page)), 5000);
  await page.locator("[data-entity-org-filter]").first().click();
  await until("the filter's list", () => optionsOpen(page), 10000);
}
async function chooseOrg(page, name) {
  await openOrgFilter(page);
  await sleep(500);
  // Mark the option whose own text, less its trailing count, is exactly the name (the count is a
  // separate span, so a text regex on the whole row is unreliable), then press it like a person.
  const found = await page.evaluate((want) => {
    document.querySelectorAll("[data-sn-pick]").forEach((e) => e.removeAttribute("data-sn-pick"));
    const els = [...document.querySelectorAll('[role="option"], [role="menuitem"], [role="menuitemradio"], [cmdk-item]')];
    const el = els.find((e) => (e.textContent ?? "").trim().replace(/\s*\d+$/, "").trim() === want);
    if (!el) return false;
    el.setAttribute("data-sn-pick", "");
    el.scrollIntoView({ block: "center" });
    return true;
  }, name);
  if (!found) {
    const seen = await page.evaluate(() => [...document.querySelectorAll('[role="option"], [role="menuitem"], [role="menuitemradio"], [cmdk-item]')].map((e) => e.textContent).slice(0, 8));
    console.log(`[data-home] ${name} not among ${JSON.stringify(seen)}`);
    await page.keyboard.press("Escape");
    return false;
  }
  await page.locator("[data-sn-pick]").first().click();
  await until("rows after the pick", async () => (await page.locator(ROW).count()) > 0 || null, 60000);
  await sleep(1500);
  return true;
}
async function orgOptions(page) {
  await openOrgFilter(page);
  await sleep(500);
  const opts = await page.evaluate(() => [...document.querySelectorAll('[role="option"], [role="menuitem"], [role="menuitemradio"], [cmdk-item]')].map((e) => (e.textContent ?? "").trim()));
  await page.keyboard.press("Escape");
  return opts;
}

try {
  for (const seat of ["admin", "member"]) {
    const page = await ctx.page(seat);
    const m0 = mark();

    // ── D02 a fresh visit reads All organizations; D01 the page is the shell, quiet ───────────────────
    const state = await home(page);
    await ctx.step(["D02"], `${seat}: a fresh visit opens on All organizations`, page, async () => {
      const label = await orgFilterLabel(page);
      const u = new URL(page.url());
      return { ok: /All organizations/.test(label ?? "") && !u.searchParams.has("org_filter"), detail: `filter control says ${JSON.stringify(label)}; address ${u.search || "(no query)"}; list ${state}` };
    });
    await ctx.step(["D01"], `${seat}: the table has the shell's columns (Name … Records … Owner … Access)`, page, async () => {
      const heads = (await page.locator("thead th").allInnerTexts()).map((t) => t.trim()).filter(Boolean);
      const missing = COLUMNS.filter((c) => !heads.some((h) => h.toLowerCase().startsWith(c.toLowerCase())));
      const r = await rows(page);
      return { ok: missing.length === 0 && r.length > 0, detail: `columns ${heads.join(" | ")}; missing ${missing.join(", ") || "none"}; ${r.length} rows (first: ${r[0] ? `${r[0].name} · ${r[0].kind} · ${r[0].org} · ${r[0].records} records · ${r[0].owner}` : "—"})` };
    });
    await ctx.step(["D01", "D02"], `${seat}: the data home is quiet on All organizations (no red sentence, no 4xx/5xx)`, page, async () => {
      const t = await bodyText(page, 30000);
      const red = t.match(RED)?.[0];
      const bad = httpSince(m0);
      return { ok: !red && bad.length === 0, detail: `${red ? `red text "${red}"; ` : ""}${bad.length} failed calls${bad.length ? ": " + bad.slice(0, 4).map((e) => `${e.status} ${e.url.replace(/^https?:\/\/[^/]+/, "").slice(0, 70)}`).join(" | ") : ""}` };
    });

    // ── D01 the lanes, each with a count, each opens its rows ────────────────────────────────────────
    const counts = {};
    for (const lane of LANES) {
      await ctx.step(["D01"], `${seat}: lane ${lane}`, page, async () => {
        const tab = page.getByRole("tab", { name: new RegExp(`^${lane}\\s*\\d+$`) }).first();
        if (!(await tab.count())) return { ok: false, detail: `no "${lane} <count>" tab` };
        const text = (await tab.innerText()).replace(/\s+/g, " ").trim();
        const n = Number(text.match(/(\d+)$/)?.[1] ?? NaN);
        counts[lane] = n;
        await tab.click();
        const r = await until("lane rows", async () => {
          const c = await page.locator(ROW).count();
          if (c > 0) return c;
          const t = await bodyText(page, 3000);
          return /Nothing here|No tables|nothing|No results/i.test(t) ? -1 : null;
        }, 60000);
        const shown = r.v ?? 0;
        const selected = (await tab.getAttribute("aria-selected")) === "true";
        const okCount = Number.isFinite(n) && (n === 0 ? shown <= 0 : shown > 0);
        return { ok: selected && okCount, detail: `tab "${text}" selected=${selected}; ${shown > 0 ? `${shown} rows drawn` : "empty state"}` };
      });
    }
    await ctx.step(["D01"], `${seat}: the lane counts agree (All ≥ Mine, All ≥ My Orgs)`, null, async () => ({
      ok: counts.All >= counts.Mine && counts.All >= counts["My Orgs"],
      detail: JSON.stringify(counts),
    }));
    await page.getByRole("tab", { name: /^All\s*\d+$/ }).first().click().catch(() => {});
    await sleep(1200);

    // ── D02 the organization filter ──────────────────────────────────────────────────────────────────
    const opts = await orgOptions(page);
    await ctx.step(["D02"], `${seat}: the organization filter lists the person's organizations, with counts`, page, async () => ({
      ok: opts.length > 1 && opts[0] === "All organizations" && opts.some((o) => o.startsWith(FIXTURE_ORG)),
      detail: `${opts.length} entries: ${opts.slice(0, 5).join(" · ")}`,
    }));
    await ctx.step(["D02"], `${seat}: choose ${FIXTURE_ORG} in the control — the address carries org_filter, only it is listed`, page, async () => {
      const picked = await chooseOrg(page, FIXTURE_ORG);
      if (!picked) return { ok: false, detail: `${FIXTURE_ORG} not offered` };
      const u = new URL(page.url());
      const r = await rows(page);
      const others = r.filter((x) => x.org && x.org !== FIXTURE_ORG);
      return { ok: u.searchParams.get("org_filter") === FIXTURE_ORG_ID && r.length > 0 && others.length === 0, detail: `org_filter=${u.searchParams.get("org_filter")}; ${r.length} rows, ${others.length} from another organization${others[0] ? ` (e.g. ${others[0].name} · ${others[0].org})` : ""}` };
    });
    await ctx.step(["D02"], `${seat}: ?org_filter=<${FIXTURE_ORG}> in the address lists only it`, page, async () => {
      await home(page, `?org_filter=${FIXTURE_ORG_ID}`);
      const r = await rows(page);
      const others = r.filter((x) => x.org && x.org !== FIXTURE_ORG);
      return { ok: r.length > 0 && others.length === 0 && /Cedar Ridge/.test((await orgFilterLabel(page)) ?? ""), detail: `${r.length} rows, ${others.length} foreign; control says ${await orgFilterLabel(page)}` };
    });
    await ctx.step(["D02"], `${seat}: an organization id that is not hers reads as All organizations`, page, async () => {
      await home(page, `?org_filter=${FOREIGN}`);
      const label = await orgFilterLabel(page);
      const r = await rows(page);
      return { ok: /All organizations/.test(label ?? "") || r.length === 0, detail: `control says ${JSON.stringify(label)}; ${r.length} rows` };
    });
    await ctx.step(["D02"], `${seat}: the pick is never remembered — a fresh /data-v2 is All organizations again`, page, async () => {
      await home(page);
      const label = await orgFilterLabel(page);
      return { ok: /All organizations/.test(label ?? "") && !new URL(page.url()).searchParams.has("org_filter"), detail: `control says ${JSON.stringify(label)}; address ${new URL(page.url()).search || "(none)"}` };
    });

    // ── D03 search ───────────────────────────────────────────────────────────────────────────────────
    await ctx.step(["D03"], `${seat}: the search box finds a table by part of its name`, page, async () => {
      await home(page);
      const r0 = await rows(page);
      // A word from a real row's name, so the search has something true to find on any build.
      const target = r0.find((x) => x.name && x.name.split(/\s+/)[0].length >= 5) ?? r0[0];
      const word = (target?.name ?? "").split(/\s+/)[0];
      const box = page.getByRole("searchbox").first();
      if (!(await box.count())) return { ok: false, detail: "no search box" };
      await box.fill(word.toLowerCase().slice(0, Math.max(4, word.length - 1)));
      await until("q in the address", async () => new URL(page.url()).searchParams.get("q") || null, 15000);
      await sleep(1500);
      const r = await rows(page);
      const q = new URL(page.url()).searchParams.get("q");
      const hit = r.some((x) => x.id === target?.id);
      return { ok: Boolean(q) && hit && r.length > 0, detail: `typed "${q}" (from "${target?.name}"): ${r.length} rows; the table ${hit ? "is" : "is NOT"} among them; top: ${r[0]?.name ?? "—"}` };
    });
    await page.getByRole("searchbox").first().fill("").catch(() => {});

    // ── D04 kinds ────────────────────────────────────────────────────────────────────────────────────
    await ctx.step(["D04"], `${seat}: a kind narrows the list to that kind (kind: token → chip)`, page, async () => {
      await home(page);
      const r0 = await rows(page);
      const kinds = [...new Set(r0.map((x) => x.kind).filter(Boolean))];
      const want = kinds.find((k) => /^List$|^Form$|^Dashboard$/i.test(k)) ?? kinds[0];
      if (!want) return { ok: false, detail: "no Kind values in the rows" };
      const box = page.getByRole("searchbox").first();
      await box.fill(`kind:${want.toLowerCase()} `);
      await sleep(2000);
      const chips = await page.locator("[data-entity-filter-chip]").allInnerTexts();
      const r = await rows(page);
      const off = r.filter((x) => x.kind && x.kind.toLowerCase() !== want.toLowerCase());
      await box.fill("").catch(() => {});
      for (const b of await page.locator("[data-entity-filter-chip] button").all()) await b.click().catch(() => {});
      return { ok: chips.some((c) => /Kind/i.test(c)) && r.length > 0 && off.length === 0, detail: `kinds seen ${kinds.join(", ")}; chose ${want}: chips ${chips.join(" | ") || "none"}; ${r.length} rows, ${off.length} of another kind` };
    });

    // ── D05 saved views ──────────────────────────────────────────────────────────────────────────────
    await ctx.step(["D05"], `${seat}: the view tabs`, page, async () => {
      const dv = await page.getByRole("tab", { name: /Default view/ }).count();
      return dv ? { skip: `the view tab bar is there ("Default view"); saving and reopening a view is not walked yet` } : { ok: false, detail: "no view tab bar" };
    });

    // ── D06 New table carries the ACTIVE organization (admin only; he works in Cedar Ridge) ─────────────
    if (seat === "admin") {
      const NAME = `Visit Log ${STAMP}`;
      let tableId = null;
      await ctx.step(["D06"], `New table, working in ${FIXTURE_ORG} with the filter on another organization → born in ${FIXTURE_ORG}`, page, async () => {
        if (page.__org !== FIXTURE_ORG) return { skip: `the switcher did not name ${FIXTURE_ORG} for this seat` };
        const other = (await orgOptions(page)).map((o) => o.replace(/\d+$/, "").trim()).find((o) => o && o !== "All organizations" && o !== FIXTURE_ORG && !/^admin's Workspace$/.test(o));
        if (!other || !(await chooseOrg(page, other))) return { skip: "admin has no second organization to put the filter on" };
        const btn = page.getByRole("button", { name: "New table" }).first();
        await btn.waitFor({ timeout: 60000 });
        await btn.click();
        await page.getByPlaceholder("Table name").fill(NAME);
        await page.getByRole("button", { name: "Create", exact: true }).click();
        const opened = await until("the new table opens", async () => page.url().match(/\/data-v2\/([0-9a-f-]{36})/)?.[1] ?? null, 120000);
        tableId = opened.v;
        if (!tableId) return { ok: false, detail: `the new table did not open (still at ${page.url()}) with the filter on ${other}` };
        ctx.cleanup(async () => {
          await ctx.goto(page, `/data-v2/${tableId}?rail=settings`);
          await sleep(5000);
          if (await page.getByText("This table is archived").count()) return;
          const carry = page.getByRole("button", { name: "Carry on archiving", exact: true });
          const archive = page.getByRole("button", { name: "Archive this table", exact: true });
          if (await carry.count()) await carry.first().click();
          else {
            await archive.first().click();
            await sleep(1500);
            await archive.last().click();
          }
          const done = await until("archived", async () => (await page.getByText(/is archived|This table is archived/).count()) > 0 || null, 120000);
          if (!done.v) throw new Error(`the fixture table ${tableId} ("${NAME}") was not archived — archive it by hand`);
        });
        await sleep(3000);
        await home(page, `?org_filter=${FIXTURE_ORG_ID}`);
        const box = page.getByRole("searchbox").first();
        await box.fill(NAME);
        await sleep(2000);
        const hit = (await rows(page)).find((x) => x.id === tableId || x.name.includes(NAME));
        return { ok: !!hit && hit.org === FIXTURE_ORG, detail: `filter was on ${other}; "${NAME}" ${hit ? `is listed under ${JSON.stringify(hit.org)}` : `is NOT listed under ${FIXTURE_ORG}`}` };
      });
    }
  }
} finally {
  await ctx.step(["D01"], "every 4xx/5xx the page fired during the whole walk (recorded)", null, async () => {
    const bad = ctx.errors.http.filter((e) => !/__dev-walk/.test(e.url));
    return { ok: bad.length === 0, detail: `${bad.length} failed calls${bad.length ? ": " + bad.slice(0, 8).map((e) => `${e.seat} ${e.status} ${e.url.replace(/^https?:\/\/[^/]+/, "").slice(0, 80)}`).join(" | ") : ""}` };
  });
  await ctx.finish();
}
