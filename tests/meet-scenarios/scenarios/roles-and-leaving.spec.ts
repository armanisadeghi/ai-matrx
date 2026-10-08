/**
 * Roles / host absence and leaving / ending — P0 states of catalog categories
 * "roles-host-absence" and "leaving-ending".
 */
import { formatDurationMs } from "@ai-matrx/kit/format";
import { TIMEOUTS } from "../lib/env";
import {
  endForEveryone,
  keepsSeeing,
  meetingRow,
  seePhase,
  seeUntil,
} from "../lib/meeting";
import { observe } from "../lib/observe";
import { scenario } from "../lib/scenario";
import { GUEST, GUEST_2, callWithGuest } from "../lib/stories";

const isHost = (o: { role: string | null }) => o.role === "host";

scenario("host-drops-returns", async ({ cast }) => {
  const { host, guest } = await callWithGuest(cast);
  // The host's network drops for 30 s of real time, then returns.
  await host.dropFor(30_000);
  // Back in the call, still the host, without a prompt or a Join click.
  await seeUntil(host, "back in the call as host, unprompted", (o) => o.phase === "in-call" && isHost(o), 60_000);
  await keepsSeeing(guest, "still in the call", (o) => o.phase === "in-call", 5000);
  await seeUntil(guest, "the host back in the call", (o) => o.participants.length >= 2, 30_000);
});

scenario("host-leave-assign", async ({ cast }) => {
  const { host, guest } = await callWithGuest(cast);
  await host.page.getByRole("button", { name: /^Leave( call| meeting)?$/ }).first().click();
  // Leaving offers to hand the meeting to someone first.
  const assign = host.page.getByRole("button", { name: /assign|make .* host|hand (over|off)|new host/i });
  await seeUntil(host, "an assign-a-new-host choice on Leave", () => true, 2000);
  const offered = await assign.first().isVisible().catch(() => false);
  host.note(`assign-host choice offered: ${offered}`);
  if (!offered) {
    const o = await observe(host.page);
    throw new Error(`host pressed Leave and saw no assign-host choice; host now sees phase=${o.phase}`);
  }
  await assign.first().click();
  const pick = host.page.getByRole("button", { name: new RegExp(GUEST) }).or(host.page.getByRole("option", { name: new RegExp(GUEST) }));
  if (await pick.first().isVisible({ timeout: 3000 }).catch(() => false)) await pick.first().click();
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
  const endAll = host.page.getByRole("button", { name: /end (meeting )?for (all|everyone)/i });
  const justLeave = host.page.getByRole("button", { name: /^Leave (the )?meeting$|^Just leave$/i });
  await host.page.waitForTimeout(1500);
  const offered = (await endAll.first().isVisible().catch(() => false)) && (await justLeave.first().isVisible().catch(() => false));
  const o = await observe(host.page);
  host.note(`leave menu offered Leave + End for all: ${offered}; host phase now ${o.phase}`);
  if (!offered) throw new Error(`Leave did not offer "Leave meeting" and "End for all"; host now sees phase=${o.phase}`);
  await endAll.first().click();
  await seePhase(guest, ["ended"], TIMEOUTS.noticeMs);
});

scenario("end-for-all-host", async ({ cast }) => {
  const { host, guest } = await callWithGuest(cast);
  await endForEveryone(host);
  await seePhase(host, ["ended"], TIMEOUTS.noticeMs);
  await seePhase(guest, ["ended"], TIMEOUTS.noticeMs);
  const row = await meetingRow(cast.meeting!);
  host.note(`server row ended_at=${String(row?.ended_at ?? null)}`);
  if (!row?.ended_at) throw new Error("meeting row has no ended_at after End for everyone");
  // Nobody can bring the room back: the guest re-opens the link, the host revisits.
  await guest.page.goto(cast.meeting!.path, { waitUntil: "domcontentloaded" });
  await host.page.goto(cast.meeting!.path, { waitUntil: "domcontentloaded" });
  await seePhase(guest, ["ended"], 60_000);
  await seePhase(host, ["ended"], 60_000);
  await keepsSeeing(host, "ended, no Join offered", (o) => o.phase === "ended", 10_000);
});

scenario(
  "empty-room-auto-end",
  async ({ cast }) => {
    const { host, guest } = await callWithGuest(cast);
    // Everyone vanishes without pressing anything (tabs closed).
    await guest.closeTab();
    await host.closeTab();
    await host.newTab();
    host.note(`room abandoned; waiting ${formatDurationMs(TIMEOUTS.emptyRoomEndMs, { style: "compact" })} of real time`);
    await new Promise((r) => setTimeout(r, TIMEOUTS.emptyRoomEndMs));
    // The server ended it by itself, so the next person sees an ended meeting.
    const row = await meetingRow(cast.meeting!);
    host.note(`server row ended_at=${String(row?.ended_at ?? null)}`);
    const late = await cast.add({ label: "late guest", seat: "guest", displayName: GUEST_2 });
    await late.page.goto(cast.meeting!.path, { waitUntil: "domcontentloaded" });
    await seePhase(late, ["ended"], 60_000);
    if (!row?.ended_at) throw new Error("abandoned meeting still open on the server (no ended_at)");
  },
  { timeoutMs: TIMEOUTS.emptyRoomEndMs + 8 * 60_000 },
);

scenario("refresh-in-call", async ({ cast }) => {
  const { host, guest } = await callWithGuest(cast);
  // The guest mutes, then refreshes mid-call.
  await guest.page.getByRole("button", { name: /^Mute\b/ }).first().click();
  await seeUntil(guest, "muted", () => true, 1000);
  await guest.refresh();
  // Never asked for the name again, never re-knocks; at most one click back in.
  await guest.page.waitForTimeout(3000);
  const after = await observe(guest.page);
  guest.note(`after refresh: phase=${after.phase}`);
  if (after.phase === "guest-name") throw new Error("guest asked to retype their name after a refresh");
  if (after.phase === "prejoin") {
    await guest.page.getByRole("button", { name: /^(Join now|Rejoin)$/ }).first().click();
    guest.note("one click to rejoin");
  }
  await seePhase(guest, ["in-call"], 45_000);
  await seeUntil(guest, "still muted after the refresh", (o) => /\bUnmute\b/.test(o.text) || o.notices.includes("muted"), 5000)
    .catch(async () => {
      const unmute = await guest.page.getByRole("button", { name: /^Unmute\b/ }).isVisible().catch(() => false);
      if (!unmute) throw new Error("mute state lost across the refresh");
    });
  // The host sees the same one person, under the same name.
  await seeUntil(host, `exactly one ${GUEST}`, (o) => o.participants.filter((p) => p.name.includes(GUEST)).length === 1, 30_000);
  // The host refreshes too and keeps the host role.
  await host.refresh();
  await host.page.waitForTimeout(3000);
  const h = await observe(host.page);
  if (h.phase === "prejoin") await host.page.getByRole("button", { name: /^(Join now|Rejoin)$/ }).first().click();
  await seeUntil(host, "back in as host", (o) => o.phase === "in-call" && isHost(o), 45_000);
});
