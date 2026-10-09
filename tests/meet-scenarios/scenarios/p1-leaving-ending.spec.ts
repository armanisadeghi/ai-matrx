/** P1 — catalog category "leaving-ending". */
import { expect } from "@playwright/test";
import { TIMEOUTS } from "../lib/env";
import { endForEveryone, keepsSeeing, seePhase, seeUntil } from "../lib/meeting";
import { summarize } from "../lib/observe";
import { hasButton, openPersonMenu, pickMenuItem, press, rawAttr } from "../lib/p1";
import { scenario } from "../lib/scenario";
import { GUEST, callWithGuest } from "../lib/stories";

scenario("ended-notice-participant", async ({ cast }) => {
  const { host, guest } = await callWithGuest(cast);
  await endForEveryone(host);
  await seePhase(guest, ["ended"], TIMEOUTS.noticeMs);
  // A distinct ended screen (not "disconnected", not a Rejoin), and no automatic rejoin.
  expect(await hasButton(guest.page, /^Rejoin$/), "an ended meeting offers no Rejoin").toBe(false);
  await keepsSeeing(guest, "the ended screen, no auto-rejoin", (o) => o.phase === "ended", 12_000);
  await press(guest, "Go home", guest.page.getByRole("link", { name: /^Go home$/ }), 5000);
});

scenario("removed-notice", async ({ cast }) => {
  const { host, guest } = await callWithGuest(cast);
  await openPersonMenu(host, GUEST);
  await pickMenuItem(host, /^Remove\b/i);
  await press(host, "the confirmation", host.page.getByRole("button", { name: /^Remove( from meeting)?$/ }).last(), 5000).catch(() => undefined);
  const o = await seePhase(guest, ["removed"], TIMEOUTS.noticeMs);
  expect(await rawAttr(guest.page, "reason") ?? "removed", "the reason the person is shown").toBe("removed");
  expect(/removed/i.test(o.text), `the screen says the host removed them; saw ${summarize(o)}`).toBe(true);
  expect(await hasButton(guest.page, /^Rejoin$/), "removed people get no Rejoin by default").toBe(false);
  await keepsSeeing(guest, "the removed screen, never the pre-join", (x) => x.phase === "removed", 10_000);
});

scenario("tab-close", async ({ cast }) => {
  const { host, guest } = await callWithGuest(cast);
  await seeUntil(host, "both people in the roster", (o) => o.participants.length >= 2, TIMEOUTS.noticeMs);
  const closedAt = Date.now();
  await guest.closeTab();
  // The leave is announced by the page as it goes (a beacon), so the host sees it in seconds, not after the room's timeout.
  await seeUntil(host, "the guest gone from the roster", (o) => o.participants.length === 1, 8000);
  expect(Date.now() - closedAt, "the host's roster updated within 8 s of the tab closing").toBeLessThan(8500);
});
