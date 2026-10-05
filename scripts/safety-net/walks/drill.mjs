// scripts/safety-net/walks/drill.mjs — LANE SAFETY-NET, items R04 (the usage page's twelve screens)
// and R05 (a member is never handed the platform's usage), plus R01–R03 as a person meets them
// (a table drilled by a Dimension draws groups that add up). Read-only: the usage page recounts its
// derived hourly rollup on view, nothing else is written.
//
// The twelve screens are the ones lane DRILL-USAGE-PAGE built the page for
// (scripts/drill-usage-page-walk.mjs, SCREENS): each must draw groups, show a total, and fire no
// failed door call.
import { openWalk, until, sleep, bodyText } from "../lib/harness.mjs";

const ADMIN = "87a6e699-3622-4869-8843-d0867456c0dd";
const WORKSPACE = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f";
// Cedar Ridge Physical Therapy's "Patients" table (on live and on the 09-29 clone).
const TABLE = process.env.SN_PLATFORM_TABLE ?? "6d3b427c-f272-4118-8f14-3f431c78c75c";
const SCREENS = [
  ["01-by-person", "?by=person&show=cost,requests,tokens_in,tokens_out&sort=-cost&w=30d"],
  ["02-one-person-by-day", `?f.person=${ADMIN}&by=at:day&show=cost,calls&w=30d`],
  ["03-by-organization", "?by=organization&show=cost,people,requests&sort=-cost&w=30d"],
  ["04-one-org-by-person", `?f.organization=${WORKSPACE}&by=person&show=cost,requests&sort=-cost&w=30d`],
  ["05-by-provider", "?by=provider&show=cost,calls,tokens_in&sort=-cost&w=30d"],
  ["06-model-in-provider", "?f.provider=anthropic&by=model&show=cost,tokens_in,tokens_cached&sort=-cost&w=30d"],
  ["07-app-feature", "?by=app,feature&show=cost,calls&sort=-cost&w=30d"],
  ["08-by-month-all-time", "?by=at:month&show=cost,calls"],
  ["09-trigger-by-origin", "?by=trigger&across=origin&show=cost&w=30d"],
  ["10-person-by-month", "?by=person&across=at:month&show=cost&sort=-cost&w=365d"],
  ["11-day-series", "?by=at:day&show=cost&w=30d"],
  ["12-provider-vs-previous", "?by=provider,model&show=cost&sort=-cost&w=90d&cmp=prev"],
];

const ctx = await openWalk("drill");
const read = (page) =>
  page.evaluate(() => ({
    total: document.querySelector("[data-usage-total]")?.textContent ?? document.querySelector("[data-matrx-drill-total]")?.textContent ?? null,
    groups: document.querySelectorAll('[data-matrx-drill-level="0"]').length,
    error: document.querySelector("[data-matrx-drill-answer] [role='alert'], [data-matrx-drill-answer] .text-destructive")?.textContent ?? null,
  }));
const settle = (page) =>
  until("answer", async () => {
    const r = await read(page);
    return (r.groups > 0 || r.error) && r.total && r.total !== "…";
  }, 90000);

try {
  const admin = await ctx.page("admin");
  const doors = [];
  admin.on("response", (r) => {
    const m = r.url().match(/\/rpc\/(drill_[a-z_]+|ai_usage_[a-z_]+|saved_view[a-z_]*)/);
    if (m) doors.push({ door: m[1], status: r.status() });
  });

  // ── R04 the twelve screens ────────────────────────────────────────────────────────────────
  // SN_DRILL_ONLY=table runs just the table step (a quick loop while editing it).
  for (const [key, query] of process.env.SN_DRILL_ONLY === "table" ? [] : SCREENS) {
    doors.length = 0;
    await ctx.step(["R04"], `usage screen ${key}`, admin, async () => {
      await ctx.goto(admin, `${ctx.manageOrigin}/administration/usage${query}`);
      await settle(admin);
      await sleep(600);
      const r = await read(admin);
      const failed = doors.filter((d) => d.status >= 400);
      return {
        ok: r.groups > 0 && !r.error && !failed.length,
        detail: `${r.groups} groups, total ${JSON.stringify((r.total ?? "").slice(0, 40))}${r.error ? `, error "${r.error.slice(0, 120)}"` : ""}${failed.length ? `, failed doors ${failed.map((f) => `${f.door} ${f.status}`).join(", ")}` : ""}`,
      };
    });
  }

  // ── R01–R03 a table drilled by a Dimension (the custom-table kind) ───────────────────────────
  // ONE level (`?by=status`) groups the grid's ROWS and never asks the drill (records-ui 70c60014f1, the ruled
  // behaviour). The drill's answer view is its own mode: a real drill question — a SECOND level, a pivot, a
  // window, a comparison or a trail — opens it (gridDrill.tsx `useGridDrillQuestion`). The merged grid has no
  // button for it (its Group control is the one-level select), so the drill is entered the way a saved link or
  // another page enters it: a two-level address. Status is a choice column, so it is a Dimension (B4-05).
  await ctx.step(["R01", "R02", "R03"], "a clinic table drills (two levels) and its groups add up to the total", admin, async () => {
    doors.length = 0;
    await ctx.goto(admin, `/data/${TABLE}?view=grid&by=status,insurance_provider&show=count`);
    await settle(admin);
    await sleep(800);
    const r = await read(admin);
    const sums = await admin.evaluate(() => {
      const int = (t) => Number((t ?? "").replace(/[^0-9]/g, ""));
      const total = int(document.querySelector("[data-matrx-drill-total] .text-muted-foreground")?.textContent);
      const groups = [...document.querySelectorAll('[data-matrx-drill-level="0"]')].map((row) => {
        const m = (row.textContent ?? "").match(/([\d,]+)\s*records?/i);
        return m ? int(m[1]) : NaN;
      });
      return { total, groups };
    });
    const sum = sums.groups.reduce((a, n) => a + n, 0);
    const adds = Number.isFinite(sum) && sums.total > 0 && sum === sums.total;
    const used = [...new Set(doors.map((d) => `${d.door} ${d.status}`))];
    const asked = doors.some((d) => d.door === "drill_ask" && d.status < 400);
    const described = doors.some((d) => d.door === "drill_describe" && d.status < 400);
    return {
      ok: r.groups > 0 && !r.error && asked && described && adds && !doors.some((d) => d.status >= 400),
      detail: `two-level drill${r.error ? ` (error ${JSON.stringify(r.error.slice(0, 100))})` : ""} at ${admin.url().slice(-60)}: ${r.groups} groups sum ${sum} vs total ${sums.total} (${adds ? "add up" : "DO NOT add up"}); doors ${used.join(", ") || "none seen"}`,
    };
  });

  // ── R05 a member is never handed the platform's usage ───────────────────────────────────────
  const member = await ctx.page("member");
  await ctx.step(["R05"], "test@test.com opening the usage page is refused, sees no platform numbers", member, async () => {
    const memberDoors = [];
    member.on("response", (r) => {
      const m = r.url().match(/\/rpc\/(drill_[a-z_]+|ai_usage_[a-z_]+)/);
      if (m) memberDoors.push({ door: m[1], status: r.status() });
    });
    await ctx.goto(member, `${ctx.manageOrigin}/administration/usage?by=organization&show=cost&w=30d`);
    await sleep(8000);
    const r = await read(member);
    const text = await bodyText(member, 3000);
    const answered = memberDoors.filter((d) => d.status < 400);
    return {
      ok: r.groups === 0 && answered.length === 0,
      detail: `${r.groups} groups drawn; drill doors that answered the member: ${answered.length ? answered.map((d) => d.door).join(", ") : "none"}; page says ${JSON.stringify(text.replace(/\s+/g, " ").slice(0, 120))}`,
    };
  });
} finally {
  await ctx.finish();
}
