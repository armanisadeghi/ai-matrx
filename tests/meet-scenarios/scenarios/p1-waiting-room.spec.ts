/**
 * P1 — catalog category "waiting-room". `wr-denied-reknock` is already written, per `reknock_after_deny`
 * value, in waiting-room.spec.ts (three variants of that one state id).
 */
import { expect } from "@playwright/test";
import { TIMEOUTS } from "../lib/env";
import { keepsSeeing, neverInCall, seePhase, seeUntil, walkIn } from "../lib/meeting";
import { summarize } from "../lib/observe";
import { openPeople, press, setPolicies } from "../lib/p1";
import { scenario } from "../lib/scenario";
import { GUEST, hostWithMeeting } from "../lib/stories";

scenario("wr-refresh-while-waiting", async ({ cast }) => {
  const host = await hostWithMeeting(cast);
  const guest = await cast.add({ label: "guest", seat: "guest", displayName: GUEST });
  await walkIn(host, cast.meeting!, { until: ["in-call"] });
  const waiting = neverInCall(guest);
  await walkIn(guest, cast.meeting!, { until: ["knocking"] });
  await seeUntil(host, "one person waiting", (o) => o.lobbyCount === 1, TIMEOUTS.noticeMs);
  await guest.refresh();
  // Straight back to waiting: no name retyped, no second knock, the same place in the queue.
  const deadline = Date.now() + 30_000;
  let o = await seeUntil(guest, "a page after the refresh", (x) => x.phase !== "resolving", 30_000);
  while (o.phase !== "knocking" && Date.now() < deadline) {
    expect(o.phase, `after a refresh while waiting the guest must be asked nothing: ${summarize(o)}`).not.toBe("guest-name");
    o = await seeUntil(guest, "a page after the refresh", (x) => x.phase !== "resolving", 5000);
  }
  expect(o.phase, `back on the waiting screen; saw ${summarize(o)}`).toBe("knocking");
  waiting.stop();
  await keepsSeeing(host, "exactly one person in the queue (no duplicate)", (x) => x.lobbyCount === 1, 8000);
  await openPeople(host);
  const entries = await host.page.locator("[data-meet-lobby-entry]").count();
  const admits = await host.page.getByRole("button", { name: `Admit ${GUEST}` }).count();
  expect(Math.max(entries, admits), "the host's list names the guest once").toBe(1);
});

scenario("wr-policy-who-waits", async ({ cast }) => {
  const host = await hostWithMeeting(cast);
  // Who walks straight in is a per-meeting rule: organization members skip the queue, outsiders wait.
  await setPolicies(cast.meeting!, [["lobby_bypass", "org"]]);
  await walkIn(host, cast.meeting!, { until: ["in-call"] });
  const member = await cast.addOrgMember("colleague in the same organization");
  const guest = await cast.add({ label: "guest", seat: "guest", displayName: GUEST });
  await walkIn(member, cast.meeting!, { until: ["in-call", "knocking"] });
  await seePhase(member, ["in-call"], 45_000);
  await walkIn(guest, cast.meeting!, { until: ["knocking", "in-call"] });
  await keepsSeeing(guest, "waiting, not let straight in", (o) => o.phase === "knocking", 6000);
  await seeUntil(host, "the guest in the queue and the member in the call", (o) => o.lobbyCount === 1 && o.participants.length >= 2, TIMEOUTS.noticeMs);
  // The host finds the rule where a host looks for it, by its own words.
  await press(host, "the meeting settings / host controls", host.page.getByRole("button", { name: /meeting settings|host controls|security|more options/i }), 8000);
  await press(host, "the choice of who skips the waiting room", host.page.getByText(/who can (skip|bypass|join without)[^.]*waiting|skip the waiting room|bypass the lobby/i), 8000);
});
