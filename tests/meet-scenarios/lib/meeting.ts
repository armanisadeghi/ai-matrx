/**
 * MEETING — the moves every scenario repeats, done the way a person does them
 * (through the UI), plus a cleanup that guarantees the meeting ends.
 */
import { expect, type Locator, type Page } from "@playwright/test";
import { formatDurationMs } from "@ai-matrx/kit/format";
import type { Actor } from "./actor";
import { supabasePublic } from "./env";
import { observe, summarize, type CallPhase, type Observation } from "./observe";

export interface Meeting {
  slug: string;
  path: string;
  /** Everyone who touched it — their tabs are used to end it if the UI path fails. */
  host: Actor;
}

/**
 * The shared dev server caps concurrent agent walks against the live database
 * (utils/supabase/walkCap.ts) and parks an evicted host behind "Resume this
 * preview". That is the environment, not the product: resume through its own
 * explicit form and record it in the timeline as an ENV interruption.
 */
export async function resumeIfParked(actor: Actor, page: Page = actor.page): Promise<boolean> {
  const resume = page.getByRole("button", { name: "Resume this preview" });
  if (!(await resume.isVisible().catch(() => false))) return false;
  actor.env("preview paused by the walk cap; resuming");
  await resume.click();
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  return true;
}

/** Poll what the person sees until `ok` holds; on timeout the message carries the evidence. */
export async function seeUntil(
  actor: Actor,
  what: string,
  ok: (o: Observation) => boolean,
  timeoutMs: number,
  page: Page = actor.page,
): Promise<Observation> {
  const deadline = Date.now() + timeoutMs;
  let last: Observation = await observe(page);
  while (Date.now() < deadline) {
    await resumeIfParked(actor, page);
    last = await observe(page);
    actor.saw(last);
    if (ok(last)) {
      actor.note(`SAW ${what}: ${summarize(last)}`);
      return last;
    }
    await page.waitForTimeout(500).catch(() => undefined);
  }
  actor.note(`NEVER SAW ${what} in ${formatDurationMs(timeoutMs, { style: "compact" })}: ${summarize(last)}`);
  expect(ok(last), `${actor.opts.label} should see ${what} within ${formatDurationMs(timeoutMs, { style: "compact" })}; saw ${summarize(last)}`).toBe(true);
  return last;
}

export const seePhase = (actor: Actor, phases: CallPhase[], timeoutMs: number, page?: Page) =>
  seeUntil(actor, `phase ${phases.join("|")}`, (o) => phases.includes(o.phase), timeoutMs, page);

/** Assert a condition STAYS true (or never becomes true) for `ms` of real time. */
export async function keepsSeeing(
  actor: Actor,
  what: string,
  ok: (o: Observation) => boolean,
  ms: number,
  page: Page = actor.page,
): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const o = await observe(page);
    actor.saw(o);
    if (!ok(o)) {
      actor.note(`STOPPED seeing ${what}: ${summarize(o)}`);
      expect(false, `${actor.opts.label} should keep seeing ${what} for ${formatDurationMs(ms, { style: "compact" })}; saw ${summarize(o)}`).toBe(true);
    }
    await page.waitForTimeout(1000).catch(() => undefined);
  }
  actor.note(`kept seeing ${what} for ${formatDurationMs(ms, { style: "compact" })}`);
}

/**
 * Poll for a CONTROL the person can see and use (a button, a choice). Honest evidence: SAW only when
 * it is visible; otherwise NEVER SAW plus a failure carrying what the person saw instead.
 */
export async function seeControl(actor: Actor, what: string, control: Locator, timeoutMs: number, page: Page = actor.page): Promise<Locator> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await resumeIfParked(actor, page);
    if (await control.first().isVisible().catch(() => false)) {
      actor.note(`SAW control ${what}`);
      return control.first();
    }
    await page.waitForTimeout(300).catch(() => undefined);
  }
  const o = await observe(page);
  actor.saw(o);
  actor.note(`NEVER SAW control ${what} in ${formatDurationMs(timeoutMs, { style: "compact" })}: ${summarize(o)}`);
  expect(false, `${actor.opts.label} should see ${what} within ${formatDurationMs(timeoutMs, { style: "compact" })}; saw ${summarize(o)}`).toBe(true);
  return control.first();
}

/** The first token request this person's page sent (its URL and body are the probe template). */
export function firstTokenRequest(actor: Actor): { url: string; body: Record<string, unknown> } {
  const call = actor.tokenCalls.find((c) => c.body !== null);
  if (!call || !call.body) throw new Error(`${actor.opts.label} never called the token door; nothing to replay`);
  return { url: call.url, body: call.body };
}

/**
 * Knock on the token door AS this person (their own session, their own name), with the request
 * shape the product itself sent. Returns the HTTP status; the evidence line never carries a token.
 */
export async function tokenProbe(actor: Actor, template: { url: string; body: Record<string, unknown> }, displayName: string): Promise<number> {
  const s = await actor.session();
  const body = { ...template.body, display_name: displayName, device_id: `harness-probe-${Math.random().toString(36).slice(2, 10)}`, guest: s === null };
  const res = await fetch(template.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(s ? { Authorization: `Bearer ${s.token}` } : {}) },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const minted = res.ok && /"token"\s*:/.test(text);
  actor.note(`token door probe as ${displayName}: HTTP ${res.status}${minted ? " — a LiveKit token was MINTED" : ` — ${text.replace(/"token"\s*:\s*"[^"]+"/g, '"token":"…"').slice(0, 160)}`}`);
  return res.status;
}

/** Host: /meetings → Start now (picking an organization if asked) → the meeting's pre-join. */
export async function startInstantMeeting(host: Actor): Promise<Meeting> {
  const page = host.page;
  await resumeIfParked(host, page);
  if (!new URL(page.url()).pathname.startsWith("/meetings")) await page.goto("/meetings");
  await resumeIfParked(host, page);
  const start = page.getByRole("button", { name: /Start an instant meeting now|Start now/ });
  await start.first().waitFor({ state: "visible", timeout: 90_000 });
  await start.first().click();
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline && !/\/meet\//.test(page.url())) {
    // The organization picker ("Which organization is this for?") — choose the first.
    const picker = page.getByText(/Which organization is this for/i);
    if (await picker.isVisible().catch(() => false)) {
      const option = page.locator('[role="dialog"] [role="option"], [role="dialog"] button, [role="menu"] [role="menuitem"]')
        .filter({ hasNotText: /cancel|close/i });
      host.note(`org picker shown (${await option.count()} options)`);
      await option.first().click();
    }
    await page.waitForTimeout(500);
  }
  const m = page.url().match(/\/meet\/([^/?#]+)/);
  if (!m) throw new Error(`Start now did not open a meeting; at ${page.url()}`);
  host.note(`meeting started: /meet/${m[1]}`);
  return { slug: m[1], path: `/meet/${m[1]}`, host };
}

export interface WalkOptions {
  until?: CallPhase[];
  page?: Page;
  timeoutMs?: number;
  /**
   * false = no user activation ever reaches the document (script-dispatched
   * input and clicks), so the browser's autoplay policy stays closed — the
   * shape of a guest admitted long after their last real click.
   */
  gesture?: boolean;
}

/**
 * Walk the door until the person reaches one of `until`: types a guest name,
 * presses Join now. Returns what they see at the end.
 */
export async function walkIn(actor: Actor, meeting: Meeting, opts: WalkOptions = {}): Promise<Observation> {
  const until = opts.until ?? ["in-call", "knocking"];
  const page = opts.page ?? actor.page;
  const gesture = opts.gesture ?? true;
  if (!page.url().includes(meeting.path)) {
    for (let attempt = 1; ; attempt++) {
      try {
        await page.goto(meeting.path, { waitUntil: "domcontentloaded" });
        break;
      } catch (e) {
        if (attempt >= 3) throw e;
        actor.note(`ENV: opening the link failed (${(e as Error).message.slice(0, 80)}); retrying`);
        await page.waitForTimeout(15_000);
      }
    }
  }
  const deadline = Date.now() + (opts.timeoutMs ?? 90_000);
  let o = await observe(page);
  let lastAction = "";
  let lastAt = 0;
  // A press that did not move the screen within this long is pressed again (never a single try).
  const RETRY_MS = 8000;
  const due = (action: string) => lastAction !== action || Date.now() - lastAt > RETRY_MS;
  while (Date.now() < deadline) {
    await resumeIfParked(actor, page);
    o = await observe(page);
    actor.saw(o);
    if (until.includes(o.phase)) break;
    // The name step is read from the field itself: the core may render it under `prejoin`
    // until the contract's `guest_name` phase is adopted (CORE-DESIGN §3.7 C1).
    const nameStep = o.phase === "guest-name" || (await page.locator("#meet-guest-name").isVisible().catch(() => false));
    if (nameStep && due("name")) {
      const name = actor.opts.displayName ?? "Priya Shah";
      if (gesture) {
        await page.locator("#meet-guest-name").fill(name);
        await page.locator("#meet-guest-name").press("Enter");
      } else {
        await page.evaluate((n) => {
          const input = document.querySelector<HTMLInputElement>("#meet-guest-name");
          if (!input) return;
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
          setter?.call(input, n);
          input.dispatchEvent(new Event("input", { bubbles: true }));
          // A script click carries no user activation (unlike Playwright's real click).
          window.setTimeout(() => {
            const submit = input.form?.querySelector<HTMLButtonElement>('button[type="submit"]');
            if (submit) submit.click();
            else input.form?.requestSubmit();
          }, 150);
        }, name);
      }
      actor.note(`${lastAction === "name" ? "retyped" : "typed"} name "${name}"${gesture ? "" : " (no gesture)"}`);
      lastAction = "name";
      lastAt = Date.now();
    } else if (o.phase === "prejoin" && due("join")) {
      const join = page.getByRole("button", { name: /^Join now$/ });
      if (await join.isEnabled().catch(() => false)) {
        if (gesture) await join.click();
        else await join.evaluate((el) => (el as HTMLButtonElement).click());
        actor.note(`${lastAction === "join" ? "pressed Join now AGAIN (the first press did not move the screen)" : "pressed Join now"}${gesture ? "" : " (no gesture)"}`);
        lastAction = "join";
        lastAt = Date.now();
      }
    }
    await page.waitForTimeout(500);
  }
  actor.note(`walked in -> ${summarize(o)}`);
  expect(until, `${actor.opts.label} should reach ${until.join("|")}; saw ${summarize(o)}`).toContain(o.phase);
  return o;
}

/** Press Leave the way a person does; if a leave menu opens, choose plain "Leave meeting". */
export async function leave(actor: Actor, page: Page = actor.page): Promise<void> {
  await page.getByRole("button", { name: /^Leave( call| meeting)?$/ }).first().click();
  const plain = page.getByRole("button", { name: /^Leave (the )?meeting$|^Just leave$/ });
  if (await plain.first().isVisible({ timeout: 2000 }).catch(() => false)) await plain.first().click();
  actor.note("pressed Leave");
}

async function openPeople(page: Page): Promise<void> {
  const people = page.getByRole("button", { name: /^People\b/ });
  if ((await page.getByRole("region", { name: "Waiting room" }).count()) === 0 && (await people.count()) > 0) {
    await people.first().click();
  }
}

export async function admit(host: Actor, name: string, page: Page = host.page): Promise<void> {
  await openPeople(page);
  const btn = page.getByRole("button", { name: `Admit ${name}` });
  await btn.first().waitFor({ state: "visible", timeout: 30_000 });
  await btn.first().click();
  host.note(`admitted ${name}`);
}

export async function deny(host: Actor, name: string, page: Page = host.page): Promise<void> {
  await openPeople(page);
  const btn = page.getByRole("button", { name: `Deny ${name}` });
  await btn.first().waitFor({ state: "visible", timeout: 30_000 });
  await btn.first().click();
  host.note(`denied ${name}`);
}

/** Host ends it through the UI: End meeting for everyone → End it. */
export async function endForEveryone(host: Actor, page: Page = host.page): Promise<void> {
  await page.getByRole("button", { name: "End meeting for everyone" }).click({ timeout: 15_000 });
  await page.getByRole("button", { name: "End it" }).click({ timeout: 10_000 });
  host.note("ended for everyone (UI)");
}

async function rpc(name: string, body: unknown, token: string): Promise<unknown> {
  const { url, key } = supabasePublic();
  const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Content-Profile": "communication",
      "Accept-Profile": "communication",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${name} ${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

/** Server truth about the meeting (ended_at etc.), read with the host's own session. */
export async function meetingRow(meeting: Meeting): Promise<Record<string, unknown> | null> {
  const s = await meeting.host.session();
  if (!s) return null;
  const row = await rpc("meet_meeting_by_slug", { p_slug: meeting.slug }, s.token);
  return (Array.isArray(row) ? row[0] : row) as Record<string, unknown> | null;
}

/**
 * Every meeting a scenario creates is ended by the scenario. UI first (the real
 * path, which also closes the LiveKit room); the meeting RPC as a backstop.
 */
export async function ensureEnded(meeting: Meeting | null): Promise<string> {
  if (meeting === null) return "no meeting";
  const host = meeting.host;
  try {
    const live = host.pages.filter((p) => !p.isClosed());
    for (const page of live) {
      const o = await observe(page);
      if (o.phase === "in-call" || o.phase === "reconnecting") {
        await endForEveryone(host, page);
        await page.waitForTimeout(3000);
        break;
      }
    }
  } catch (e) {
    host.note(`UI end failed: ${(e as Error).message.slice(0, 120)}`);
  }
  try {
    const s = await host.session();
    if (!s) return "ended via UI (no session for backstop)";
    const row = await meetingRow(meeting);
    if (row && row.ended_at) return `ended (ended_at=${String(row.ended_at)})`;
    const id = row?.id;
    if (!id) return "backstop: meeting row not readable";
    await rpc("meet_end_meeting", { p_meeting_id: id, p_by_user_id: s.userId }, s.token);
    return "ended via backstop RPC";
  } catch (e) {
    return `backstop failed: ${(e as Error).message.slice(0, 160)}`;
  }
}
