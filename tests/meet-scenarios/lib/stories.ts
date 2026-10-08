/** Set-ups many scenarios share. Each is the real UI path, not a shortcut. */
import type { Actor } from "./actor";
import type { MediaFaults } from "./media-faults";
import { TIMEOUTS } from "./env";
import { admit, seePhase, seeUntil, startInstantMeeting, walkIn } from "./meeting";
import type { Cast } from "./scenario";

export const GUEST = "Priya Shah";
export const GUEST_2 = "Daniel Okafor";

/** Host signed in, meeting started, host on its pre-join (not yet in the call). */
export async function hostWithMeeting(cast: Cast): Promise<Actor> {
  const host = await cast.add({ label: "host", seat: "admin" });
  cast.meeting = await startInstantMeeting(host);
  return host;
}

/** Host in the call; a signed-out guest knocked, was admitted, and is in the call. */
export async function callWithGuest(
  cast: Cast,
  guestOpts: { name?: string; faults?: MediaFaults; launchArgs?: string[]; gesture?: boolean } = {},
): Promise<{ host: Actor; guest: Actor }> {
  const host = await hostWithMeeting(cast);
  const name = guestOpts.name ?? GUEST;
  const guest = await cast.add({
    label: "guest",
    seat: "guest",
    displayName: name,
    ...(guestOpts.faults ? { faults: guestOpts.faults } : {}),
    ...(guestOpts.launchArgs ? { launchArgs: guestOpts.launchArgs } : {}),
  });
  const meeting = cast.meeting!;
  await walkIn(host, meeting, { until: ["in-call"] });
  await walkIn(guest, meeting, { until: ["knocking", "in-call"], gesture: guestOpts.gesture ?? true });
  const now = await seeUntil(guest, "knocking or in the call", (o) => o.phase === "knocking" || o.phase === "in-call", 10_000);
  if (now.phase === "knocking") {
    await seeUntil(host, `${name} waiting`, (o) => (o.lobbyCount ?? 0) >= 1, TIMEOUTS.noticeMs);
    await admit(host, name);
  }
  await seePhase(guest, ["in-call"], 60_000);
  await seeUntil(host, `${name} in the call`, (o) => o.participants.some((p) => p.name.includes(name)), 30_000);
  return { host, guest };
}
