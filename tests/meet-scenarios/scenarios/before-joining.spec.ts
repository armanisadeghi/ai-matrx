/**
 * Before joining and pre-join devices — P0 states of catalog categories
 * "before-joining" and "prejoin-devices".
 */
import { TIMEOUTS } from "../lib/env";
import {
  admit,
  endForEveryone,
  keepsSeeing,
  meetingRow,
  seePhase,
  seeUntil,
  walkIn,
} from "../lib/meeting";
import { scenario } from "../lib/scenario";
import { GUEST, GUEST_2, callWithGuest, hostWithMeeting } from "../lib/stories";

scenario("link-code-invalid", async ({ cast }) => {
  const guest = await cast.add({ label: "guest", seat: "guest", displayName: GUEST });
  // A code in the product's own shape that names no meeting (a typo of a real one).
  await guest.page.goto("/meet/qwz-4k7p-mxr", { waitUntil: "domcontentloaded" });
  await seePhase(guest, ["not-found"], 60_000);
  // Never a blank page: a way to retype the code or go home.
  await seeUntil(
    guest,
    "a way to retype the code or go home",
    (o) => /enter (a|another|the) (meeting )?code|try another|go home|back to (meetings|home)|home/i.test(o.text),
    5000,
  );
});

scenario("join-ended-meeting", async ({ cast }) => {
  const host = await hostWithMeeting(cast);
  await walkIn(host, cast.meeting!, { until: ["in-call"] });
  await endForEveryone(host);
  await seePhase(host, ["ended"], TIMEOUTS.noticeMs);
  const row = await meetingRow(cast.meeting!);
  host.note(`server row ended_at=${String(row?.ended_at ?? null)}`);
  // A signed-out guest and a signed-in member both follow the old link.
  const guest = await cast.add({ label: "guest", seat: "guest", displayName: GUEST });
  const member = await cast.add({ label: "member", seat: "member" });
  await guest.page.goto(cast.meeting!.path, { waitUntil: "domcontentloaded" });
  await member.page.goto(cast.meeting!.path, { waitUntil: "domcontentloaded" });
  await seePhase(guest, ["ended"], 60_000);
  await seePhase(member, ["ended"], 60_000);
  // Nobody can get back in: the member is never offered a working Join.
  await keepsSeeing(member, "the meeting-ended screen, no way back into the room", (o) => o.phase === "ended", 15_000);
  await keepsSeeing(guest, "the meeting-ended screen", (o) => o.phase === "ended", 5000);
});

scenario("before-start-host-absent-wait", async ({ cast }) => {
  const host = await hostWithMeeting(cast); // started, but the host has not joined
  const guest = await cast.add({ label: "guest", seat: "guest", displayName: GUEST });
  await walkIn(guest, cast.meeting!, { until: ["knocking", "waiting-for-host", "in-call"] });
  // The guest is told the host has not arrived yet.
  await seeUntil(guest, "a waiting-for-host state", (o) => o.phase === "waiting-for-host" || o.hostPresent === false, TIMEOUTS.noticeMs);
  // Then the host arrives and the guest proceeds without doing anything.
  await walkIn(host, cast.meeting!, { until: ["in-call"] });
  const h = await seeUntil(host, "the room (and any waiting guest)", (o) => o.phase === "in-call", 10_000);
  if ((h.lobbyCount ?? 0) >= 1) await admit(host, GUEST);
  await seePhase(guest, ["in-call"], 60_000);
});

scenario("perm-denied-by-user", async ({ cast }) => {
  const { host, guest } = await callWithGuest(cast, {
    name: GUEST_2,
    faults: { denyCamera: true, denyMicrophone: true },
  });
  // Joined without devices; both blocks are named, with a way to fix them, and they stay.
  const blocked = (o: { microphone: string | null; camera: string | null; text: string }) =>
    (o.microphone === "blocked" || /(mic|microphone)[^.]{0,40}(blocked|denied)|without a microphone/i.test(o.text)) &&
    (o.camera === "blocked" || /camera[^.]{0,40}(blocked|denied)/i.test(o.text));
  await seeUntil(guest, "mic AND camera blocked notices", blocked, TIMEOUTS.noticeMs);
  await seeUntil(guest, "a Fix / how-to-allow action", (o) => /\bfix\b|allow (access|camera|microphone)|how to (allow|unblock)/i.test(o.text), 5000);
  await guest.page.waitForTimeout(10_000);
  await keepsSeeing(guest, "the blocked notices (persistent)", blocked, 5000);
  await seeUntil(host, `${GUEST_2} still in the call`, (o) => o.participants.some((p) => p.name.includes(GUEST_2)), 5000);
});
