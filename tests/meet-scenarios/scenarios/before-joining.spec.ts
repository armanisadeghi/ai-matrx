/**
 * Before joining and pre-join devices — P0 states of catalog categories
 * "before-joining" and "prejoin-devices".
 */
import { expect } from "@playwright/test";
import { TIMEOUTS } from "../lib/env";
import { meetingTruth, roomTruth } from "../lib/fixtures";
import {
  endForEveryone,
  firstTokenRequest,
  keepsSeeing,
  seeControl,
  seePhase,
  seeUntil,
  refused,
  tokenProbe,
  walkIn,
} from "../lib/meeting";
import { scenario } from "../lib/scenario";
import { GUEST, GUEST_2, admitWaiting, callWithGuest, hostWithMeeting } from "../lib/stories";

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
  // The request shape the product itself sends to the token door (replayed below as each person).
  const template = firstTokenRequest(host);
  await endForEveryone(host);
  await seePhase(host, ["ended"], TIMEOUTS.noticeMs);
  const truth = await meetingTruth(cast.meeting!.slug);
  host.note(`server truth: ended_at=${String(truth.ended_at ?? null)} room=${String(truth.room_name)}`);
  expect(truth.ended_at, "meeting row has ended_at after End for everyone").toBeTruthy();
  // A signed-in MEMBER of the host's organization (the lane that is not refused by the guest/outsider rules)
  // and a signed-out guest both follow the old link.
  const member = await cast.addOrgMember("org member");
  const memberName = member.opts.displayName!;
  const guest = await cast.add({ label: "guest", seat: "guest", displayName: GUEST });
  await member.page.goto(cast.meeting!.path, { waitUntil: "domcontentloaded" });
  await guest.page.goto(cast.meeting!.path, { waitUntil: "domcontentloaded" });
  await seePhase(member, ["ended"], 60_000);
  await seePhase(guest, ["ended"], 60_000);
  await keepsSeeing(member, "the meeting-ended screen, no Join offered", (o) => o.phase === "ended" && !/\b(Join now|Rejoin)\b/.test(o.text), 15_000);
  // The token door refuses everyone: nothing the member's own page asked for was minted…
  const minted = member.tokenCalls.filter((c) => c.status !== null && c.status < 300);
  expect(minted.length, `token door minted for org member ${memberName} on their own page after the meeting ended`).toBe(0);
  // …and knocking directly, as the member and as the guest, is refused.
  const m = await tokenProbe(member, template, memberName);
  expect(refused(m), `token door should refuse org member ${memberName} for an ended meeting; answered HTTP ${m}`).toBe(true);
  const g = await tokenProbe(guest, template, GUEST);
  expect(refused(g), `token door should refuse a guest for an ended meeting; answered HTTP ${g}`).toBe(true);
  // No room was brought back to life.
  const room = await roomTruth(String(truth.room_name));
  member.note(`LiveKit truth: room exists=${room.exists} participants=[${room.participants.join(", ")}]`);
  expect(room.exists && room.participants.length > 0, `LiveKit room ${room.room} came back with ${room.participants.join(", ")}`).toBe(false);
  // The ended screen leads to what is left of the meeting: its record (summary, notes, transcript)
  // shown in place, or a link to it.
  const recordLink = member.page.getByRole("link", { name: /record|summary|notes|transcript|recording/i });
  await seeUntil(
    member,
    "the meeting's record (summary + transcript or notes) or a link to it",
    (o) => (/\bSummary\b/i.test(o.text) && /\b(Transcript|Notes)\b/i.test(o.text)) || o.notices.includes("record-link"),
    5000,
  ).catch(async (e: Error) => {
    if (!(await recordLink.first().isVisible().catch(() => false))) throw e;
    member.note("SAW a link to the meeting's record");
  });
});

scenario("before-start-host-absent-wait", async ({ cast }) => {
  const host = await hostWithMeeting(cast); // started, but the host has not joined
  const guest = await cast.add({ label: "guest", seat: "guest", displayName: GUEST });
  await walkIn(guest, cast.meeting!, { until: ["knocking", "waiting-for-host", "in-call"] });
  // The guest is told the host has not arrived yet.
  await seeUntil(guest, "a waiting-for-host state", (o) => o.phase === "waiting-for-host" || o.hostPresent === false, TIMEOUTS.noticeMs);
  // Then the host arrives and the guest proceeds without doing anything.
  await walkIn(host, cast.meeting!, { until: ["in-call"] });
  // The guest moves on by itself (no click): into the call, or on to the host's queue.
  const g = await seePhase(guest, ["knocking", "in-call"], 30_000);
  if (g.phase === "knocking") {
    guest.note("proceeded by itself to the host's queue (this product lets people in through the queue)");
    await admitWaiting(host, guest, GUEST);
  } else {
    guest.note("proceeded by itself straight into the call");
  }
});

scenario("perm-denied-by-user", async ({ cast }) => {
  // The guest's BROWSER has camera and microphone set to Block for this site (its own permission
  // store, as after a person clicks Block) — no script wraps the media APIs.
  const { host, guest } = await callWithGuest(cast, { name: GUEST_2, blockDevices: ["camera", "microphone"] });
  const browserSays = await guest.page.evaluate(async () => {
    const q = async (n: string) => (await navigator.permissions.query({ name: n as PermissionName }).catch(() => ({ state: "unqueryable" }))).state;
    const gum = await navigator.mediaDevices.getUserMedia({ audio: true, video: true }).then((s) => { s.getTracks().forEach((t) => t.stop()); return "granted"; }, (e: Error) => e.name);
    return { camera: await q("camera"), microphone: await q("microphone"), getUserMedia: gum };
  });
  guest.note(`browser permission state: ${JSON.stringify(browserSays)}`);
  expect(browserSays, "precondition: the browser itself denies camera and microphone").toEqual({ camera: "denied", microphone: "denied", getUserMedia: "NotAllowedError" });
  // Joined without devices; both blocks are named in the room, with a way to fix them, and they stay.
  const blocked = (o: { phase: string; microphone: string | null; camera: string | null; text: string }) =>
    o.phase === "in-call" &&
    (o.microphone === "blocked" || /(mic|microphone)[^.]{0,40}(blocked|denied)/i.test(o.text)) &&
    (o.camera === "blocked" || /camera[^.]{0,40}(blocked|denied)/i.test(o.text));
  await seeUntil(guest, "mic AND camera named as blocked, in the room", blocked, TIMEOUTS.noticeMs);
  await seeControl(guest, "a Fix / how-to-allow control", guest.page.getByRole("button", { name: /^Fix\b|how to (allow|unblock)|^Unblock/i }).or(guest.page.getByRole("link", { name: /^Fix\b|how to (allow|unblock)|^Unblock/i })), 5000);
  await keepsSeeing(guest, "the blocked notices (persistent)", blocked, 15_000);
  await seeUntil(host, `${GUEST_2} still in the call`, (o) => o.participants.some((p) => p.name.includes(GUEST_2)), 5000);
});
