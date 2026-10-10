// Helpers for J6: extension side panel (built unpacked extension, headless) and desktop web UI on :1420.
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const WORKSPACE = "/Users/armanisadeghi/code";
const EXT_REPO = `${WORKSPACE}/matrx-extend`;
const EXT_DIR = join(EXT_REPO, process.env.WXT_OUT_DIR || ".output", "chrome-mv3");
const ORGANIZATION_ID = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f";

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}

async function pw() {
  const { chromium } = createRequire(import.meta.url)("playwright");
  return chromium;
}

export async function runExtensionSidePanel({ fault = false } = {}) {
  if (!existsSync(join(EXT_DIR, "manifest.json")) || !existsSync(join(EXT_DIR, "sidepanel.html")))
    return { skip: `no built extension at ${EXT_DIR} (run \`pnpm build\` in matrx-extend; not rebuilt here)` };
  const env = { ...readEnvFile(`${EXT_REPO}/.env`), ...readEnvFile(`${EXT_REPO}/.env.development`) };
  const aid = readEnvFile(`${WORKSPACE}/aidream/.env`);
  const fe = readEnvFile(`${WORKSPACE}/matrx-frontend/.env`);
  const supabaseUrl = env.WXT_SUPABASE_URL;
  const key = env.WXT_SUPABASE_PUBLISHABLE_KEY ?? env.WXT_SUPABASE_ANON_KEY;
  const email = aid.AI_ADMIN_USERNAME ?? fe.AI_ADMIN_USERNAME;
  const password = aid.AI_ADMIN_PASSWORD ?? fe.AI_ADMIN_PASSWORD;
  if (!supabaseUrl || !key || !email || !password) return { skip: "missing WXT_SUPABASE_* (matrx-extend/.env.development) or AI_ADMIN_* (aidream/.env)" };
  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { "Content-Type": "application/json", apikey: key }, body: JSON.stringify({ email, password }),
  }).catch(() => null);
  if (!res?.ok) return { skip: `extension sign-in grant failed (${res?.status ?? "network"}); cannot seed the panel session` };
  const session = await res.json();

  const chromium = await pw();
  const checks = [];
  const check = (name, ok, detail = "") => checks.push({ name, ok: !!ok, detail });
  const context = await chromium.launchPersistentContext("", {
    executablePath: process.env.MATRX_CHROME_PATH ?? chromium.executablePath(),
    headless: true,
    viewport: { width: 420, height: 900 },
    args: ["--headless=new", `--disable-extensions-except=${EXT_DIR}`, `--load-extension=${EXT_DIR}`],
  });
  try {
    // Zero AI spend / read-only: abort any POST to the run endpoints.
    await context.route("**/*", (route) => {
      const r = route.request();
      if (r.method() === "POST" && /\/(ai|agent|agents|chat|execute|conversation)\b/.test(new URL(r.url()).pathname) && !/supabase|\/auth\/|\/rest\//.test(r.url())) return route.abort();
      return route.continue();
    });
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 60000 }).catch(() => null);
    if (!worker) { check("extension service worker started", false, "no service worker within 60s"); return { checks }; }
    const extId = new URL(worker.url()).host;
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    await page.goto(`chrome-extension://${extId}/sidepanel.html?chat=package`);
    await page.evaluate(async ([accessToken, refreshToken, expiresIn, user, org]) => {
      const enc = new TextEncoder();
      const base = await crypto.subtle.importKey("raw", enc.encode("matrx-extend.refresh-token.v1"), { name: "PBKDF2" }, false, ["deriveKey"]);
      const k = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: enc.encode(chrome.runtime.id), iterations: 100000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, enc.encode(refreshToken)));
      const b64 = (b) => btoa(String.fromCharCode(...b));
      await chrome.storage.local.set({
        "matrx.auth.accessToken": accessToken, "matrx.auth.refreshTokenEnc": b64(ct), "matrx.auth.refreshTokenIv": b64(iv),
        "matrx.auth.expiresAt": Date.now() + expiresIn * 1000, "matrx.user.profile": user, "matrx.org.active": org,
      });
    }, [session.access_token, session.refresh_token, session.expires_in ?? 3600, session.user, { id: ORGANIZATION_ID, name: "Admin's Workspace" }]);
    await page.reload();
    const root = page.locator("[data-package-chat]");
    await root.waitFor({ timeout: 60000 }).catch(() => undefined);
    check("side panel renders the package chat shell", (await root.count()) > 0);
    // FAULT: a composer that cannot exist (the shell has no such element).
    const composer = page.locator(fault ? "[data-package-chat] textarea[data-fault-nonexistent]" : "[data-package-chat] textarea").first();
    await composer.waitFor({ timeout: fault ? 8000 : 60000 }).catch(() => undefined);
    // The composer may be disabled while the session/agent loads; give it time to become editable.
    let editable = false;
    for (let i = 0; i < (fault ? 2 : 40) && !editable; i++) { editable = await composer.isEditable({ timeout: 1000 }).catch(() => false); if (!editable) await page.waitForTimeout(1500); }
    check("composer is ready (editable textarea)", editable, editable ? "" : `shell text: ${((await root.innerText().catch(() => "")) || "").slice(0, 120).replace(/\s+/g, " ")}`);
    const text = ((await root.innerText().catch(() => "")) || "").trim();
    check("package chat shell shows text (not blank)", text.length > 0, `${text.length} chars`);
    check("no sign-in failure banner", (await page.getByText(/Could not (restore|verify) your saved sign-in/).count()) === 0);
    const standIns = await page.locator("[data-package-chat] [data-chat-slot-fallback]").evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute("data-chat-slot-fallback")))]);
    check("no host-slot stand-ins", standIns.length === 0, standIns.join(", "));
  } catch (e) {
    check("side panel journey ran to the end", false, String(e?.message ?? e).split("\n")[0]);
  } finally {
    await context.close().catch(() => undefined);
  }
  return { checks };
}

const DESKTOP = "http://127.0.0.1:1420";
export async function desktopReachable() {
  const r = await fetch(DESKTOP, { signal: AbortSignal.timeout(5000) }).catch(() => null);
  if (!r) return { skip: `nothing answers on ${DESKTOP} (desktop web UI not running; not started here to avoid colliding with the e2e setup)` };
  return { ok: true };
}

export async function runDesktopChat({ fault = false } = {}) {
  // Desktop sign-in goes through matrx-local's harness session (e2e/setup/harness-session.mjs); without it the surface cannot be reached as a person.
  const checks = [];
  const check = (name, ok, detail = "") => checks.push({ name, ok: !!ok, detail });
  const chromium = await pw();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);
    await page.goto(`${DESKTOP}/cloud-chat?chat=package`, { waitUntil: "domcontentloaded" });
    const root = page.locator("[data-package-chat]");
    await root.waitFor({ timeout: 60000 }).catch(() => undefined);
    const gated = /sign in|log in/i.test(await page.evaluate(() => document.body.innerText).catch(() => "")) && (await root.count()) === 0;
    if (gated) check("desktop package chat reachable (not blocked at sign-in)", false, "desktop UI is on its sign-in screen; harness session not applied");
    else {
      const composer = page.locator(fault ? "[data-package-chat] textarea[data-fault-nonexistent]" : "[data-package-chat] textarea").first();
      await composer.waitFor({ timeout: fault ? 8000 : 60000 }).catch(() => undefined);
      check("desktop package chat renders its composer", await composer.isEditable({ timeout: 1000 }).catch(() => false));
    }
  } finally { await browser.close().catch(() => undefined); }
  return { checks };
}
