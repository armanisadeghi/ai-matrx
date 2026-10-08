/**
 * Roles / host absence and leaving / ending — P0 states of catalog categories
 * "roles-host-absence" and "leaving-ending".
 */
import { formatDurationMs } from "@ai-matrx/kit/format";
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
import { observe, summarize } from "../lib/observe";
import { scenario } from "../lib/scenario";
import { GUEST, GUEST_2, admitWaiting, backInAfterReload, callWithGuest, hostWithMeeting, selfName } from "../lib/stories";

const isHost = (o: { role: string | null }) => o.role === "host";

/**
 * livekit-client's DefaultReconnectPolicy retries on [0, 300, 1200, 2700, 4800, 7000 x5] ms and then
 * gives up: ~44 s of back-off (node_modules/livekit-client, DEFAULT_RETRY_DELAYS_IN_MS; @ai-matrx/meet
 * sets no policy of its own). The cut outlasts it by 30 s so the "SDK gave up" branch is always hit.
 */
const SDK_GIVE_UP_MS = 0 + 300 + 1200 + 2700 + 4800 + 5 * 7000;
const HOST_CUT_MS = SDK_GIVE_UP_MS + 30_000;

scenario("host-drops-returns", async ({ cast }) => {
  const { host, guest } = await callWithGuest(cast);
  const hostName = await selfName(host);
  host.note(`host's own tile reads "${hostName}"`);
  await host.cutNetwork();
  await host.page.waitForTimeout(HOST_CUT_MS);
  await host.snap(`end of the ${formatDurationMs(HOST_CUT_MS, { style: "compact" })} cut (the SDK gives up after ~${formatDurationMs(SDK_GIVE_UP_MS, { style: "compact" })})`);
  await guest.snap("guest during the host's absence");
  await host.restoreNetwork();
  // Back in the call, still the host, with no prompt: a pre-join or name screen at ANY point is a prompt.
  const deadline = Date.now() + 90_000;
  let o = await observe(host.page);
  while (Date.now() < deadline) {
    o = await observe(host.page);
    host.saw(o);
    if (o.phase === "prejoin" || o.phase === "guest-name") {
      host.note(`PROMPTED after the network returned: ${summarize(o)}`);
      throw new Error(`host was put back on the ${o.phase} screen after the network returned (a prompt); saw ${summarize(o)}`);
    }
    if (o.phase === "in-call" && isHost(o)) break;
    await host.page.waitForTimeout(500);
  }
  host.note(`after the return: ${summarize(o)}`);
  expect(o.phase === "in-call" && isHost(o), `host should be back in the call as host within 90s, unprompted; saw ${summarize(o)}`).toBe(true);
  await keepsSeeing(guest, "still in the call", (x) => x.phase === "in-call", 5000);
  // The guest sees THE host back — one tile, that name, marked host (not a ghost or a second copy).
  await seeUntil(
    guest,
    `exactly one "${hostName}" tile, marked host`,
    (x) => {
      const tiles = x.participants.filter((p) => !p.self && p.name.includes(hostName));
      return tiles.length === 1 && tiles[0].role === "host";
    },
    30_000,
  );
});

scenario("host-leave-assign", async ({ cast }) => {
  const { host, guest } = await callWithGuest(cast);
  await host.page.getByRole("button", { name: /^Leave( call| meeting)?$/ }).first().click();
  // Leaving offers to hand the meeting to someone first, then to pick who.
  const assign = await seeControl(host, "an assign-a-new-host choice on Leave", host.page.getByRole("button", { name: /assign|make .* host|hand (over|off)|new host/i }), 5000);
  await assign.click();
  const pick = await seeControl(host, `${GUEST} offered as the new host`, host.page.getByRole("button", { name: new RegExp(GUEST) }).or(host.page.getByRole("option", { name: new RegExp(GUEST) })), 5000);
  await pick.click();
  await seeUntil(guest, "they are the host now", isHost, TIMEOUTS.noticeMs);
});

scenario(
  "host-leaves-unassigned",
  async ({ cast }) => {
    const { host, guest } = await callWithGuest(cast);
    // The host just closes the tab — no hand-over.
    await host.closeTab();
    await host.newTab(); // keep the host's cookie jar alive for cleanup
    // After the grace window the remaining person is promoted (default profile).
    await seeUntil(guest, "promoted to host after the grace window", isHost, TIMEOUTS.hostTransferMs + 60_000);
  },
  { timeoutMs: TIMEOUTS.hostTransferMs + 6 * 60_000 },
);

scenario("leave-or-end-choice", async ({ cast }) => {
  const { host, guest } = await callWithGuest(cast);
  await host.page.getByRole("button", { name: /^Leave( call| meeting)?$/ }).first().click();
  await seeControl(host, 'a plain "Leave meeting" choice on Leave', host.page.getByRole("button", { name: /^Leave (the )?meeting$|^Just leave$/i }), 5000);
  const endAll = await seeControl(host, 'an "End for all" choice on Leave', host.page.getByRole("button", { name: /end (meeting )?for (all|everyone)/i }), 5000);
  await endAll.click();
  await seePhase(guest, ["ended"], TIMEOUTS.noticeMs);
});

scenario("end-for-all-host", async ({ cast }) => {
  const host = await hostWithMeeting(cast);
  await walkIn(host, cast.meeting!, { until: ["in-call"] });
  // A signed-in MEMBER of the host's organization is in the call with the host.
  const member = await cast.addOrgMember("org member");
  const memberName = member.opts.displayName!;
  const m0 = await walkIn(member, cast.meeting!, { until: ["in-call", "knocking"] });
  if (m0.phase === "knocking") {
    member.note("org member was sent to the queue (the organization's lobby knob); the host admits them by name");
    await admitWaiting(host, member, memberName);
  }
  await seeUntil(host, `${memberName} in the call`, (o) => o.participants.some((p) => p.name.includes(memberName)), 30_000);
  const template = firstTokenRequest(member);
  await endForEveryone(host);
  await seePhase(host, ["ended"], TIMEOUTS.noticeMs);
  await seePhase(member, ["ended"], TIMEOUTS.noticeMs);
  const truth = await meetingTruth(cast.meeting!.slug);
  host.note(`server truth: ended_at=${String(truth.ended_at ?? null)} room=${String(truth.room_name)}`);
  expect(truth.ended_at, "meeting row has ended_at after End for everyone").toBeTruthy();
  // Nobody can bring the room back: the member re-opens the link…
  const before = member.tokenCalls.length;
  await member.page.goto(cast.meeting!.path, { waitUntil: "domcontentloaded" });
  await seePhase(member, ["ended"], 60_000);
  await keepsSeeing(member, "ended, no Join offered", (o) => o.phase === "ended" && !/\b(Join now|Rejoin)\b/.test(o.text), 10_000);
  const minted = member.tokenCalls.slice(before).filter((c) => c.status !== null && c.status < 300);
  expect(minted.length, `token door minted for org member ${memberName} on their own page after End for everyone`).toBe(0);
  // …and the token door refuses the member and the host by name.
  const m = await tokenProbe(member, template, memberName);
  expect(refused(m), `token door should refuse org member ${memberName} after End for everyone; answered HTTP ${m}`).toBe(true);
  const h = await tokenProbe(host, template, "host");
  expect(refused(h), `token door should refuse the host after End for everyone; answered HTTP ${h}`).toBe(true);
  const room = await roomTruth(String(truth.room_name));
  host.note(`LiveKit truth: room exists=${room.exists} participants=[${room.participants.join(", ")}]`);
  expect(room.exists && room.participants.length > 0, `LiveKit room ${room.room} came back with ${room.participants.join(", ")}`).toBe(false);
});

scenario(
  "empty-room-auto-end",
  async ({ cast }) => {
    await callWithGuest(cast);
    const { host, guest } = { host: cast.actors[0], guest: cast.actors[1] };
    // Everyone vanishes without pressing anything (tabs closed). From here the harness sends the
    // meeting server NOTHING for this meeting; it only reads the database row.
    await guest.closeTab();
    await host.closeTab();
    await host.newTab();
    const deadline = Date.now() + TIMEOUTS.emptyRoomEndMs + 120_000;
    host.note(`room abandoned; watching the server row for up to ${formatDurationMs(deadline - Date.now(), { style: "compact" })}`);
    let truth = await meetingTruth(cast.meeting!.slug);
    while (!truth.ended_at && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 30_000));
      truth = await meetingTruth(cast.meeting!.slug);
    }
    host.note(`server truth: ended_at=${String(truth.ended_at ?? null)} ended_by=${String(truth.ended_by ?? null)} auto_end=${JSON.stringify(truth.auto_end ?? null)}`);
    expect(truth.ended_at, "abandoned meeting still open on the server (no ended_at)").toBeTruthy();
    // It was the product's own auto-end — not a person, not the harness's cleanup.
    expect(truth.auto_end, `the meeting ended but not by the product's auto-end (ended_by=${String(truth.ended_by)})`).toBeTruthy();
    // And it was driven by the server (a LiveKit webhook or a timer), not by somebody's request:
    // the record must say what drove it. A request-spawned sweep (any join on the shared server,
    // other runs included) is not that mechanism.
    const drivers = Object.entries(truth.auto_end ?? {})
      .filter(([k]) => k !== "reason")
      .filter(([, v]) => typeof v === "string" && /webhook|timer|scheduled|cron|worker/i.test(v as string));
    expect(
      drivers.length > 0,
      `auto-end recorded no server-driven cause (fields: ${Object.keys(truth.auto_end ?? {}).join(", ")}); a sweep spawned by request traffic cannot be excluded`,
    ).toBe(true);
    const late = await cast.add({ label: "late guest", seat: "guest", displayName: GUEST_2 });
    await late.page.goto(cast.meeting!.path, { waitUntil: "domcontentloaded" });
    await seePhase(late, ["ended"], 60_000);
  },
  { timeoutMs: TIMEOUTS.emptyRoomEndMs + 10 * 60_000 },
);

scenario("refresh-in-call", async ({ cast }) => {
  const { host, guest } = await callWithGuest(cast);
  // The guest mutes, then refreshes mid-call.
  await guest.page.getByRole("button", { name: /^Mute\b/ }).first().click();
  await seeControl(guest, "the Unmute control (muted)", guest.page.getByRole("button", { name: /^Unmute\b/ }), 5000);
  await guest.refresh();
  // Never asked for the name again, never re-knocks; at most one Join press back in.
  await backInAfterReload(guest);
  await seeControl(guest, "still muted after the refresh (Unmute control)", guest.page.getByRole("button", { name: /^Unmute\b/ }), 5000);
  // The host sees the same one person, under the same name.
  await seeUntil(host, `exactly one ${GUEST}`, (o) => o.participants.filter((p) => p.name.includes(GUEST)).length === 1, 30_000);
  // The host refreshes too and keeps the host role.
  await host.refresh();
  await backInAfterReload(host);
  await seeUntil(host, "back in as host", (o) => o.phase === "in-call" && isHost(o), 45_000);
});
