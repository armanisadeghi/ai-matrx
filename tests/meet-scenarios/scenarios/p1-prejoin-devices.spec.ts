/**
 * P1 — catalog category "prejoin-devices": camera and microphone before and during a call.
 * Real browser permission state where the browser allows it; the rest through the media-fault script,
 * recorded as a lever in the report.
 */
import { expect } from "@playwright/test";
import { TIMEOUTS } from "../lib/env";
import { keepsSeeing, seeUntil, walkIn } from "../lib/meeting";
import { summarize } from "../lib/observe";
import { bodyText, hasButton, press, seeNotice } from "../lib/p1";
import { scenario } from "../lib/scenario";
import { GUEST, callWithGuest, hostWithMeeting } from "../lib/stories";

/** The pre-join of a guest who has typed a name: stops on the device step, never joins. */
async function atPrejoin(guest: import("../lib/actor").Actor, path: string): Promise<void> {
  await guest.page.goto(path, { waitUntil: "domcontentloaded" });
  await guest.page.locator("#meet-guest-name").fill(GUEST).catch(() => undefined);
  await guest.page.locator("#meet-guest-name").press("Enter").catch(() => undefined);
  await seeUntil(guest, "the pre-join device step", (o) => o.phase === "prejoin", 45_000);
}

scenario("perm-prompt-pending", async ({ cast }) => {
  await hostWithMeeting(cast);
  const guest = await cast.add({ label: "guest", seat: "guest", displayName: GUEST });
  // A prompt the person has not answered: getUserMedia never settles (a headless browser cannot hold its own prompt open).
  await guest.context.addInitScript(() => {
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => new Promise(() => undefined);
  });
  guest.note("lever: init script — getUserMedia never settles (simulates an unanswered browser prompt)");
  await atPrejoin(guest, cast.meeting!.path);
  await guest.page.waitForTimeout(6000);
  const text = await bodyText(guest.page);
  expect(/allow|permission|grant|prompt|camera and microphone/i.test(text), `the person is told what the browser is about to ask; saw: ${text.slice(0, 200)}`).toBe(true);
  const join = guest.page.getByRole("button", { name: /^Join now$/ });
  expect(await join.isEnabled().catch(() => false), "Join now stays usable while the prompt is unanswered").toBe(true);
});

scenario("perm-blocked-site", async ({ cast }) => {
  await hostWithMeeting(cast);
  const guest = await cast.add({ label: "guest", seat: "guest", displayName: GUEST, blockDevices: ["camera", "microphone"] });
  await atPrejoin(guest, cast.meeting!.path);
  const o = await seeUntil(guest, "camera and microphone shown as blocked", (x) => x.camera === "blocked" && x.microphone === "blocked", TIMEOUTS.noticeMs);
  const text = await bodyText(guest.page);
  expect(/site settings|lock icon|address bar|browser settings|allow (camera|microphone)|unblock/i.test(text), `it must say how to unblock in THIS browser; saw ${summarize(o)}`).toBe(true);
  await press(guest, "Retry / Check again", guest.page.getByRole("button", { name: /retry|check again|try again/i }), 5000);
});

scenario("device-none-found", async ({ cast }) => {
  await hostWithMeeting(cast);
  const guest = await cast.add({ label: "guest with no devices", seat: "guest", displayName: GUEST });
  await guest.context.addInitScript(() => {
    const md = navigator.mediaDevices;
    if (!md) return;
    md.enumerateDevices = async () => [];
    md.getUserMedia = async () => { throw new DOMException("Requested device not found", "NotFoundError"); };
  });
  guest.note("lever: init script — no devices exist (enumerateDevices empty, getUserMedia NotFoundError)");
  await atPrejoin(guest, cast.meeting!.path);
  const o = await seeUntil(guest, "a no-microphone message", (x) => x.microphone === "missing" || /no microphone|no camera|couldn.t find/i.test(x.text), TIMEOUTS.noticeMs);
  const join = guest.page.getByRole("button", { name: /^(Join now|Join without (camera|microphone|audio)[^]*)$/i });
  expect(await join.first().isEnabled().catch(() => false), `joining without devices is a normal path; saw ${summarize(o)}`).toBe(true);
  await walkIn(guest, cast.meeting!, { until: ["knocking", "in-call"] });
  await seeUntil(guest, "a listen-only indicator that is not the same as muted", (x) => /listen.?only|no microphone|without (a )?microphone/i.test(x.text), TIMEOUTS.noticeMs);
});

scenario("device-busy", async ({ cast }) => {
  await hostWithMeeting(cast);
  const guest = await cast.add({ label: "guest", seat: "guest", displayName: GUEST });
  await guest.context.addInitScript(() => {
    const md = navigator.mediaDevices;
    if (md) md.getUserMedia = async () => { throw new DOMException("Could not start video source", "NotReadableError"); };
  });
  guest.note("lever: init script — getUserMedia fails NotReadableError (device in use by another app)");
  await atPrejoin(guest, cast.meeting!.path);
  const o = await seeUntil(guest, "a message naming another app", (x) => /in use|another (app|tab|program)|being used/i.test(x.text), TIMEOUTS.noticeMs);
  await press(guest, "Retry", guest.page.getByRole("button", { name: /retry|try again/i }), 5000);
  // One Retry, no loop: after the press the message is still there and nothing re-asks by itself.
  await keepsSeeing(guest, "the same message, no retry loop", (x) => /in use|another (app|tab|program)|being used/i.test(x.text), 6000);
  void o;
});

scenario("device-unplugged-midcall", async ({ cast }) => {
  const { guest } = await callWithGuest(cast);
  await guest.unplug("audioinput");
  await seeNotice(guest, "device-switched", /disconnected|switched to/i, TIMEOUTS.noticeMs);
  await press(guest, "Undo on the device-switched toast", guest.page.getByRole("button", { name: /^Undo$/ }), 5000);
  // Camera: the core switches video too (the SDK only falls back for audio).
  await guest.unplug("videoinput");
  await seeNotice(guest, "device-switched", /camera[^.]*(disconnected|switched)|switched to/i, TIMEOUTS.noticeMs);
  const o = await seeUntil(guest, "still in the call with devices", (x) => x.phase === "in-call" && x.microphone !== "missing" && x.camera !== "missing", TIMEOUTS.noticeMs);
  void o;
});

scenario("device-switch-midcall", async ({ cast }) => {
  const { guest } = await callWithGuest(cast);
  await press(guest, "the microphone options arrow", guest.page.getByRole("button", { name: /microphone (settings|options)|audio (settings|options)|choose microphone|select microphone/i }), 8000);
  const options = guest.page.getByRole("menuitemradio").or(guest.page.getByRole("option"));
  await seeUntil(guest, "a list of microphones", () => true, 500);
  expect(await options.count(), "the device menu lists at least two microphones (the fake browser has several)").toBeGreaterThanOrEqual(2);
  const second = options.nth(1);
  await second.click();
  await seeUntil(guest, "still in the call and the microphone live after the switch", (x) => x.phase === "in-call" && x.microphone !== "missing" && x.microphone !== "blocked", TIMEOUTS.noticeMs);
});

scenario("speaking-while-muted", async ({ cast }) => {
  const { guest } = await callWithGuest(cast);
  await press(guest, "Mute", guest.page.getByRole("button", { name: /^Mute\b/ }), 8000);
  // Chromium's fake microphone makes sound; the muted person is "talking".
  await seeNotice(guest, "speaking-while-muted", /are you speaking|you.re muted|your mic is (off|muted)/i, 30_000);
  await press(guest, "the one-click unmute in the nudge", guest.page.getByRole("button", { name: /^Unmute\b/ }), 5000);
  await seeUntil(guest, "unmuted", (x) => x.microphone === "on" || x.microphone === null, TIMEOUTS.noticeMs);
});

scenario("self-mute-banner-wrong", async ({ cast }) => {
  const { guest } = await callWithGuest(cast);
  await press(guest, "Mute", guest.page.getByRole("button", { name: /^Mute\b/ }), 8000);
  const o = await seeUntil(guest, "muted by choice", (x) => x.microphone === "muted_by_me" || (x.microphone === null && true), TIMEOUTS.noticeMs);
  await guest.page.waitForTimeout(3000);
  const text = await bodyText(guest.page);
  expect(/without (a )?microphone|no microphone|attending without|microphone (is )?(blocked|unavailable|missing)/i.test(text), `a deliberate mute shows no 'no microphone' banner; saw: ${text.slice(0, 220)}`).toBe(false);
  expect(await hasButton(guest.page, /^Fix microphone$/), "no Fix microphone control for a deliberate mute").toBe(false);
  expect(o.microphone, "the microphone region says muted by me, not unavailable").not.toBe("blocked");
  expect(o.microphone).not.toBe("missing");
});
