/**
 * Waiting room and admission — the P0 states of catalog category "waiting-room".
 * Each asserts what the waiting person AND the host see.
 */
import { expect } from "@playwright/test";
import { TIMEOUTS } from "../lib/env";
import { observe, type CallPhase } from "../lib/observe";
import {
  admit,
  deny,
  endForEveryone,
  keepsSeeing,
  leave,
  liftDenial,
  neverInCall,
  refusalReason,
  seePhase,
  seeUntil,
  setMeetingPolicy,
  walkIn,
} from "../lib/meeting";
import { seeControl } from "../lib/meeting";
import { scenario } from "../lib/scenario";
import { GUEST, backInAfterReload, hostWithMeeting, selfName } from "../lib/stories";

scenario("wr-admit-flow", async ({ cast }) => {
  const host = await hostWithMeeting(cast);
  const guest = await cast.add({ label: "guest", seat: "guest", displayName: GUEST });
  await walkIn(host, cast.meeting!, { until: ["in-call"] });
  const waiting = neverInCall(guest); // from the first knock until the host admits
  await walkIn(guest, cast.meeting!, { until: ["knocking"] });
  await seeUntil(host, "one person waiting", (o) => (o.lobbyCount ?? 0) >= 1, TIMEOUTS.noticeMs);
  await keepsSeeing(guest, "knocking, not in the call", (o) => o.phase === "knocking", 4000);
  waiting.stop();
  await admit(host, GUEST);
  await seePhase(guest, ["in-call"], 45_000);
  await seeUntil(host, `${GUEST} in the call`, (o) => o.participants.some((p) => p.name.includes(GUEST)), 30_000);
  await seeUntil(host, "nobody waiting", (o) => (o.lobbyCount ?? 0) === 0, TIMEOUTS.noticeMs);
  // Both see each other: the guest sees the host by name.
  const hostName = await selfName(host);
  await seeUntil(guest, `the host "${hostName}" in the call`, (o) => o.participants.some((p) => !p.self && p.name.includes(hostName)), 30_000);
  // Admission is server truth: after a reload the guest is back in the call — no name prompt, no second knock.
  await guest.refresh();
  await backInAfterReload(guest);
  await keepsSeeing(guest, "still in the call after the reload", (o) => o.phase === "in-call", 10_000);
});

scenario("wr-missed-admit", async ({ cast }) => {
  const host = await hostWithMeeting(cast);
  const guest = await cast.add({ label: "guest", seat: "guest", displayName: GUEST });
  await walkIn(host, cast.meeting!, { until: ["in-call"] });
  const waiting = neverInCall(guest);
  await walkIn(guest, cast.meeting!, { until: ["knocking"] });
  await seeUntil(host, "one person waiting", (o) => (o.lobbyCount ?? 0) >= 1, TIMEOUTS.noticeMs);
  // The admit happens while the guest cannot hear it: the cut guest must still show waiting, never the room.
  await guest.cutNetwork();
  await admit(host, GUEST);
  await host.page.waitForTimeout(10_000);
  waiting.stop();
  await guest.restoreNetwork();
  // The guest's screen must catch up on its own — no click, no reload.
  await seePhase(guest, ["in-call"], 60_000);
});

scenario("wr-denied", async ({ cast }) => {
  const host = await hostWithMeeting(cast);
  const guest = await cast.add({ label: "guest", seat: "guest", displayName: GUEST });
  await walkIn(host, cast.meeting!, { until: ["in-call"] });
  const waiting = neverInCall(guest); // knock -> denied: never the room
  await walkIn(guest, cast.meeting!, { until: ["knocking"] });
  await seeUntil(host, "one person waiting", (o) => (o.lobbyCount ?? 0) >= 1, TIMEOUTS.noticeMs);
  await deny(host, GUEST);
  await seePhase(guest, ["denied"], TIMEOUTS.noticeMs);
  // A clear way back home, and no live Join button pretending to work.
  await seeUntil(guest, "a way home", (o) => /home|back to|close|leave/i.test(o.text), 5000);
  const deadJoin = await guest.page.getByRole("button", { name: /^Join now$/ }).isVisible().catch(() => false);
  guest.note(`Join now still offered after denial: ${deadJoin}`);
  await keepsSeeing(guest, "denied, not admitted", (o) => o.phase === "denied" && !deadJoin, 10_000);
  await seeUntil(host, "nobody waiting", (o) => (o.lobbyCount ?? 0) === 0, TIMEOUTS.noticeMs);
  waiting.stop();
});

scenario(
  "wr-timeout",
  async ({ cast }) => {
    const host = await hostWithMeeting(cast);
    const guest = await cast.add({ label: "guest", seat: "guest", displayName: GUEST });
    await walkIn(host, cast.meeting!, { until: ["in-call"] });
    const waiting = neverInCall(guest);
    await walkIn(guest, cast.meeting!, { until: ["knocking"] });
    // Nobody answers. Real time passes.
    await seePhase(guest, ["knock-expired"], TIMEOUTS.knockExpiryMs + 60_000);
    await seeUntil(guest, "a way to try again", (o) => /try again|ask again|request again/i.test(o.text), 5000);
    await seeUntil(host, "the expired knock gone from the lobby", (o) => (o.lobbyCount ?? 0) === 0, TIMEOUTS.noticeMs);
    // Asking again is a fresh knock: the guest is waiting again and the HOST sees it arrive.
    await (await seeControl(guest, "Ask again after the expiry", guest.page.getByRole("button", { name: /^(Ask again|Ask to join again)$/ }), 5000)).click();
    await seePhase(guest, ["knocking"], TIMEOUTS.noticeMs);
    await seeUntil(host, "the fresh knock in the lobby", (o) => (o.lobbyCount ?? 0) >= 1, TIMEOUTS.noticeMs);
    await keepsSeeing(guest, "waiting again, not in the call", (o) => o.phase === "knocking", 3000);
    waiting.stop();
  },
  { timeoutMs: TIMEOUTS.knockExpiryMs + 6 * 60_000 },
);

scenario("wr-no-host-to-admit", async ({ cast }) => {
  const host = await hostWithMeeting(cast);
  await walkIn(host, cast.meeting!, { until: ["in-call"] });
  await leave(host);
  await host.page.waitForTimeout(3000);
  const guest = await cast.add({ label: "guest", seat: "guest", displayName: GUEST });
  const waiting = neverInCall(guest);
  await walkIn(guest, cast.meeting!, { until: ["knocking", "waiting-for-host"] });
  // The waiting person is told nobody who can admit them is here.
  await seeUntil(guest, "the host is not here", (o) => o.hostPresent === false || o.phase === "waiting-for-host", TIMEOUTS.noticeMs);
  await keepsSeeing(guest, "still waiting, not in the room", (o) => o.phase === "knocking" || o.phase === "waiting-for-host", 5000);
  waiting.stop();
});

scenario("wr-host-arrives-sees-queue", async ({ cast }) => {
  const host = await hostWithMeeting(cast); // on the pre-join, not in the call
  const guest = await cast.add({ label: "guest", seat: "guest", displayName: GUEST });
  const waiting = neverInCall(guest);
  await walkIn(guest, cast.meeting!, { until: ["knocking", "waiting-for-host"] });
  await guest.page.waitForTimeout(10_000);
  await walkIn(host, cast.meeting!, { until: ["in-call"] });
  // On arrival the host sees who is waiting, by name, and can admit them.
  await seeUntil(host, "the waiting queue on arrival", (o) => (o.lobbyCount ?? 0) >= 1, TIMEOUTS.noticeMs);
  waiting.stop();
  await admit(host, GUEST);
  await seePhase(guest, ["in-call"], 45_000);
});

scenario("wr-host-notified", async ({ cast }) => {
  const host = await hostWithMeeting(cast);
  const guest = await cast.add({ label: "guest", seat: "guest", displayName: GUEST });
  await walkIn(host, cast.meeting!, { until: ["in-call"] });
  await walkIn(guest, cast.meeting!, { until: ["knocking"] });
  // A visible notice naming the person, with an action — not only a dot on a button.
  await seeUntil(
    host,
    `a knock notice naming ${GUEST}`,
    (o) =>
      o.notices.includes("knock-received") ||
      o.notices.some((n) => n.includes(GUEST) && /wants to join|asking to join|is waiting|knock/i.test(n)),
    10_000,
  );
});

scenario("wr-cancel-leave", async ({ cast }) => {
  const host = await hostWithMeeting(cast);
  const guest = await cast.add({ label: "guest", seat: "guest", displayName: GUEST });
  await walkIn(host, cast.meeting!, { until: ["in-call"] });
  const waiting = neverInCall(guest);
  await walkIn(guest, cast.meeting!, { until: ["knocking"] });
  await seeUntil(host, "one person waiting", (o) => (o.lobbyCount ?? 0) >= 1, TIMEOUTS.noticeMs);
  // Still on the waiting screen (not wrongly shown the room, whose Leave button would also match).
  await seePhase(guest, ["knocking"], 5000);
  const cancel = await seeControl(guest, "a Cancel / Leave control while waiting", guest.page.getByRole("button", { name: /Cancel( request)?|Leave|Stop waiting/ }), 5000);
  await cancel.click();
  // The catalog's end screen for a person who gave up waiting: `left` (from waiting) WITH Rejoin.
  // Not ended, not a name prompt, not the pre-join, never the room.
  await seePhase(guest, ["left"], TIMEOUTS.noticeMs);
  await seeControl(guest, "Rejoin on the left-the-waiting-room screen", guest.page.getByRole("button", { name: /^Rejoin$/ }), 5000);
  await keepsSeeing(guest, "the left screen (not ended, not in the room)", (o) => o.phase === "left", 4000);
  waiting.stop();
  await seeUntil(host, "the cancelled knock gone", (o) => (o.lobbyCount ?? 0) === 0, TIMEOUTS.noticeMs);
});

scenario("wr-meeting-ended-while-waiting", async ({ cast }) => {
  const host = await hostWithMeeting(cast);
  const guest = await cast.add({ label: "guest", seat: "guest", displayName: GUEST });
  await walkIn(host, cast.meeting!, { until: ["in-call"] });
  const waiting = neverInCall(guest);
  await walkIn(guest, cast.meeting!, { until: ["knocking"] });
  await seeUntil(host, "one person waiting", (o) => (o.lobbyCount ?? 0) >= 1, TIMEOUTS.noticeMs);
  await endForEveryone(host);
  await seePhase(host, ["ended"], TIMEOUTS.noticeMs);
  await seePhase(guest, ["ended"], 30_000);
  waiting.stop();
});

// ---- wr-denied-reknock: one scenario per `reknock_after_deny` value (CORE-DESIGN §4 / §11). ----
// The rule is set for THIS meeting through the host's own per-meeting door (meet_policy_set),
// before the run opens; never by editing a row. The guest's ask-again control is the product's
// "Ask to join again" button, which exists only when the rule allows it.

const ASK_AGAIN = (g: { page: import("@playwright/test").Page }) => g.page.getByRole("button", { name: /^Ask to join again$/ });

async function deniedGuest(cast: import("../lib/scenario").Cast, rules: [string, string | number][]) {
  const host = await hostWithMeeting(cast);
  for (const [k, v] of rules) await setMeetingPolicy(cast.meeting!, k, v);
  const guest = await cast.add({ label: "guest", seat: "guest", displayName: GUEST });
  await walkIn(host, cast.meeting!, { until: ["in-call"] });
  await walkIn(guest, cast.meeting!, { until: ["knocking"] });
  await seeUntil(host, "one person waiting", (o) => (o.lobbyCount ?? 0) >= 1, TIMEOUTS.noticeMs);
  await deny(host, GUEST);
  await seePhase(guest, ["denied"], TIMEOUTS.noticeMs);
  await seeUntil(host, "nobody waiting", (o) => (o.lobbyCount ?? 0) === 0, TIMEOUTS.noticeMs);
  return { host, guest };
}

/** The guest opens the link again (a fresh mint) and sees why they cannot get in. */
async function seeRefusedWithReason(guest: import("../lib/actor").Actor, meeting: import("../lib/meeting").Meeting): Promise<void> {
  await guest.refresh();
  // Opening the link again and pressing Join now is a fresh mint: it must be refused, not knock.
  const o = await walkIn(guest, meeting, { until: ["refused:lobby_rejects" as CallPhase, "denied", "knocking"] });
  expect(o.phase, `the guest must not be allowed to knock again; saw ${o.text}`).not.toBe("knocking");
  const reason = await refusalReason(guest.page);
  const full = (await guest.page.locator("body").innerText()).replace(/\s+/g, " ");
  guest.note(`refusal reason attribute: ${reason}; full screen: ${full.slice(0, 900)}`);
  // The person is TOLD why (the server's sentence), not left on a bare pre-join.
  expect(/did not admit you|declined|host decided/i.test(full), `the refused guest should be shown why; saw ${full.slice(0, 500)}`).toBe(true);
  expect(reason, "the refusal carries its reason code").toBe("lobby_rejects");
}

scenario("wr-denied-reknock-allowed", async ({ cast }) => {
  const { host, guest } = await deniedGuest(cast, [["reknock_after_deny", "allowed"]]);
  await (await seeControl(guest, "Ask to join again (rule: allowed)", ASK_AGAIN(guest), TIMEOUTS.noticeMs)).click();
  await seePhase(guest, ["knocking"], TIMEOUTS.noticeMs);
  await seeUntil(host, "the NEW knock in the lobby", (o) => (o.lobbyCount ?? 0) >= 1, TIMEOUTS.noticeMs);
  const waiting = neverInCall(guest);
  await keepsSeeing(guest, "waiting again, not in the room", (o) => o.phase === "knocking", 3000);
  waiting.stop();
  await admit(host, GUEST);
  await seePhase(guest, ["in-call"], 45_000);
}, { catalogId: "wr-denied-reknock" });

scenario("wr-denied-reknock-cooldown", async ({ cast }) => {
  const COOLDOWN_S = 40;
  const { host, guest } = await deniedGuest(cast, [["reknock_after_deny", "cooldown"], ["reknock_cooldown_seconds", COOLDOWN_S]]);
  const deniedAt = Date.now();
  // Inside the cooldown: no ask-again control, and opening the link again is refused with the reason.
  await keepsSeeing(guest, "denied with no Ask to join again during the cooldown", (o) => o.phase === "denied", 5000);
  expect(await ASK_AGAIN(guest).isVisible().catch(() => false), "Ask to join again must be absent during the cooldown").toBe(false);
  await seeRefusedWithReason(guest, cast.meeting!);
  expect((await observeLobby(host)) ?? 0, "no knock reached the host during the cooldown").toBe(0);
  // After the cooldown the guest can knock again and the host sees it.
  const wait = deniedAt + (COOLDOWN_S + 5) * 1000 - Date.now();
  if (wait > 0) await guest.page.waitForTimeout(wait);
  await guest.refresh();
  await walkIn(guest, cast.meeting!, { until: ["knocking", "denied"] });
  const after = await ASK_AGAIN(guest).isVisible().catch(() => false);
  if (after) await ASK_AGAIN(guest).click();
  await seePhase(guest, ["knocking"], TIMEOUTS.noticeMs);
  await seeUntil(host, "the new knock after the cooldown", (o) => (o.lobbyCount ?? 0) >= 1, TIMEOUTS.noticeMs);
}, { catalogId: "wr-denied-reknock", timeoutMs: 6 * 60_000 });

scenario("wr-denied-reknock-until-lifted", async ({ cast }) => {
  const { host, guest } = await deniedGuest(cast, [["reknock_after_deny", "until_lifted"]]);
  await keepsSeeing(guest, "denied with no Ask to join again", (o) => o.phase === "denied", 5000);
  expect(await ASK_AGAIN(guest).isVisible().catch(() => false), "Ask to join again must be absent until the host lifts the denial").toBe(false);
  await seeRefusedWithReason(guest, cast.meeting!);
  // Still refused a while later: nothing but the host lifts it.
  await guest.page.waitForTimeout(8000);
  await seeRefusedWithReason(guest, cast.meeting!);
  expect((await observeLobby(host)) ?? 0, "no knock reached the host while refused").toBe(0);
  await liftDenial(cast.meeting!, GUEST);
  await guest.refresh();
  await walkIn(guest, cast.meeting!, { until: ["knocking", "denied"] });
  if (await ASK_AGAIN(guest).isVisible().catch(() => false)) await ASK_AGAIN(guest).click();
  await seePhase(guest, ["knocking"], TIMEOUTS.noticeMs);
  await seeUntil(host, "the new knock after the host lifted the denial", (o) => (o.lobbyCount ?? 0) >= 1, TIMEOUTS.noticeMs);
}, { catalogId: "wr-denied-reknock", timeoutMs: 5 * 60_000 });

async function observeLobby(host: import("../lib/actor").Actor): Promise<number | null> {
  return (await observe(host.page)).lobbyCount;
}
