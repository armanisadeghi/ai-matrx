// LANE ORG-GATE-AUDIT (VERIFIER-20 #1) — headless proof on the shared preview: on a schedule's
// own page, with NO organization selected in a fresh session, Pause and Delete write through
// the SCHEDULE'S OWN organization (the object names it; the picker is never asked), the control
// reads the truth after a reload, and Delete actually retires the schedule.
//
// Seat: admin@admin.com via the login form (credentials from .env.local, never printed). The
// disposable schedule is admin's own ("Harbor Point weekly walk-through reminder", paused,
// interval 7 days, admin's Quick Test Agent) and ends soft-deleted.
// Usage: node scripts/org-gate-schedule-walk.mjs <outDir>
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { signIn } from "./lib/seat-browser.mjs";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const env = Object.fromEntries(
  readFileSync(resolve(ROOT, ".env.local"), "utf8").split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const ORIGIN = process.env.ORG_GATE_ORIGIN ?? "http://org-gate-audit.localhost:3001";
const OUT = process.argv[2] ?? "/tmp";
const ORG = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f"; // admin's Workspace
const AGENT = "92c37a37-7630-4517-b2a2-b6f1d2427208"; // admin's Quick Test Agent
const SERVER = "https://server.app.matrxserver.com";

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const { data: auth, error: authErr } = await sb.auth.signInWithPassword({ email: env.AI_ADMIN_USERNAME, password: env.AI_ADMIN_PASSWORD });
if (authErr) throw authErr;
const api = (path, init = {}) => fetch(`${SERVER}${path}`, {
  ...init, headers: { Authorization: `Bearer ${auth.session.access_token}`, "X-Organization-Id": ORG, "Content-Type": "application/json", ...(init.headers ?? {}) },
});
const readTask = async (id) => (await sb.schema("scheduler").from("sch_task").select("id, enabled, deleted_at, organization_id").eq("id", id).single()).data;

const created = await (await api("/scheduler/tasks", { method: "POST", body: JSON.stringify({
  kind: "agent", title: "Harbor Point weekly walk-through reminder", description: "Remind the site lead to walk Harbor Point before Friday's owner meeting.",
  surfaces: ["any"], tags: [], queue: "default", expires_at: null, enabled: true,
  agent_task: { agent_id: AGENT, prompt: "Remind the Harbor Point site lead to walk the unit list before Friday's owner meeting.", variables: {}, persistent_conversation_id: null, auth_mode: "ask", max_runtime_seconds: 600, max_concurrent: 1 },
  trigger: { type: "interval", config: { every_seconds: 604800 }, enabled: true },
}) })).json();
const id = created?.task?.id ?? created?.id;
if (!id) throw new Error(`could not create the disposable schedule: ${JSON.stringify(created).slice(0, 300)}`);
console.log(`disposable schedule: ${id}`);

const report = { id };
const browser = await chromium.launch({ headless: true });
try {
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
  console.log(`seat: ${await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin")}`);
  const writes = [];
  page.on("request", (r) => {
    if (/\/scheduler\/tasks\//.test(r.url()) && r.method() !== "GET") writes.push({ method: r.method(), org: r.headers()["x-organization-id"] ?? null, body: r.postData()?.slice(0, 80) ?? null });
  });
  await page.goto(`${ORIGIN}/schedules/${id}`, { waitUntil: "domcontentloaded", timeout: 240000 });
  const dismiss = page.getByRole("button", { name: /Dismiss for today/ });
  if (await dismiss.waitFor({ state: "visible", timeout: 20000 }).then(() => true).catch(() => false)) await dismiss.click();
  report.activeOrgBefore = await page.evaluate(() => document.body.innerText.includes("Choose org"));
  const pause = page.getByRole("button", { name: /^Pause$/ }).first();
  await pause.waitFor({ timeout: 240000 });
  await pause.click();
  report.dialogOnPause = await page.getByText("Which workspace is this for?").isVisible({ timeout: 4000 }).catch(() => false);
  for (let i = 0; i < 20 && !writes.length; i += 1) await page.waitForTimeout(500);
  await page.waitForTimeout(1500);
  report.afterPause = { writes: [...writes], db: await readTask(id), toasts: await page.evaluate(() => [...document.querySelectorAll("[data-sonner-toast]")].map((t) => t.textContent?.trim())) };
  await page.screenshot({ path: `${OUT}/schedule-after-pause.png` });
  await page.reload({ waitUntil: "domcontentloaded" });
  report.afterReloadReadsEnable = await page.getByRole("button", { name: /^Enable$/ }).first().isVisible({ timeout: 120000 }).catch(() => false);
  await page.screenshot({ path: `${OUT}/schedule-after-reload.png` });

  writes.length = 0;
  await page.getByRole("button", { name: /^Delete$/ }).first().click();
  await page.getByRole("alertdialog").getByRole("button", { name: /^Delete$/ }).click();
  report.dialogOnDelete = await page.getByText("Which workspace is this for?").isVisible({ timeout: 4000 }).catch(() => false);
  for (let i = 0; i < 20 && !writes.length; i += 1) await page.waitForTimeout(500);
  await page.waitForTimeout(2000);
  report.afterDelete = { writes: [...writes], url: page.url(), db: await readTask(id) };
  await page.screenshot({ path: `${OUT}/schedule-after-delete.png` });
} finally {
  await browser.close();
  const t = await readTask(id);
  if (t && !t.deleted_at) {
    const res = await api(`/scheduler/tasks/${id}`, { method: "DELETE" });
    console.log(`retired by the walk itself: ${res.status}`);
  }
  report.final = await readTask(id);
}
console.log(JSON.stringify(report, null, 2));
