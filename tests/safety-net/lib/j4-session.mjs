// Resilient sign-in for the chat journey: the shared preview parks idle tabs ("Preview paused" / Resume this preview)
// when other lanes need its slot, and the stock sign-in does not resume a parked tab. Do what a person does: press Resume, retry.
import { signIn } from "../../../scripts/lib/seat-browser.mjs";
import { sleep } from "./harness.mjs";

export async function resumeIfParked(page) {
  const resume = page.getByText("Resume this preview");
  if (await resume.isVisible({ timeout: 1500 }).catch(() => false)) { await resume.click().catch(() => undefined); await sleep(2500); return true; }
  return false;
}

export async function signInResilient(s, attempts = 5) {
  let last = "";
  for (let i = 1; i <= attempts; i++) {
    try {
      await s.page.goto(`${s.origin}/login`, { waitUntil: "domcontentloaded", timeout: 180000 }).catch(() => undefined);
      await resumeIfParked(s.page);
      // Watch for the park page appearing mid sign-in and resume it in the background.
      const timer = setInterval(() => { resumeIfParked(s.page).catch(() => undefined); }, 5000);
      try { s.email = await signIn(s.page, s.origin, s.env.AI_ADMIN_USERNAME, s.env.AI_ADMIN_PASSWORD, "admin"); } finally { clearInterval(timer); }
      if (s.email) return s.email;
    } catch (e) { last = String(e?.message ?? e).split("\n")[0]; console.log(`  sign-in attempt ${i}/${attempts} failed: ${last}`); }
    await sleep(15000);
  }
  throw new Error(`could not sign in after ${attempts} attempts (${last})`);
}

/** open() that survives ERR_ABORTED redirects / parked tabs under load. */
export async function openRetry(s, path, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      await s.page.goto(`${s.origin}${path}`, { waitUntil: "domcontentloaded", timeout: 240000 });
      await resumeIfParked(s.page);
      return;
    } catch (e) {
      last = e;
      await sleep(5000);
      await resumeIfParked(s.page);
    }
  }
  throw last;
}
