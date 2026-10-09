/**
 * P1 — catalog category "connection-network". Real network cuts, throttles and a frozen/asleep page
 * through the per-person gate (lib/net-gate.ts); what each person SEES is asserted.
 */
import { expect } from "@playwright/test";
import { TIMEOUTS } from "../lib/env";
import { keepsSeeing, leave, seePhase, seeUntil, walkIn } from "../lib/meeting";
import { summarize } from "../lib/observe";
import { bodyText, hasButton, press, seeNotice } from "../lib/p1";
import { scenario } from "../lib/scenario";
import { GUEST, callWithGuest, hostWithMeeting } from "../lib/stories";

scenario("net-blip", async ({ cast }) => {
  const { host, guest } = await callWithGuest(cast);
  void host;
  const calm = (o: import("../lib/observe").Observation) => o.phase === "in-call" && (o.connection === null || o.connection === "stable");
  // A 1.5 s hiccup is below the banner delay: nothing modal, no reconnecting screen.
  const watch = keepsSeeing(guest, "a calm call through a 1.5 s blip (no banner, no modal)", calm, 9000);
  await guest.page.waitForTimeout(1500);
  await guest.dropFor(1500);
  await watch;
  expect(await guest.page.getByRole("dialog").count(), "no modal dialog for a blip").toBe(0);
  await keepsSeeing(host, "the guest still in the call", (o) => o.participants.length >= 2, 4000);
});

scenario("net-full-reconnect-identity", async ({ cast }) => {
  const { guest } = await callWithGuest(cast);
  await press(guest, "Raise hand", guest.page.getByRole("button", { name: /^Raise hand$/ }), 8000);
  await guest.dropFor(60_000);
  // Past the SDK's give-up: the guest is back through the supported route, with their state, never as a stranger.
  let o = await seeUntil(guest, "the call, or a Rejoin offer", (x) => x.phase === "in-call" || x.phase === "disconnected", TIMEOUTS.reconnectGiveUpMs);
  if (o.phase === "disconnected") {
    await press(guest, "Rejoin", guest.page.getByRole("button", { name: /^Rejoin$/ }), 5000);
    o = await seePhase(guest, ["in-call"], 60_000);
  }
  expect(o.phase, `back in the call with no name step and no second knock; saw ${summarize(o)}`).toBe("in-call");
  expect(await hasButton(guest.page, /^Lower hand$/), "the raised hand is still raised after the full reconnect").toBe(true);
  expect(o.role, "the role survives the reconnect").not.toBe("none");
});

scenario("net-others-see-drop", async ({ cast }) => {
  const { host, guest } = await callWithGuest(cast);
  await seeUntil(host, "the guest tile", (o) => o.participants.some((p) => p.name.includes(GUEST)), TIMEOUTS.noticeMs);
  await guest.cutNetwork();
  // The host sees the tile marked reconnecting (kept for the grace), not gone and not silently frozen.
  const o = await seeUntil(host, `${GUEST}'s tile marked reconnecting`, (x) => x.participants.some((p) => p.name.includes(GUEST) && /reconnecting|lost/i.test(p.connection ?? "")) || /reconnecting/i.test(x.text), 25_000);
  void o;
  await guest.restoreNetwork();
  await seeUntil(host, "the same tile back to normal (one tile, not two)", (x) => x.participants.filter((p) => p.name.includes(GUEST)).length === 1 && !x.participants.some((p) => /reconnecting|lost/i.test(p.connection ?? "")), 60_000);
  // A deliberate leave is not a drop: the tile goes at once.
  await leave(guest);
  await seeUntil(host, "the tile gone within 5 s of a deliberate leave", (x) => !x.participants.some((p) => p.name.includes(GUEST)), 5000);
});

scenario("net-udp-blocked", async ({ cast }) => {
  // The harness gate carries media over TCP only (UDP is blocked for every person), which is exactly a corporate network.
  const { guest } = await callWithGuest(cast);
  await seeNotice(guest, "restricted-network", /restricted network|network restrictions|quality (is )?reduced/i, 45_000);
});

scenario("net-cannot-connect", async ({ cast }) => {
  await hostWithMeeting(cast);
  const guest = await cast.add({ label: "guest", seat: "guest", displayName: GUEST });
  await walkIn(guest, cast.meeting!, { until: ["prejoin"] }).catch(() => undefined);
  await guest.cutServersOnly();
  const join = guest.page.getByRole("button", { name: /^Join now$/ });
  if (await join.isVisible().catch(() => false)) await join.click().catch(() => undefined);
  // A typed, specific failure — not a spinner, not a blank page.
  await seeUntil(guest, "a can't-connect message with specifics", (o) => /can.t connect|couldn.t connect|check (your )?(network|vpn)|firewall|blocked/i.test(o.text), 45_000);
  const text = await bodyText(guest.page);
  expect(/vpn|firewall|network|proxy/i.test(text), `it names what to check; saw: ${text.slice(0, 220)}`).toBe(true);
  await press(guest, "Try again", guest.page.getByRole("button", { name: /try again|retry/i }), 5000);
});

scenario("net-quality-self", async ({ cast }) => {
  const { guest } = await callWithGuest(cast);
  await guest.throttle("bad-cafe");
  await seeNotice(guest, "connection-poor", /poor connection|unstable|weak (connection|signal)|connection is (poor|unstable)/i, 60_000);
  const text = await bodyText(guest.page);
  expect(/turn off (your )?(camera|video)/i.test(text), `it suggests turning the camera off; saw: ${text.slice(0, 200)}`).toBe(true);
});

scenario("net-quality-remote-tile", async ({ cast }) => {
  const { host, guest } = await callWithGuest(cast);
  await guest.throttle("bad-cafe");
  await seeUntil(host, `${GUEST}'s tile showing a poor connection`, (o) => o.participants.some((p) => p.name.includes(GUEST) && p.connection === "poor"), 90_000);
});

scenario("net-video-auto-off", async ({ cast }) => {
  const { host, guest } = await callWithGuest(cast);
  await guest.throttle("bad-cafe");
  // Congestion pauses the guest's video to protect audio: both ends are told, with a way to retry.
  await seeUntil(host, `${GUEST}'s tile saying their video is paused`, (o) => /video (is )?paused|paused to (save|preserve)/i.test(o.text), 120_000);
  await seeUntil(guest, "the guest told their own video was paused", (o) => /video (is )?paused|turned off (your )?video|paused to (save|preserve)/i.test(o.text), TIMEOUTS.noticeMs);
  await press(guest, "Try video again", guest.page.getByRole("button", { name: /try (video )?again|turn (video )?on|start video/i }), 5000);
});

scenario("net-sleep-wake", async ({ cast }) => {
  const { host, guest } = await callWithGuest(cast);
  await press(guest, "Mute", guest.page.getByRole("button", { name: /^Mute\b/ }), 8000);
  await guest.sleepFor(60_000);
  // On wake: Reconnecting, then stable, still in the call, still muted, never a stranger at the door.
  const o = await seeUntil(guest, "back in the call after the wake", (x) => x.phase === "in-call" && (x.connection === null || x.connection === "stable"), 90_000);
  expect(await hasButton(guest.page, /^Unmute\b/), `the mute state is restored after the wake; saw ${summarize(o)}`).toBe(true);
  await seeUntil(host, "the guest still listed", (x) => x.participants.some((p) => p.name.includes(GUEST)), TIMEOUTS.noticeMs);
});
