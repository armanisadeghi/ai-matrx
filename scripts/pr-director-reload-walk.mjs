#!/usr/bin/env node
// scripts/pr-director-reload-walk.mjs — a sent question survives a Press Room reload at ANY moment.
//
// Headless (no visible window). Signs in as admin@admin.com through the app's own login form, opens
// the Press Room at 1280px, sends a question to the PR Director, reloads at the given moment, and
// records what the panel shows afterwards: the same conversation id in the URL, the panel open, and
// the question present in the transcript. Each moment uses a fresh question so the runs never mix.
//
//   ORIGIN=http://pr-reload-walk.localhost:3001 node scripts/pr-director-reload-walk.mjs
//
// Moments: 0.5 s after sending, 2 s after sending, and mid-stream (once answer text has started).

import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { signIn, until, sleep } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://pr-reload-walk.localhost:3001";
const BRAND = process.env.BRAND ?? "all-green-recycling";
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

async function unpark() {
  if (!page.url().includes("__dev-walk")) return;
  await page.getByRole("button", { name: /Resume/ }).first().click().catch(() => {});
  await sleep(4000);
}
async function openPressRoom(query = "") {
  const url = `${ORIGIN}/marketing/${BRAND}/pr${query}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 300000 });
  await unpark();
  if (page.url().includes("__dev-walk")) await page.goto(url, { waitUntil: "domcontentloaded", timeout: 300000 });
}
const panelText = () =>
  page.evaluate(() => document.querySelector('[data-testid="pr-director-panel"]')?.innerText ?? "");
const panelOpen = () =>
  page.evaluate(() => {
    const a = document.querySelector('aside[aria-label="PR Director column"]');
    return a ? a.getBoundingClientRect().width > 0 : false;
  });
const directorParam = () => new URL(page.url()).searchParams.get("director");

await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
const who = await page.evaluate(async () => {
  const r = await fetch("/api/auth/whoami").catch(() => null);
  return r && r.ok ? (await r.json().catch(() => null))?.email ?? null : null;
});
console.log(`[walk] signed in${who ? ` as ${who}` : ""}`);

const moments = [
  { name: "0.5s", wait: async () => sleep(500) },
  { name: "2s", wait: async () => sleep(2000) },
  {
    name: "mid-stream",
    wait: async () =>
      until("answer text streaming", async () => /Reasoning|Thought process|\w{20,}/.test((await panelText()).split("\n").slice(-6).join(" ")), 90000),
  },
];

const results = [];
for (const moment of moments) {
  // A fresh conversation for each moment.
  await openPressRoom();
  await until("the Press Room", async () => (await page.locator('[data-testid="pr-director-panel"]').count()) > 0, 240000);
  await sleep(1500);
  if (!(await panelOpen())) {
    await page.locator("button:visible", { hasText: /^PR Director$/ }).first().click();
  }
  await until("the composer", async () => page.locator('[data-testid="pr-director-panel"] textarea').first().isVisible(), 240000);
  if (await page.getByRole("button", { name: "New conversation" }).isVisible().catch(() => false)) {
    await page.getByRole("button", { name: "New conversation" }).click();
    await sleep(2000);
  }
  const question = `Reload walk ${moment.name} ${Date.now()}: in one sentence, what is our best PR move?`;
  const box = page.locator('[data-testid="pr-director-panel"] textarea').first();
  await box.click();
  await box.fill(question);
  await box.press("Enter");
  await moment.wait();
  const before = directorParam();
  await page.reload({ waitUntil: "domcontentloaded" });
  await unpark();
  const landed = await until(
    "the question back in the panel",
    async () => (await panelText()).includes(question.slice(0, 40)),
    60000,
  );
  results.push({
    moment: moment.name,
    idBeforeReload: before,
    idAfterReload: directorParam(),
    panelOpenAfterReload: await panelOpen(),
    questionVisibleAfterReload: Boolean(landed.v),
    panelTail: (await panelText()).replace(/\s+/g, " ").slice(-200),
  });
  console.log(JSON.stringify(results.at(-1)));
}

await browser.close();
const ok = results.every((r) => r.idBeforeReload && r.idBeforeReload === r.idAfterReload && r.panelOpenAfterReload && r.questionVisibleAfterReload);
console.log(ok ? "[walk] PASS: every reload kept the question and reopened the conversation" : "[walk] FAIL");
process.exit(ok ? 0 : 1);
