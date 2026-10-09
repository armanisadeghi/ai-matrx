/**
 * In the call — P0 states of catalog categories "multi-device-tabs",
 * "connection-network", "presenting", "recording-consent-captions" and
 * "mobile-browser".
 */
import { expect } from "@playwright/test";
import { TIMEOUTS } from "../lib/env";
import { keepsSeeing, seeControl, seePhase, seeUntil, walkIn } from "../lib/meeting";
import { evaluateIn } from "../lib/observe";
import { scenario, unproven } from "../lib/scenario";
import { GUEST, GUEST_2, admitWaiting, callWithGuest } from "../lib/stories";

const guestIn = (o: { participants: { name: string }[] }) => o.participants.some((p) => p.name.includes(GUEST));

scenario("duplicate-tab-kicked", async ({ cast }) => {
  const { host } = await callWithGuest(cast);
  const first = host.page;
  // The same person opens the meeting in a second tab and joins there.
  const second = await host.openSecondTab(cast.meeting!.path);
  await walkIn(host, cast.meeting!, { until: ["in-call", "displaced"], page: second });
  // The older tab says why it dropped, and does not fight back.
  await seePhase(host, ["displaced"], TIMEOUTS.noticeMs, first);
  await keepsSeeing(host, "the older tab stays out (no auto-rejoin)", (o) => o.phase === "displaced", 20_000, first);
  await seePhase(host, ["in-call"], 10_000, second);
});

scenario("net-reconnecting-self", async ({ cast }) => {
  const { host, guest } = await callWithGuest(cast);
  // 1) The guest's network is pulled.
  await guest.cutNetwork();
  await seeUntil(guest, "reconnecting, marked offline", (o) => o.phase === "reconnecting" && o.connection === "offline", TIMEOUTS.noticeMs);
  await seeUntil(host, `${GUEST} shown as reconnecting`, (o) => o.participants.some((p) => p.name.includes(GUEST) && p.connection !== null && /reconnect|lost|poor/.test(p.connection)), 30_000);
  await guest.page.waitForTimeout(10_000);
  await guest.restoreNetwork();
  await seePhase(guest, ["in-call"], 60_000);
  // 2) The network is up but our servers are unreachable — a different message.
  await guest.cutServersOnly();
  await seeUntil(guest, "reconnecting, marked server-unreachable", (o) => o.phase === "reconnecting" && o.connection === "server-unreachable", TIMEOUTS.noticeMs);
  await guest.restoreNetwork();
  await seePhase(guest, ["in-call"], 60_000);
  await seeUntil(host, `${GUEST} back`, guestIn, 30_000);
});

scenario("net-gave-up-rejoin", async ({ cast }) => {
  const { host, guest } = await callWithGuest(cast);
  await guest.cutNetwork();
  // Long enough that the client must give up.
  await seeUntil(guest, "a 'you were disconnected' screen with Rejoin", (o) => o.phase === "disconnected", TIMEOUTS.reconnectGiveUpMs + 30_000);
  await seeUntil(guest, "a Rejoin action", (o) => /rejoin/i.test(o.text), 5000);
  await guest.restoreNetwork();
  // Back online: rejoined automatically (fresh token), no click.
  await seePhase(guest, ["in-call"], 60_000);
  await seeUntil(host, `${GUEST} back in the call`, guestIn, 30_000);
}, { timeoutMs: TIMEOUTS.reconnectGiveUpMs + 8 * 60_000 });

scenario("share-picker-cancelled", async ({ cast }) => {
  const { host, guest } = await callWithGuest(cast, { faults: { denyScreen: true } });
  // The guest opens the share picker and cancels it.
  await guest.page.getByRole("button", { name: /^Share screen$/ }).click();
  // Silent no-op: still in the call, still seen by the host.
  await keepsSeeing(guest, "still in the call after cancelling the picker", (o) => o.phase === "in-call", 15_000);
  await keepsSeeing(host, `${GUEST} still in the call`, guestIn, 5000);
  // A browser that cannot share at all gets a message, not an exit.
  await guest.page.evaluate(() => {
    (navigator.mediaDevices as unknown as { getDisplayMedia?: unknown }).getDisplayMedia = undefined;
  });
  await (await seeControl(guest, "the Share screen control (unsupported browser)", guest.page.getByRole("button", { name: /^Share screen$/ }), 5000)).click();
  await keepsSeeing(guest, "still in the call when sharing is unsupported", (o) => o.phase === "in-call", 10_000);
  await seeUntil(guest, "an unsupported-sharing message", (o) => o.notices.includes("share-unavailable") || /can('|no)t share|not supported|doesn't support/i.test(o.text), 5000);
});

scenario("rec-start-notice", async ({ cast }) => {
  const { host, guest } = await callWithGuest(cast);
  await (await seeControl(host, "the Start recording control", host.page.getByRole("button", { name: /^Start recording$/ }), 10_000)).click();
  // Everyone in the room sees that the meeting is being recorded.
  await seeUntil(host, "the recording indicator", (o) => o.recording === true, 45_000);
  await seeUntil(guest, "the recording indicator", (o) => o.recording === true, 45_000);
  // A late joiner, admitted after recording started, sees it too (server state, not a missed broadcast).
  const late = await cast.add({ label: "late joiner", seat: "guest", displayName: GUEST_2 });
  await walkIn(late, cast.meeting!, { until: ["knocking", "in-call"] });
  await admitWaiting(host, late, GUEST_2);
  await seeUntil(late, "the recording indicator on arrival", (o) => o.recording === true, TIMEOUTS.noticeMs);
  // Stopping clears it for everyone.
  await (await seeControl(host, "the Stop recording control", host.page.getByRole("button", { name: /^Stop recording$/ }), 10_000)).click();
  for (const p of [host, guest, late]) await seeUntil(p, "the recording indicator cleared", (o) => o.recording === false, 45_000);
});

scenario("autoplay-blocked", async ({ cast }) => {
  // The guest's browser enforces the autoplay policy, and no real click ever reaches their page
  // before admission — the shape of a Safari guest admitted long after their last click.
  const { guest } = await callWithGuest(cast, {
    launchArgs: ["--autoplay-policy=document-user-activation-required"],
    gesture: false,
  });
  const playback = () =>
    evaluateIn(guest.page, () => {
      const els = Array.from(document.querySelectorAll("audio, video")) as HTMLMediaElement[];
      const audio = els.filter((e) => e.tagName === "AUDIO" && e.srcObject !== null);
      return {
        audioWithStream: audio.length,
        audioPaused: audio.filter((e) => e.paused).length,
        audioMuted: audio.filter((e) => e.muted).length,
        userActivated: navigator.userActivation?.hasBeenActive ?? null,
      };
    }, null);
  // Precondition: the host's audio really is blocked in the guest's page.
  await seeUntil(guest, "the host's audio element on the page", (o) => o.phase === "in-call", 5000);
  let p = await playback();
  for (let i = 0; i < 20 && p.audioWithStream === 0; i++) {
    await guest.page.waitForTimeout(500);
    p = await playback();
  }
  guest.note(`before any click: ${JSON.stringify(p)}`);
  if (!(p.audioWithStream > 0)) unproven(`precondition not reachable: the guest's page has no host audio attached (${JSON.stringify(p)}); no product verdict on autoplay`);
  if (!(p.audioPaused > 0)) unproven(`precondition not reachable: the browser did not block the host's audio (paused=${p.audioPaused} of ${p.audioWithStream}, userActivated=${String(p.userActivated)}); no product verdict on autoplay`);
  // The person is offered a way to turn sound on…
  await seeUntil(guest, "a 'click to enable sound' control", (o) => o.audioBlocked === true, TIMEOUTS.noticeMs);
  const enable = await seeControl(guest, "the Enable sound control", guest.page.getByRole("button", { name: /^Enable sound$|enable (sound|audio)|turn on sound|allow (sound|audio)|click to (hear|enable)/i }), 5000);
  // …and one real click makes the audio play and the offer go away.
  await enable.click();
  const deadline = Date.now() + 10_000;
  p = await playback();
  while (Date.now() < deadline && p.audioPaused > 0) {
    await guest.page.waitForTimeout(500);
    p = await playback();
  }
  guest.note(`after the click: ${JSON.stringify(p)}`);
  expect(p.audioWithStream > 0 && p.audioPaused === 0, `audio should play after Enable sound; ${JSON.stringify(p)}`).toBe(true);
  await seeUntil(guest, "the enable-sound offer gone", (o) => o.audioBlocked !== true, 5000);
});
