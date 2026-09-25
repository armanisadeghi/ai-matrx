// LANE GATES-TAIL (VERIFIER-21 #1n) — headless proof on the shared preview: on a schedule's own
// page (fresh session, no organization picked), Pause does not flip while the PATCH is in flight
// (it reads "Pausing…"), a refused PATCH (injected 500 at the network) leaves it at Pause and the
// toast says it in words with a remedy — never METHOD /path STATUS — and a held-then-accepted
// PATCH flips it only after the answer.
//
// Seat: admin@admin.com via the login form (credentials from .env.local, never printed). The
// disposable schedule is admin's own ("Maple Court duplex — Friday rent-roll reminder", enabled,
// interval 7 days, admin's Quick Test Agent) and ends soft-deleted.
// Usage: node scripts/gates-tail-schedule-toggle-walk.mjs <outDir>
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
const ORIGIN = process.env.GATES_TAIL_ORIGIN ?? "http://gates-tail.localhost:3001";
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
  kind: "agent", title: "Maple Court duplex — Friday rent-roll reminder", description: "Remind the property manager to send the Maple Court rent roll before Friday.",
  surfaces: ["any"], tags: [], queue: "default", expires_at: null, enabled: true,
  agent_task: { agent_id: AGENT, prompt: "Remind the Maple Court property manager to send the rent roll to the owner before Friday.", variables: {}, persistent_conversation_id: null, auth_mode: "ask", max_runtime_seconds: 600, max_concurrent: 1 },
  trigger: { type: "interval", config: { every_seconds: 604800 }, enabled: true },
}) })).json();
const id = created?.task?.id ?? created?.id;
if (!id) throw new Error(`could not create the disposable schedule: ${JSON.stringify(created).slice(0, 300)}`);
console.log(`disposable schedule: ${id}`);

const report = { id };
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const page = await context.newPage();
  console.log(`seat: ${await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin")}`);
  let mode = "fail";
  await context.route(new RegExp(`/scheduler/tasks/${id}$`), async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    await new Promise((r) => setTimeout(r, 3000));
    if (mode === "fail") return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "injected failure" }) });
    return route.continue();
  });
  await page.goto(`${ORIGIN}/schedules/${id}`, { waitUntil: "domcontentloaded", timeout: 240000 });
  const dismiss = page.getByRole("button", { name: /Dismiss for today/ });
  if (await dismiss.waitFor({ state: "visible", timeout: 15000 }).then(() => true).catch(() => false)) await dismiss.click();
  report.headerChooseOrg = await page.evaluate(() => document.body.innerText.includes("Choose org"));
  const labels = async () => page.evaluate(() => [...document.querySelectorAll("button")].map((b) => b.textContent?.trim()).filter((t) => /^(Pause|Enable|Pausing…|Enabling…)$/.test(t ?? "")));
  await page.getByRole("button", { name: /^Pause$/ }).first().waitFor({ timeout: 240000 });
  await page.getByRole("button", { name: /^Pause$/ }).first().click();
  await page.waitForTimeout(1200);
  report.failAt1200 = await labels();
  await page.screenshot({ path: `${OUT}/schedule-pausing-1200ms.png` });
  await page.waitForTimeout(3500);
  report.failAfter = await labels();
  report.failToast = await page.evaluate(() => [...document.querySelectorAll("[data-sonner-toast]")].map((t) => t.textContent?.trim()));
  await page.screenshot({ path: `${OUT}/schedule-refused-toast.png` });
  report.dbAfterFail = await readTask(id);
  mode = "pass";
  await page.getByRole("button", { name: /^Pause$/ }).first().click();
  await page.waitForTimeout(1200);
  report.passAt1200 = await labels();
  await page.waitForTimeout(4000);
  report.passAfter = await labels();
  report.dbAfterPass = await readTask(id);
  await page.screenshot({ path: `${OUT}/schedule-paused-after-answer.png` });
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
