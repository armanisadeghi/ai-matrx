/** P1 — catalog category "breakouts". The host opens one room and moves the guest into it through the product's own controls. */
import { expect } from "@playwright/test";
import { TIMEOUTS } from "../lib/env";
import { endForEveryone, seePhase, seeUntil } from "../lib/meeting";
import { bodyText, hasButton, press } from "../lib/p1";
import { scenario } from "../lib/scenario";
import { GUEST, callWithGuest } from "../lib/stories";
import type { Actor } from "../lib/actor";

async function openRoomFor(host: Actor, guest: Actor): Promise<void> {
  // Google Meet: breakout rooms live under Activities. The setup places people automatically,
  // so the guest already has a room when the host opens them.
  await press(host, "Activities", host.page.getByRole("button", { name: /^activities\b/i }), 10_000);
  await press(host, "Breakout rooms", host.page.getByRole("menuitem", { name: /breakout rooms?/i }), 8000);
  await press(host, "Open rooms", host.page.getByRole("button", { name: /^open (all )?\d* ?rooms?|^start (breakout )?rooms?/i }), 8000);
  void guest;
}

scenario("bo-invite-join", async ({ cast }) => {
  const { host, guest } = await callWithGuest(cast);
  await openRoomFor(host, guest);
  // Meet/Zoom rules: an invitation (Join / Later); Teams auto-moves with a countdown.
  await seeUntil(guest, "an invitation to a room", (o) => /invited to|join (breakout )?room|moved to/i.test(o.text), TIMEOUTS.noticeMs);
  await press(guest, "Later", guest.page.getByRole("button", { name: /^Later$/ }), 8000);
  // Join stays available after Later.
  await press(guest, "Join room (still offered after Later)", guest.page.getByRole("button", { name: /join (breakout )?room/i }), 8000);
  await seeUntil(guest, "in the room, still in a call", (o) => o.phase === "in-call", 45_000);
});

scenario("bo-closing", async ({ cast }) => {
  const { host, guest } = await callWithGuest(cast);
  await openRoomFor(host, guest);
  await press(guest, "Join room", guest.page.getByRole("button", { name: /join (breakout )?room/i }), 15_000);
  await press(host, "Close rooms", host.page.getByRole("button", { name: /close (all )?rooms?/i }), 8000);
  await seeUntil(guest, "a closing countdown", (o) => /closing in \d+|rooms? (will )?clos(e|ing)[^.]*\d+/i.test(o.text), TIMEOUTS.noticeMs);
  await seeUntil(guest, "back in the main meeting", (o) => o.phase === "in-call" && !/breakout/i.test(o.text), 90_000);
  expect(await hasButton(guest.page, /^Chat\b/), "chat is still there after returning").toBe(true);
});

scenario("bo-main-ends", async ({ cast }) => {
  const { host, guest } = await callWithGuest(cast);
  await openRoomFor(host, guest);
  await press(guest, "Join room", guest.page.getByRole("button", { name: /join (breakout )?room/i }), 15_000);
  await endForEveryone(host);
  await seePhase(guest, ["ended"], TIMEOUTS.noticeMs);
  expect(/ended/i.test(await bodyText(guest.page)), "the person in the room is told the meeting ended").toBe(true);
});
