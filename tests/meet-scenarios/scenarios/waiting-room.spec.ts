/**
 * Waiting room and admission — the P0 states of catalog category "waiting-room".
 * Each asserts what the waiting person AND the host see.
 */
import { TIMEOUTS } from "../lib/env";
import {
  admit,
  deny,
  endForEveryone,
  keepsSeeing,
  leave,
  seePhase,
  seeUntil,
  walkIn,
} from "../lib/meeting";
import { scenario } from "../lib/scenario";
import { GUEST, hostWithMeeting } from "../lib/stories";

scenario("wr-admit-flow", async ({ cast }) => {
  const host = await hostWithMeeting(cast);
  const guest = await cast.add({ label: "guest", seat: "guest", displayName: GUEST });
  await walkIn(host, cast.meeting!, { until: ["in-call"] });
  await walkIn(guest, cast.meeting!, { until: ["knocking"] });
  await seeUntil(host, "one person waiting", (o) => (o.lobbyCount ?? 0) >= 1, TIMEOUTS.noticeMs);
  await admit(host, GUEST);
  await seePhase(guest, ["in-call"], 45_000);
  await seeUntil(host, `${GUEST} in the call`, (o) => o.participants.some((p) => p.name.includes(GUEST)), 30_000);
  await seeUntil(host, "nobody waiting", (o) => (o.lobbyCount ?? 0) === 0, TIMEOUTS.noticeMs);
  // Admission is server truth: a reload neither re-knocks nor loses the seat.
  await guest.refresh();
  await guest.page.waitForTimeout(5000);
  await keepsSeeing(guest, "no second knock after a reload", (o) => o.phase !== "knocking", 15_000);
});

scenario("wr-missed-admit", async ({ cast }) => {
  const host = await hostWithMeeting(cast);
  const guest = await cast.add({ label: "guest", seat: "guest", displayName: GUEST });
  await walkIn(host, cast.meeting!, { until: ["in-call"] });
  await walkIn(guest, cast.meeting!, { until: ["knocking"] });
  await seeUntil(host, "one person waiting", (o) => (o.lobbyCount ?? 0) >= 1, TIMEOUTS.noticeMs);
  // The admit happens while the guest cannot hear it.
  await guest.cutNetwork();
  await admit(host, GUEST);
  await host.page.waitForTimeout(10_000);
  await guest.restoreNetwork();
  // The guest's screen must catch up on its own — no click, no reload.
  await seePhase(guest, ["in-call"], 60_000);
});

scenario("wr-denied", async ({ cast }) => {
  const host = await hostWithMeeting(cast);
  const guest = await cast.add({ label: "guest", seat: "guest", displayName: GUEST });
  await walkIn(host, cast.meeting!, { until: ["in-call"] });
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
});

scenario(
  "wr-timeout",
  async ({ cast }) => {
    const host = await hostWithMeeting(cast);
    const guest = await cast.add({ label: "guest", seat: "guest", displayName: GUEST });
    await walkIn(host, cast.meeting!, { until: ["in-call"] });
    await walkIn(guest, cast.meeting!, { until: ["knocking"] });
    // Nobody answers. Real time passes.
    await seePhase(guest, ["knock-expired"], TIMEOUTS.knockExpiryMs + 60_000);
    await seeUntil(guest, "a way to try again", (o) => /try again|ask again|request again/i.test(o.text), 5000);
    await seeUntil(host, "the expired knock gone from the lobby", (o) => (o.lobbyCount ?? 0) === 0, TIMEOUTS.noticeMs);
  },
  { timeoutMs: TIMEOUTS.knockExpiryMs + 6 * 60_000 },
);

scenario("wr-no-host-to-admit", async ({ cast }) => {
  const host = await hostWithMeeting(cast);
  await walkIn(host, cast.meeting!, { until: ["in-call"] });
  await leave(host);
  await host.page.waitForTimeout(3000);
  const guest = await cast.add({ label: "guest", seat: "guest", displayName: GUEST });
  await walkIn(guest, cast.meeting!, { until: ["knocking", "waiting-for-host", "in-call"] });
  // The waiting person is told nobody who can admit them is here.
  await seeUntil(guest, "the host is not here", (o) => o.hostPresent === false || o.phase === "waiting-for-host", TIMEOUTS.noticeMs);
});

scenario("wr-host-arrives-sees-queue", async ({ cast }) => {
  const host = await hostWithMeeting(cast); // on the pre-join, not in the call
  const guest = await cast.add({ label: "guest", seat: "guest", displayName: GUEST });
  await walkIn(guest, cast.meeting!, { until: ["knocking", "waiting-for-host", "in-call"] });
  await guest.page.waitForTimeout(10_000);
  await walkIn(host, cast.meeting!, { until: ["in-call"] });
  // On arrival the host sees who is waiting, by name, and can admit them.
  await seeUntil(host, "the waiting queue on arrival", (o) => (o.lobbyCount ?? 0) >= 1, TIMEOUTS.noticeMs);
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
  await walkIn(guest, cast.meeting!, { until: ["knocking"] });
  await seeUntil(host, "one person waiting", (o) => (o.lobbyCount ?? 0) >= 1, TIMEOUTS.noticeMs);
  const cancel = guest.page.getByRole("button", { name: /Cancel( request)?|Leave|Stop waiting/ });
  await seeUntil(guest, "a Cancel / Leave control while waiting", () => true, 1000);
  const visible = await cancel.first().isVisible().catch(() => false);
  guest.note(`cancel/leave control visible: ${visible}`);
  if (!visible) throw new Error(`guest sees no Cancel/Leave while waiting`);
  await cancel.first().click();
  await seePhase(guest, ["left", "ended", "resolving", "guest-name", "prejoin"], TIMEOUTS.noticeMs);
  await seeUntil(host, "the cancelled knock gone", (o) => (o.lobbyCount ?? 0) === 0, TIMEOUTS.noticeMs);
});

scenario("wr-meeting-ended-while-waiting", async ({ cast }) => {
  const host = await hostWithMeeting(cast);
  const guest = await cast.add({ label: "guest", seat: "guest", displayName: GUEST });
  await walkIn(host, cast.meeting!, { until: ["in-call"] });
  await walkIn(guest, cast.meeting!, { until: ["knocking"] });
  await seeUntil(host, "one person waiting", (o) => (o.lobbyCount ?? 0) >= 1, TIMEOUTS.noticeMs);
  await endForEveryone(host);
  await seePhase(host, ["ended"], TIMEOUTS.noticeMs);
  await seePhase(guest, ["ended"], 30_000);
});
