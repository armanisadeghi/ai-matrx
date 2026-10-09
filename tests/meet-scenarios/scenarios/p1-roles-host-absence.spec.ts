/** P1 — catalog category "roles-host-absence". */
import { expect } from "@playwright/test";
import { TIMEOUTS } from "../lib/env";
import { admit, createMeetingWithProfile, leave, seePhase, seeUntil, walkIn } from "../lib/meeting";
import { summarize } from "../lib/observe";
import { hasButton, openPeople, openPersonMenu, pickMenuItem, press, seeNotice } from "../lib/p1";
import { scenario } from "../lib/scenario";
import { GUEST, GUEST_2, admitWaiting, callWithGuest, hostWithMeeting } from "../lib/stories";

scenario("host-reclaim", async ({ cast }) => {
  // Zoom rules: the returning original host is asked whether to reclaim.
  const host = await cast.add({ label: "host", seat: "admin" });
  cast.meeting = await createMeetingWithProfile(host, "zoom");
  const guest = await cast.add({ label: "guest", seat: "guest", displayName: GUEST });
  await walkIn(host, cast.meeting!, { until: ["in-call"] });
  await walkIn(guest, cast.meeting!, { until: ["knocking", "in-call"] });
  await admitWaiting(host, guest, GUEST);
  // The host hands the meeting over and leaves.
  await press(host, "Leave", host.page.getByRole("button", { name: /^Leave$/ }), 8000);
  await press(host, "Assign a new host", host.page.getByRole("button", { name: /^Assign a new host$/ }), 8000);
  await press(host, `the choice ${GUEST}`, host.page.getByRole("option", { name: new RegExp(GUEST) }).or(host.page.getByRole("button", { name: new RegExp(GUEST) })), 8000);
  await seeUntil(guest, "the guest now holds host", (o) => o.role === "host", 30_000);
  // The original host comes back.
  await host.page.goto(cast.meeting!.path, { waitUntil: "domcontentloaded" });
  await seeUntil(host, "the reclaim choice", (o) => /reclaim host/i.test(o.text), 45_000).catch(() => undefined);
  await press(host, "Reclaim host", host.page.getByRole("button", { name: /reclaim host/i }), 15_000);
  await seeUntil(host, "host again", (o) => o.role === "host" && o.phase === "in-call", 45_000);
  await seeUntil(guest, "the guest back to participant", (o) => o.role !== "host", TIMEOUTS.noticeMs);
});

scenario("meeting-without-host", async ({ cast }) => {
  // Meet rules: with the host gone, members can still admit; host-only controls are simply not there.
  const host = await hostWithMeeting(cast);
  await walkIn(host, cast.meeting!, { until: ["in-call"] });
  const member = await cast.addOrgMember("colleague in the same organization");
  const guest = await cast.add({ label: "guest", seat: "guest", displayName: GUEST });
  await walkIn(member, cast.meeting!, { until: ["in-call", "knocking"] });
  await seePhase(member, ["in-call"], 45_000);
  await walkIn(guest, cast.meeting!, { until: ["knocking", "in-call"] });
  await admitWaiting(host, guest, GUEST);
  await leave(host);
  await seeNotice(guest, "host-absent", /host (has )?left|host is not here|no host/i, TIMEOUTS.noticeMs);
  expect(await hasButton(guest.page, /^End meeting for everyone$/), "no end-for-everyone control without a host").toBe(false);
  expect(await hasButton(guest.page, /^(Lock|Unlock) meeting$/), "no lock control without a host").toBe(false);
  // A newcomer knocks; a member left in the call can let them in.
  const late = await cast.add({ label: "late guest", seat: "guest", displayName: GUEST_2 });
  await walkIn(late, cast.meeting!, { until: ["knocking"] });
  await seeUntil(member, "the newcomer waiting where the member can see", (o) => (o.lobbyCount ?? 0) >= 1, TIMEOUTS.noticeMs);
  await admit(member, GUEST_2);
  await seePhase(late, ["in-call"], 45_000);
});

scenario("role-change-midcall", async ({ cast }) => {
  const { host, guest } = await callWithGuest(cast);
  const before = await seeUntil(guest, "participant controls", (o) => o.phase === "in-call", TIMEOUTS.noticeMs);
  await openPersonMenu(host, GUEST);
  await pickMenuItem(host, /make (co-?host|presenter)/i);
  await seeNotice(guest, "capability-gained", /you.re now (a |an )?(co-?host|presenter)|you.ve been made/i, TIMEOUTS.noticeMs);
  const after = await seeUntil(guest, "the new role on the guest's own screen", (o) => o.role !== before.role && (o.role === "cohost" || o.role === "presenter"), TIMEOUTS.noticeMs);
  expect(after.role, `the guest's role after the change; saw ${summarize(after)}`).toMatch(/cohost|presenter/);
  // Demote: the toolbar changes again and the reason is stated.
  await openPersonMenu(host, GUEST);
  await pickMenuItem(host, /remove (co-?host|presenter)|make (an )?attendee|make participant/i);
  await seeNotice(guest, "capability-lost", /no longer|you.re now (a |an )?(participant|attendee)|removed as/i, TIMEOUTS.noticeMs);
});

scenario("participant-roster-hidden-kinds", async ({ cast }) => {
  const { host, guest } = await callWithGuest(cast);
  // A recorder joins the room as a non-human participant; it must not appear as a stranger.
  await press(host, "Start recording", host.page.getByRole("button", { name: /^Start recording$/ }), 10_000);
  await seeUntil(host, "recording on", (o) => o.recording === true, 60_000);
  await openPeople(host);
  await openPeople(guest);
  for (const p of [host, guest]) {
    const o = await seeUntil(p, "the people list", (x) => x.participants.length >= 2, TIMEOUTS.noticeMs);
    const names = o.participants.map((x) => x.name);
    expect(names.filter((n) => /^EG_|egress|recorder|recording|ingress|agent|bot|^PA_/i.test(n)), `${p.opts.label} sees only people in the list (or the recorder labelled); saw ${names.join(", ")}`).toEqual([]);
    expect(names.length, `two humans in the call, listed once each: ${names.join(", ")}`).toBe(2);
  }
  await press(host, "Stop recording", host.page.getByRole("button", { name: /^Stop recording$/ }), 10_000);
});
