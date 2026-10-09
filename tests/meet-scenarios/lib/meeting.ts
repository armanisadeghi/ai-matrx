/**
 * MEETING — the moves every scenario repeats, done the way a person does them
 * (through the UI), plus a cleanup that guarantees the meeting ends.
 */
import { skin } from "./skins";
import { expect, type Locator, type Page } from "@playwright/test";
import { formatDurationMs } from "@ai-matrx/kit/format";
import type { Actor } from "./actor";
import { baseURL, supabasePublic } from "./env";
import { adminProfileOverrides } from "./fixtures";
import { NO_GESTURE, evaluateIn, observe, summarize, type CallPhase, type Observation } from "./observe";

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
  if (NO_GESTURE.has(page)) {
    // Locator queries carry a user activation in Chromium; a no-gesture page is checked by URL/text only.
    if (!/__dev-walk/.test(page.url())) return false;
    actor.env("preview paused by the walk cap; resuming (form submit, no gesture)");
    await evaluateIn(page, () => document.querySelector<HTMLFormElement>('form[action="/__dev-walk"]')?.submit(), null);
    await page.waitForLoadState("domcontentloaded").catch(() => undefined);
    return true;
  }
  const resume = page.getByRole("button", { name: "Resume this preview" });
  if (!(await resume.isVisible().catch(() => false))) return false;
  const lostCall = skin().meetingUrl.test(decodeURIComponent(new URL(page.url()).searchParams.get("returnTo") ?? ""));
  actor.env("preview paused by the walk cap; resuming", lostCall);
  await resume.click();
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  // Resume reloads the meeting page at pre-join: a call that was live is gone. Report ENV, never judge the product on it.
  if (lostCall) throw new Error(`ENV: walk cap parked ${actor.opts.label} mid-meeting (${page.url()}); Resume restored the slot but the call state is lost, so no verdict`);
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
      actor.progress();
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
    await resumeIfParked(actor, page);
    const o = await observe(page);
    actor.saw(o);
    if (!ok(o)) {
      actor.note(`STOPPED seeing ${what}: ${summarize(o)}`);
      expect(false, `${actor.opts.label} should keep seeing ${what} for ${formatDurationMs(ms, { style: "compact" })}; saw ${summarize(o)}`).toBe(true);
    }
    await page.waitForTimeout(1000).catch(() => undefined);
  }
  actor.progress();
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
      actor.progress();
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
export interface TokenTemplate {
  url: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

export function firstTokenRequest(actor: Actor): TokenTemplate {
  const call = actor.tokenCalls.find((c) => c.body !== null && c.status !== null && c.status < 300);
  if (!call || !call.body) throw new Error(`${actor.opts.label} never got a token from the token door; nothing to replay`);
  return { url: call.url, body: call.body, headers: call.headers };
}

/**
 * Knock on the token door AS this person (their own session, their own name), with the request
 * shape the product itself sent. Returns the HTTP status; the evidence line never carries a token.
 */
export async function tokenProbe(actor: Actor, template: TokenTemplate, displayName: string): Promise<number> {
  const s = await actor.session();
  const body = { ...template.body, display_name: displayName, device_id: `harness-probe-${Math.random().toString(36).slice(2, 10)}`, guest: s === null };
  const res = await fetch(template.url, {
    method: "POST",
    // The page's own headers (organization header included), with THIS person's credential.
    headers: { ...template.headers, "content-type": "application/json", ...(s ? { authorization: `Bearer ${s.token}` } : {}) },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const minted = res.ok && /"token"\s*:/.test(text);
  actor.note(`token door probe as ${displayName}: HTTP ${res.status}${minted ? " — a LiveKit token was MINTED" : ` — ${text.replace(/"token"\s*:\s*"[^"]+"/g, '"token":"…"').slice(0, 200)}`}`);
  // A malformed probe (400/422) proves nothing about the door: it is a harness failure, never a refusal.
  if (res.status === 400 || res.status === 422) throw new Error(`token door probe as ${displayName} was malformed (HTTP ${res.status}): ${text.slice(0, 160)}`);
  return res.status;
}

/** The door refused this person (not a malformed request, not a server error). */
export const refused = (status: number) => status === 401 || status === 403 || status === 404 || status === 409 || status === 410;

/** Host: /meetings → Start now (picking an organization if asked) → the meeting's pre-join. */
export async function startInstantMeeting(host: Actor): Promise<Meeting> {
  // A walk-cap park mid-start (recorded as ENV evidence) restarts the start, up to 3 times.
  for (let attempt = 1; ; attempt++) {
    try {
      return await startOnce(host);
    } catch (e) {
      if (attempt >= 3 || !/__dev-walk/.test((e as Error).message)) throw e;
      await resumeIfParked(host);
    }
  }
}

async function startOnce(host: Actor): Promise<Meeting> {
  const page = host.page;
  await resumeIfParked(host, page);
  if (!new URL(page.url()).pathname.startsWith(skin().startPath)) await page.goto(skin().startPath);
  await resumeIfParked(host, page);
  const start = page.getByRole("button", { name: /Start an instant meeting now|Start now/ });
  await start.first().waitFor({ state: "visible", timeout: 90_000 });
  await start.first().click();
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline && !skin().meetingUrl.test(page.url())) {
    if (/__dev-walk/.test(page.url())) break;
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
  const m = page.url().match(skin().meetingUrl);
  if (!m) throw new Error(`Start now did not open a meeting; at ${page.url()}`);
  host.note(`meeting started: ${skin().meetingPath(m[1])}`);
  return { slug: m[1], path: skin().meetingPath(m[1]), host };
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
  let activated = false;
  if (!gesture) {
    activated = await evaluateIn(page, () => navigator.userActivation?.hasBeenActive ?? false, null).catch(() => false);
    if (activated) actor.note("USER ACTIVATION already present when the no-gesture walk began (before any harness read of this page)");
  }
  while (Date.now() < deadline) {
    await resumeIfParked(actor, page);
    o = await observe(page);
    actor.saw(o);
    if (!gesture && !activated) {
      activated = await evaluateIn(page, () => navigator.userActivation?.hasBeenActive ?? false, null).catch(() => false);
      if (activated) actor.note(`USER ACTIVATION appeared on a no-gesture page (after: ${lastAction || "page load"})`);
    }
    if (until.includes(o.phase)) break;
    // The name step is read from the field itself: the core may render it under `prejoin`
    // until the contract's `guest_name` phase is adopted (CORE-DESIGN §3.7 C1).
    const nameStep =
      o.phase === "guest-name" ||
      (gesture
        ? await page.locator("#meet-guest-name").isVisible().catch(() => false)
        : await evaluateIn(page, () => !!document.querySelector("#meet-guest-name"), null).catch(() => false));
    if (nameStep && due("name")) {
      const name = actor.opts.displayName ?? "Priya Shah";
      if (gesture) {
        await page.locator("#meet-guest-name").fill(name);
        await page.locator("#meet-guest-name").press("Enter");
      } else {
        await evaluateIn(page, (n: string) => {
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
      const enabled = gesture
        ? await join.isEnabled().catch(() => false)
        : await evaluateIn(page, () => Array.from(document.querySelectorAll("button")).some((x) => (x.getAttribute("aria-label") ?? x.textContent ?? "").trim() === "Join now" && !x.disabled), null).catch(() => false);
      if (enabled) {
        if (gesture) await join.click();
        else await evaluateIn(page, () => {
          const b = Array.from(document.querySelectorAll("button")).find((x) => (x.getAttribute("aria-label") ?? x.textContent ?? "").trim() === "Join now");
          b?.click();
        }, null);
        actor.note(`${lastAction === "join" ? "pressed Join now AGAIN (the first press did not move the screen)" : "pressed Join now"}${gesture ? "" : " (no gesture)"}`);
        lastAction = "join";
        lastAt = Date.now();
      }
    }
    await page.waitForTimeout(500);
  }
  if (until.includes(o.phase)) actor.progress();
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

/**
 * Set ONE rule for ONE meeting through the product's own per-meeting door
 * (`communication.meet_policy_set(p_meeting_id, p_key, p_value)`, host authority — CORE-DESIGN §4.1),
 * with the host's own session; never a row edit. Reads the answer back through `meet_policy`.
 */
export async function setMeetingPolicy(meeting: Meeting, key: string, value: string | number): Promise<void> {
  const s = await meeting.host.session();
  if (!s) throw new Error("the host has no session to set a meeting rule with");
  const row = await meetingRow(meeting);
  if (!row?.id) throw new Error("the meeting row is not readable by its host");
  await rpc("meet_policy_set", { p_meeting_id: row.id, p_key: key, p_value: value }, s.token);
  const back = await rpc("meet_policy", { p_meeting_id: row.id, p_key: key }, s.token);
  meeting.host.note(`meeting rule ${key} = ${JSON.stringify(back)} (set through meet_policy_set)`);
  expect(String(back).replace(/"/g, ""), `meet_policy should answer ${key}=${value} after the host set it`).toBe(String(value));
}

/**
 * Choose the host's behavior profile (`meet`/`zoom`/`teams`) through the product's own settings door:
 * `communication.meet_policy_set` at the host's USER rung (CORE-DESIGN §4.1: "each host's own choice"),
 * with the host's own session - never a row edit. A meeting whose own `behavior_profile` column is
 * unset runs its host's rules, so this applies to every meeting the harness host starts. Call it
 * BEFORE anyone joins: the run caches the resolved rules when it opens. Reads the answer back
 * through `meet_policy`.
 */
export async function setHostBehaviorProfile(meeting: Meeting, profile: "meet" | "zoom" | "teams"): Promise<void> {
  const s = await meeting.host.session();
  if (!s) throw new Error("the host has no session to set a profile with");
  const row = await meetingRow(meeting);
  if (!row?.id || !row.organization_id) throw new Error("the meeting row is not readable by its host");
  const set = (await rpc(
    "meet_policy_set",
    { p_feature: "meet", p_key: "behavior_profile", p_scope_kind: "user", p_scope_id: s.userId, p_organization_id: row.organization_id, p_value: profile, p_note: null },
    s.token,
  )) as { ok?: boolean; reason?: string; detail?: string } | null;
  // Registered BEFORE the verdict on the write: whatever happens next, the scope is cleared at cleanup.
  profileScopes.set(meeting.host, [...(profileScopes.get(meeting.host) ?? []), { userId: s.userId, organizationId: String(row.organization_id) }]);
  expect(set?.ok, `meet_policy_set refused the host's profile: ${JSON.stringify(set)}`).not.toBe(false);
  const back = await rpc("meet_policy", { p_meeting_id: row.id, p_key: "behavior_profile" }, s.token);
  meeting.host.note(`host behavior profile = ${JSON.stringify(back)} (set through meet_policy_set, user rung)`);
  expect(String(back).replace(/"/g, ""), `meet_policy should answer behavior_profile=${profile} after the host chose it`).toBe(profile);
}

/** Host-level profile overrides a scenario set, per host, so cleanup can clear exactly those. */
const profileScopes = new Map<Actor, { userId: string; organizationId: string }[]>();

/**
 * Cleanup for `setHostBehaviorProfile`, run by the cast's final sweep even when the scenario failed:
 * clears each user-rung override the scenario wrote (a NULL value through the same `meet_policy_set`
 * door removes the override, so the host is back on the default profile), then reads the live
 * overrides back. Returns failure descriptions (never throws).
 */
export async function restoreHostProfiles(actors: Actor[]): Promise<string[]> {
  const failures: string[] = [];
  let touched = false;
  for (const host of actors) {
    const scopes = profileScopes.get(host);
    if (!scopes?.length) continue;
    touched = true;
    const s = await host.session();
    if (!s) {
      failures.push(`CLEANUP FAILURE: ${host.opts.label} has no session to restore the behavior profile with`);
      continue;
    }
    for (const sc of scopes) {
      try {
        const out = (await rpc(
          "meet_policy_set",
          { p_feature: "meet", p_key: "behavior_profile", p_scope_kind: "user", p_scope_id: sc.userId, p_organization_id: sc.organizationId, p_value: null, p_note: null },
          s.token,
        )) as { ok?: boolean } | null;
        if (out?.ok === false) failures.push(`CLEANUP FAILURE: clearing the host behavior profile was refused: ${JSON.stringify(out)}`);
      } catch (e) {
        failures.push(`CLEANUP FAILURE: clearing the host behavior profile threw: ${(e as Error).message.slice(0, 160)}`);
      }
    }
    profileScopes.delete(host);
  }
  if (touched) {
    const left = await adminProfileOverrides().catch((e: Error) => ({ overrides: [{ organization_id: `read failed: ${e.message.slice(0, 80)}`, value: null }] }));
    if (left.overrides.length) failures.push(`CLEANUP FAILURE: admin still holds behavior_profile overrides after restore: ${JSON.stringify(left.overrides)}`);
  }
  return failures;
}

/** The host lifts a denial the way the product does (`meet_undeny`), for the guest the lobby knew by name. */
export async function liftDenial(meeting: Meeting, guestName: string): Promise<void> {
  const s = await meeting.host.session();
  const row = await meetingRow(meeting);
  if (!s || !row?.id) throw new Error("no host session / meeting row to lift a denial with");
  const { url, key } = supabasePublic();
  const res = await fetch(`${url}/rest/v1/meet_participants?meeting_id=eq.${row.id}&display_name=eq.${encodeURIComponent(guestName)}&select=identity,admission_state`, {
    headers: { apikey: key, Authorization: `Bearer ${s.token}`, "Accept-Profile": "communication" },
  });
  const rows = (await res.json()) as { identity: string; admission_state: string }[];
  if (!res.ok || !rows.length) throw new Error(`the host cannot read ${guestName}'s row (HTTP ${res.status}: ${JSON.stringify(rows).slice(0, 160)})`);
  await rpc("meet_undeny", { p_meeting_id: row.id, p_identity: rows[0].identity, p_by_user_id: s.userId }, s.token);
  meeting.host.note(`lifted the denial of ${guestName} (meet_undeny; row was ${rows[0].admission_state})`);
}

/**
 * THE WAITING INVARIANT: from now until `stop()`, the person must never render an in-call screen.
 * Polls the observation contract's phase every 400 ms (not just at the end). `stop()` fails the
 * scenario naming the first violation. Call it BEFORE the knock and stop it right before the admit.
 */
export function neverInCall(actor: Actor, page: Page = actor.page): { stop: () => void; samples: () => number } {
  let running = true;
  let n = 0;
  const bad: string[] = [];
  void (async () => {
    while (running && !page.isClosed()) {
      const o = await observe(page).catch(() => null);
      if (o) {
        n++;
        if ((o.phase === "in-call" || o.phase === "reconnecting") && bad.length < 3) bad.push(`${o.phase} (${summarize(o)})`);
      }
      await page.waitForTimeout(400).catch(() => undefined);
    }
  })();
  return {
    samples: () => n,
    stop: () => {
      running = false;
      actor.note(`waiting invariant: ${n} phase samples, ${bad.length} in-call`);
      expect(bad, `${actor.opts.label} must never render an in-call screen while waiting (${n} samples)`).toEqual([]);
      expect(n, `${actor.opts.label} waiting invariant must have sampled the phase`).toBeGreaterThan(5);
    },
  };
}

/** What the person sees as the reason for a refusal (the contract's data-meet-reason). */
export const refusalReason = (page: Page) => page.locator("[data-meet-root]").getAttribute("data-meet-reason").catch(() => null);

/** Server truth about the meeting (ended_at etc.), read with the host's own session. */
export async function meetingRow(meeting: Meeting): Promise<Record<string, unknown> | null> {
  const s = await meeting.host.session();
  if (!s) return null;
  const row = await rpc("meet_meeting_by_slug", { p_slug: meeting.slug }, s.token);
  return (Array.isArray(row) ? row[0] : row) as Record<string, unknown> | null;
}

export interface EndOutcome {
  detail: string;
  /** True when the meeting could not be proven ended: the report shows this as a CLEANUP FAILURE. */
  failed: boolean;
}

/**
 * The product's own end call (`endForEveryone` in @ai-matrx/meet through the app's api adapter):
 * POST /api/v1/meet/end with the person's bearer, `X-Organization-Id`, and a browser-like
 * User-Agent (Cloudflare answers some default agents with error 1010).
 */
export async function callEndDoor(token: string, meetingId: string, organizationId: string | null): Promise<number> {
  const server = process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://server.app.matrxserver.com";
  const res = await fetch(`${server}/api/v1/meet/end`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(organizationId ? { "X-Organization-Id": organizationId } : {}),
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      Origin: baseURL(),
    },
    body: JSON.stringify({ meeting_id: meetingId, organization_id: organizationId }),
  });
  return res.status;
}

/**
 * Every meeting a scenario creates is ended by the scenario. UI first (the real
 * path, which also closes the LiveKit room); the server end door as a backstop.
 * A backstop that fails is returned as `failed` with the status code, never swallowed.
 */
export async function ensureEnded(meeting: Meeting | null): Promise<EndOutcome> {
  if (meeting === null) return { detail: "no meeting", failed: false };
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
    if (!s) return { detail: "CLEANUP FAILURE: host has no session for the backstop; meeting not proven ended", failed: true };
    const row = await meetingRow(meeting);
    if (row && row.ended_at) return { detail: `ended (ended_at=${String(row.ended_at)})`, failed: false };
    const id = row?.id;
    if (!id) return { detail: "CLEANUP FAILURE: backstop could not read the meeting row", failed: true };
    const status = await callEndDoor(s.token, String(id), (row.organization_id as string | null) ?? null);
    if (status < 200 || status >= 300) return { detail: `CLEANUP FAILURE: POST /api/v1/meet/end answered HTTP ${status}`, failed: true };
    const after = await meetingRow(meeting);
    if (after && !after.ended_at) return { detail: `CLEANUP FAILURE: end door answered HTTP ${status} but the meeting is still live`, failed: true };
    return { detail: `ended via backstop server door (HTTP ${status})`, failed: false };
  } catch (e) {
    return { detail: `CLEANUP FAILURE: backstop threw: ${(e as Error).message.slice(0, 160)}`, failed: true };
  }
}
