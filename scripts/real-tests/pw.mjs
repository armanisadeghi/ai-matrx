#!/usr/bin/env node
// A private headless Chrome per real-test run, driven one command at a time.
// Each run owns its browser (own cookies, never the shared browser pane, never a person's session).
// Usage: node pw.mjs <run> <command> [args]
//   start                      launch this run's Chrome (idempotent)
//   goto <url>                 navigate and wait for load
//   chat [agentId] [origin]    open /chat/a/<agentId> (default: the cheap Chat Plumbing Test Agent, ccab43ad-…) on origin (default: current origin, else https://www.aimatrx.com)
//   url | title                print the current address / title
//   text [selector] [max]      innerText of the page or an element (default 8000 chars)
//   find <text>                list visible elements whose text contains <text> (role, text, box)
//   click <locator>            real mouse click (Playwright locator: text=…, role=button[name="…"], css)
//   rclick <locator>           real right-click
//   hover <locator>            real hover
//   clickxy <x> <y> | rclickxy <x> <y>
//   type <text>                real keystrokes into the focused element
//   press <key>                e.g. Enter, Escape, Meta+a
//   upload <locator> <file...> set files on a file input
//   eval <js>                  evaluate an expression in the page, print JSON
//   shot <path>                screenshot (viewport) to a PNG
//   console                    errors logged since the last call (needs `start` first)
//   stop                       close this run's Chrome
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { markBrowserAgentTraffic } from "../lib/agent-traffic.mjs";

const require = createRequire("/Users/armanisadeghi/code/matrx-frontend/package.json");
const { chromium } = require("playwright");
const [run, cmd, ...args] = process.argv.slice(2);
if (!run || !cmd) { console.error("usage: node pw.mjs <run> <command> [args]"); process.exit(2); }
const dir = path.join(os.tmpdir(), "matrx-real-test-browsers", run);
fs.mkdirSync(dir, { recursive: true });
const profile = path.join(dir, "profile");
const portFile = path.join(dir, "port"); // the port this run's own Chrome reported (informational)
const activePort = path.join(profile, "DevToolsActivePort");

// THIS RUN'S BROWSER, AND ONLY IT (2026-10-03). The old launcher picked a debug
// port at random and trusted whatever answered on 127.0.0.1:<port>. Chrome
// launched on a port another run's Chrome already held binds [::1]:<port> and
// keeps running, so this run's commands drove the OTHER run's page (a person's
// notes "switched" and their typing landed in another note). Now Chrome picks a
// free port itself (port 0) and writes it, with its own browser id, into
// <profile>/DevToolsActivePort; we connect only to that exact
// ws://…/devtools/browser/<id>, which any other Chrome refuses.
// Guard: pw.isolation.test.mjs.
function endpoints() {
  try {
    const [port, wsPath] = fs.readFileSync(activePort, "utf8").trim().split("\n");
    if (!/^\d+$/.test(port) || !wsPath?.startsWith("/devtools/browser/")) return [];
    return [`ws://127.0.0.1:${port}${wsPath}`, `ws://[::1]:${port}${wsPath}`];
  } catch { return []; }
}
async function connectOwn() {
  for (const ws of endpoints()) {
    try { return await chromium.connectOverCDP(ws, { timeout: 5000 }); } catch {}
  }
  return null;
}

async function start() {
  const own = await connectOwn();
  if (own) { await own.close().catch(() => {}); return console.log("running"); }
  fs.rmSync(activePort, { force: true });
  const child = spawn(chromium.executablePath(), [
    "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
    "--window-size=1440,900", "--no-first-run", "--no-default-browser-check", "about:blank",
  ], { detached: true, stdio: "ignore" });
  child.unref();
  for (let i = 0; i < 75; i++) {
    const b = await connectOwn();
    if (b) {
      await b.close().catch(() => {});
      fs.writeFileSync(portFile, fs.readFileSync(activePort, "utf8").split("\n")[0].trim());
      return console.log(`started on ${fs.readFileSync(portFile, "utf8")}`);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("chrome did not start");
}

if (cmd === "start") { await start(); process.exit(0); }
const browser = await connectOwn();
if (!browser) { console.error(`run ${run} has no browser of its own running; use: node pw.mjs ${run} start`); process.exit(1); }
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => !p.url().startsWith("devtools")) ?? (await ctx.newPage());
await page.setViewportSize({ width: 1440, height: 900 });
const errFile = path.join(dir, "console.json");
await page.exposeBinding?.("__noop", () => {}).catch(() => {});
await page.evaluate(() => {
  if (window.__rtErrs) return; window.__rtErrs = [];
  const orig = console.error; console.error = (...a) => { window.__rtErrs.push(a.map(String).join(" ").slice(0, 400)); orig(...a); };
}).catch(() => {});
const L = (s) => page.locator(s).first();
const out = (v) => console.log(typeof v === "string" ? v : JSON.stringify(v, null, 1));
switch (cmd) {
  case "goto": await markBrowserAgentTraffic(ctx, "real-tests", args[0]).catch(() => {}); await page.goto(args[0], { waitUntil: "load", timeout: 120000 }); out(page.url()); break;
  case "chat": { const id = args[0] || process.env.CHAT_TEST_AGENT_ID || "ccab43ad-05e4-45d6-a49f-8e5605ed66f5"; const cur = page.url(); const origin = args[1] || (/^https?:/.test(cur) ? new URL(cur).origin : "https://www.aimatrx.com"); const u = `${origin}/chat/a/${id}`; await markBrowserAgentTraffic(ctx, "real-tests", u).catch(() => {}); await page.goto(u, { waitUntil: "load", timeout: 120000 }); out(page.url()); break; }
  case "url": out(page.url()); break;
  case "title": out(await page.title()); break;
  case "text": { const max = Number(args[1] ?? 8000); const t = args[0] ? await L(args[0]).innerText() : await page.evaluate(() => document.body.innerText); out(t.slice(0, max)); break; }
  case "find": out(await page.evaluate((needle) => [...document.querySelectorAll("body *")].filter((e) => e.children.length < 3 && e.innerText && e.innerText.includes(needle) && e.getBoundingClientRect().width > 0).slice(0, 25).map((e) => { const b = e.getBoundingClientRect(); return { tag: e.tagName, role: e.getAttribute("role"), aria: e.getAttribute("aria-label"), text: e.innerText.slice(0, 80), x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }; }), args.join(" "))); break;
  case "click": await L(args.join(" ")).click({ timeout: 15000 }); out("clicked"); break;
  case "rclick": await L(args.join(" ")).click({ button: "right", timeout: 15000 }); out("right-clicked"); break;
  case "hover": await L(args.join(" ")).hover({ timeout: 15000 }); out("hovered"); break;
  case "clickxy": await page.mouse.click(Number(args[0]), Number(args[1])); out("clicked"); break;
  case "rclickxy": await page.mouse.click(Number(args[0]), Number(args[1]), { button: "right" }); out("right-clicked"); break;
  case "type": await page.keyboard.type(args.join(" "), { delay: 10 }); out("typed"); break;
  case "press": await page.keyboard.press(args[0]); out("pressed"); break;
  case "upload": await L(args[0]).setInputFiles(args.slice(1)); out("uploaded"); break;
  // Labelled so a script's own return value (e.g. scrollTo's) is never mistaken for page text.
  case "eval": console.log("[eval result] " + JSON.stringify(await page.evaluate(args.join(" ")))); break;
  case "shot": await page.screenshot({ path: args[0] }); out(args[0]); break;
  case "console": out(await page.evaluate(() => { const e = window.__rtErrs ?? []; window.__rtErrs = []; return e; })); break;
  case "stop": {
    // browser.close() on a CDP connection only disconnects; Browser.close ends this run's Chrome.
    try { await (await browser.newBrowserCDPSession()).send("Browser.close"); } catch {}
    fs.rmSync(portFile, { force: true }); fs.rmSync(activePort, { force: true }); out("stopped"); break;
  }
  default: console.error(`unknown command ${cmd}`); process.exit(2);
}
process.exit(0);
