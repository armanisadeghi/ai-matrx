/** P1 — catalog category "moderation-safety". */
import { expect } from "@playwright/test";
import { TIMEOUTS } from "../lib/env";
import { seeUntil, walkIn } from "../lib/meeting";
import { hasButton, openPeople, openPersonMenu, pickMenuItem, press, seeNotice } from "../lib/p1";
import { scenario } from "../lib/scenario";
import { GUEST, admitWaiting, callWithGuest } from "../lib/stories";

scenario("mod-mute-participant", async ({ cast }) => {
  const { host, guest } = await callWithGuest(cast);
  await openPersonMenu(host, GUEST);
  await pickMenuItem(host, /^Mute\b/i);
  await seeUntil(guest, "muted by the host", (o) => o.microphone === "muted_by_host" || /(muted you|muted by (the )?host)/i.test(o.text), TIMEOUTS.noticeMs);
  // The host cannot unmute them, only ask.
  await openPersonMenu(host, GUEST);
  expect(await hasButton(host.page, /^Unmute\b.*/) && await host.page.getByRole("menuitem", { name: new RegExp(`^Unmute ${GUEST}`) }).count() > 0, "the host has no remote unmute").toBe(false);
  await pickMenuItem(host, /ask (to )?unmute/i);
  await seeNotice(guest, "ask-unmute", /(asked|asking) you to unmute|ask(ed)? to unmute|please unmute/i, TIMEOUTS.noticeMs);
  // Still muted until the guest chooses.
  expect(await hasButton(guest.page, /^Unmute\b/), "still muted until the guest acts").toBe(true);
  await press(guest, "Unmute", guest.page.getByRole("button", { name: /^Unmute\b/ }), 5000);
  await seeUntil(guest, "unmuted by choice", (o) => o.microphone === "on" || o.microphone === null, TIMEOUTS.noticeMs);
});

scenario("mod-attendee-av-disabled", async ({ cast }) => {
  const { host, guest } = await callWithGuest(cast);
  await press(host, "the meeting controls", host.page.getByRole("button", { name: /host controls|meeting controls|security|more options/i }), 8000);
  await press(host, "turn off attendees' microphone and camera", host.page.getByRole("menuitem", { name: /(turn off|disable|lock)[^]*(microphone|mic|audio|camera|video)/i }).or(host.page.getByRole("switch", { name: /(microphone|mic|audio|camera|video)/i })), 8000);
  await seeUntil(guest, "the guest's mic and camera locked", (o) => o.microphone === "locked" || o.camera === "locked", TIMEOUTS.noticeMs);
  expect(await hasButton(guest.page, /^Unmute\b/), "no live Unmute for the locked guest").toBe(false);
  await seeNotice(guest, "mic-locked", /turned off by (the )?(organizer|host)|organizer has turned off/i, TIMEOUTS.noticeMs);
  expect(await hasButton(host.page, /^(Mute|Unmute)\b/), "the host's own controls are untouched").toBe(true);
});

scenario("mod-removed-bypass", async ({ cast }) => {
  const { host } = await callWithGuest(cast);
  await openPersonMenu(host, GUEST);
  await pickMenuItem(host, /^Remove\b/i);
  await host.page.getByRole("button", { name: /^Remove( from meeting)?$/ }).last().click({ timeout: 3000 }).catch(() => undefined);
  // The same person comes back on a "new device" (a fresh browser profile) with the same name.
  const again = await cast.add({ label: "guest on a new device", seat: "guest", displayName: GUEST });
  await walkIn(again, cast.meeting!, { until: ["knocking", "in-call", "denied"] });
  await openPeople(host);
  await seeNotice(host, "knock-flagged", /previously removed|was removed earlier|removed before/i, TIMEOUTS.noticeMs);
  // Flag, never block: the host can still choose.
  await seeUntil(host, "the flagged knock still admittable", () => true, 100).catch(() => undefined);
  expect(await hasButton(host.page, new RegExp(`^Admit ${GUEST}$`)), "the host may still admit the flagged knock").toBe(true);
  void admitWaiting;
});
