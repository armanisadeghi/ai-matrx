/**
 * P1 helpers — set-ups and reads the P1 scenarios share. Same rule as the rest of the harness:
 * assert only what a person in the meeting can SEE (observation contract, visible text, accessible
 * names); drive only through the product's own doors.
 */
import { expect, type Locator, type Page } from "@playwright/test";
import type { Actor } from "./actor";
import { rpc, seeControl, setMeetingPolicy, type Meeting } from "./meeting";
import { observe, summarize, type Observation } from "./observe";
import { skin } from "./skins";
import { supabasePublic } from "./env";

/** The raw `data-meet-phase` value (null when the page carries no contract root). */
export const rawPhase = (page: Page) => page.locator("[data-meet-root]").first().getAttribute("data-meet-phase").catch(() => null);
export const rawAttr = (page: Page, name: string) => page.locator("[data-meet-root]").first().getAttribute(`data-meet-${name}`).catch(() => null);

export const bodyText = (page: Page): Promise<string> => page.locator("body").innerText({ timeout: 5000 }).then((t) => t.replace(/\s+/g, " ").trim()).catch(() => "");

/**
 * A notice the person must see: the contract's `[data-meet-notice="<code>"]` element, or (today's
 * product) any visible status/alert text matching `words`. Polls; fails with what they saw instead.
 */
export async function seeNotice(actor: Actor, code: string, words: RegExp, timeoutMs: number, page: Page = actor.page): Promise<Observation> {
  const deadline = Date.now() + timeoutMs;
  let o = await observe(page);
  while (Date.now() < deadline) {
    o = await observe(page);
    actor.saw(o);
    const coded = (await page.locator(`[data-meet-notice="${code}"]`).count().catch(() => 0)) > 0;
    if (coded || o.notices.some((n) => words.test(n)) || words.test(await bodyText(page))) {
      actor.progress();
      actor.note(`SAW notice ${code}: ${summarize(o)}`);
      return o;
    }
    await page.waitForTimeout(500).catch(() => undefined);
  }
  actor.note(`NEVER SAW notice ${code} (${words}) in ${timeoutMs / 1000}s: ${summarize(o)}`);
  expect(false, `${actor.opts.label} should see the "${code}" notice (${words}) within ${timeoutMs / 1000}s; saw ${summarize(o)}`).toBe(true);
  return o;
}

/** True when the person can see a button with this accessible name right now. */
export const hasButton = (page: Page, name: RegExp | string): Promise<boolean> =>
  page.getByRole("button", { name }).first().isVisible().catch(() => false);

/** Find a control a person can use and press it (fails with what they saw instead). */
export async function press(actor: Actor, what: string, control: Locator, timeoutMs = 10_000, page: Page = actor.page): Promise<void> {
  const c = await seeControl(actor, what, control, timeoutMs, page);
  await c.click({ timeout: 10_000 });
  actor.note(`pressed ${what}`);
}

/** Open the people list (role `button`, name `People…`) if it is not already open. */
export async function openPeople(actor: Actor, page: Page = actor.page): Promise<void> {
  if ((await page.getByRole("region", { name: /Waiting room|People/ }).count()) > 0) return;
  const people = page.getByRole("button", { name: /^People\b/ });
  if ((await people.count()) > 0) await people.first().click();
}

/** The host opens one person's row menu in the people list (the control a person finds beside a name). */
export async function openPersonMenu(actor: Actor, name: string, page: Page = actor.page): Promise<void> {
  await openPeople(actor, page);
  await press(actor, `the menu for ${name} in the people list`, page.getByRole("button", { name: new RegExp(`(more|options|actions|menu)[^]*${name}|${name}[^]*(more|options|actions|menu)`, "i") }), 10_000, page);
}

/** Press the item a person sees in an open menu (role menuitem or button). */
export async function pickMenuItem(actor: Actor, label: RegExp, page: Page = actor.page): Promise<void> {
  await press(actor, `menu item ${label}`, page.getByRole("menuitem", { name: label }).or(page.getByRole("button", { name: label })), 8000, page);
}

/** Set several rules for one meeting through the product's own per-meeting door. */
export async function setPolicies(meeting: Meeting, pairs: [string, string | number][]): Promise<void> {
  for (const [k, v] of pairs) await setMeetingPolicy(meeting, k, v);
}

/**
 * Schedule a meeting through the product's own door with its own behavior profile, rules in
 * `settings`, and an optional start time (ms from now; negative = in the past). Never a user-level override.
 * Returns the Meeting; the caller assigns `cast.meeting` so the final sweep ends it.
 */
export async function scheduleMeeting(
  host: Actor,
  opts: { profile?: "meet" | "zoom" | "teams"; startsInMs?: number | null; settings?: Record<string, unknown> } = {},
): Promise<Meeting> {
  const s = await host.session();
  if (!s) throw new Error("the host has no session to schedule a meeting with");
  const org = process.env.MEET_SCENARIO_ORG ?? process.env.SERIES_ORG ?? "5dc930e9-bd65-44a1-8369-af773f6e1a5b";
  const out = (await rpc(
    "meet_schedule_meeting",
    {
      p_organization_id: org,
      p_host_user_id: s.userId,
      p_title: "Weekly product sync",
      p_scheduled_for: opts.startsInMs == null ? null : new Date(Date.now() + opts.startsInMs).toISOString(),
      p_time_zone: opts.startsInMs == null ? null : "America/Los_Angeles",
      p_duration_minutes: opts.startsInMs == null ? null : 30,
      p_agenda: null,
      p_recurrence_rule: null,
      p_settings: { ...(opts.profile ? { behavior_profile: opts.profile } : {}), ...(opts.settings ?? {}) },
    },
    s.token,
  )) as { slug?: string } | { slug?: string }[];
  const row = Array.isArray(out) ? out[0] : out;
  if (!row?.slug) throw new Error(`meet_schedule_meeting answered no slug: ${JSON.stringify(out).slice(0, 200)}`);
  host.note(`scheduled meeting ${row.slug} (profile ${opts.profile ?? "default"}, starts ${opts.startsInMs == null ? "now" : `in ${Math.round(opts.startsInMs / 60000)} min`})`);
  return { slug: row.slug, path: skin().meetingPath(row.slug), host };
}

/** Realistic chat lines for chat scenarios. */
export const CHAT = [
  "Morning everyone, the Q4 budget deck is in the shared folder.",
  "Can we start with the hiring plan for the Austin office?",
  "I'll take notes and send the action items after the call.",
];

export async function sendChat(actor: Actor, text: string, page: Page = actor.page): Promise<void> {
  const box = page.getByRole("textbox", { name: /message|chat/i });
  if (!(await box.first().isVisible().catch(() => false))) await press(actor, "the Chat control", page.getByRole("button", { name: /^Chat\b|Open chat|Show chat/i }), 8000, page);
  const field = await seeControl(actor, "the chat message box", box, 8000, page);
  await field.fill(text);
  await field.press("Enter");
  actor.note(`sent chat "${text.slice(0, 40)}"`);
}

/**
 * Screen-share source for a headless browser (init script, before the page loads): getDisplayMedia
 * answers with an animated canvas stream, optionally with an audio track — the product publishes a
 * real MediaStreamTrack. `window.__shareSrc.stop()` ends it the way the browser's own "Stop sharing" bar does.
 * Recorded as a lever: the picker itself cannot be driven headless.
 */
export function shareSourceInit(withAudio: boolean): void {
  const md = navigator.mediaDevices;
  if (!md) return;
  const state = { tracks: [] as MediaStreamTrack[], calls: 0 };
  (window as unknown as { __shareSrc: unknown }).__shareSrc = {
    state,
    stop() {
      for (const t of state.tracks) {
        t.stop();
        t.dispatchEvent(new Event("ended"));
      }
    },
  };
  md.getDisplayMedia = async () => {
    state.calls++;
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext("2d")!;
    let n = 0;
    const tick = () => {
      ctx.fillStyle = "#1d3557";
      ctx.fillRect(0, 0, 1280, 720);
      ctx.fillStyle = "#f1faee";
      ctx.font = "48px sans-serif";
      ctx.fillText(`Q4 budget review ${n++}`, 80, 200);
      requestAnimationFrame(tick);
    };
    tick();
    const stream = canvas.captureStream(15);
    if (withAudio) {
      const ac = new AudioContext();
      const osc = ac.createOscillator();
      const dest = ac.createMediaStreamDestination();
      osc.connect(dest);
      osc.start();
      dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    }
    state.tracks.push(...stream.getTracks());
    return stream;
  };
}

export const endShare = (page: Page) => page.evaluate(() => (window as unknown as { __shareSrc?: { stop(): void } }).__shareSrc?.stop());

/** Read one meeting's server row fields that a person's screen depends on (read-only, host session). */
export async function rowField(meeting: Meeting, field: string): Promise<unknown> {
  const s = await meeting.host.session();
  if (!s) throw new Error("no host session");
  const { url, key } = supabasePublic();
  const res = await fetch(`${url}/rest/v1/meet_meetings?slug=eq.${meeting.slug}&select=${field}`, {
    headers: { apikey: key, Authorization: `Bearer ${s.token}`, "Accept-Profile": "communication" },
  });
  const rows = (await res.json()) as Record<string, unknown>[];
  return rows[0]?.[field];
}

/**
 * Open the meeting's link as `actor` and answer the name step if it appears, stopping at the first of:
 * a refusal (`refused:<reason>`), a knock, the room, the pre-join (signed-in people), or the not-found / expired screens.
 */
export async function openLink(actor: Actor, meeting: Meeting, extra: string[] = []): Promise<Observation> {
  const { walkIn } = await import("./meeting");
  const reasons = ["not_found", "expired", "cancelled", "removed", "locked", "too_early", "sign_in_required", "wrong_account", "not_invited", "meeting_full", "platform_capacity"];
  const until = [...reasons.map((r) => `refused:${r}`), ...extra, "knocking", "waiting-for-host", "in-call", "not-found", "expired", "ended", "denied", "unknown"] as import("./observe").CallPhase[];
  return walkIn(actor, meeting, { until });
}
