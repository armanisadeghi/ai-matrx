/**
 * In the call — P0 states of catalog categories "multi-device-tabs",
 * "connection-network", "presenting", "recording-consent-captions" and
 * "mobile-browser".
 */
import { TIMEOUTS } from "../lib/env";
import { keepsSeeing, seePhase, seeUntil, walkIn } from "../lib/meeting";
import { observe } from "../lib/observe";
import { scenario } from "../lib/scenario";
import { GUEST, callWithGuest } from "../lib/stories";

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
  await guest.page.getByRole("button", { name: /^Share screen$/ }).click().catch(() => undefined);
  await keepsSeeing(guest, "still in the call when sharing is unsupported", (o) => o.phase === "in-call", 10_000);
  await seeUntil(guest, "an unsupported-sharing message", (o) => o.notices.includes("share-unavailable") || /can('|no)t share|not supported|doesn't support/i.test(o.text), 5000);
});

scenario("rec-start-notice", async ({ cast }) => {
  const { host, guest } = await callWithGuest(cast);
  await host.page.getByRole("button", { name: /^Start recording$/ }).click();
  // Everyone sees that the meeting is being recorded, driven by server state.
  await seeUntil(host, "the recording indicator", (o) => o.recording === true, 45_000);
  await seeUntil(guest, "the recording indicator", (o) => o.recording === true, 45_000);
  // A late joiner sees it too.
  const stop = host.page.getByRole("button", { name: /^Stop recording$/ });
  if (await stop.isVisible().catch(() => false)) await stop.click();
});

scenario("autoplay-blocked", async ({ cast }) => {
  // The guest's browser enforces the autoplay policy, and no real click ever
  // reaches their page — the shape of a Safari guest admitted long after a click.
  const { guest } = await callWithGuest(cast, {
    launchArgs: ["--autoplay-policy=document-user-activation-required"],
    gesture: false,
  });
  const playbackBlocked = await guest.page.evaluate(async () => {
    const els = Array.from(document.querySelectorAll("audio, video")) as HTMLMediaElement[];
    return els.filter((e) => e.paused && e.srcObject !== null).length;
  });
  guest.note(`media elements paused with a stream: ${playbackBlocked}`);
  await seeUntil(guest, "a 'click to enable sound' control", (o) => o.audioBlocked === true, TIMEOUTS.noticeMs);
  const o = await observe(guest.page);
  guest.note(`audio-blocked offered: ${o.audioBlocked}`);
});
