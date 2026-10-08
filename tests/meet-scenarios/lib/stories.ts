/** Set-ups many scenarios share. Each is the real UI path, not a shortcut. */
import type { Actor } from "./actor";
import type { MediaFaults } from "./media-faults";
import { TIMEOUTS } from "./env";
import { admit, seePhase, seeUntil, startInstantMeeting, walkIn } from "./meeting";
import { observe, summarize, type Observation } from "./observe";
import type { Cast } from "./scenario";

export const GUEST = "Priya Shah";
export const GUEST_2 = "Daniel Okafor";

/** Host signed in, meeting started, host on its pre-join (not yet in the call). */
export async function hostWithMeeting(cast: Cast): Promise<Actor> {
  const host = await cast.add({ label: "host", seat: "admin" });
  cast.meeting = await startInstantMeeting(host);
  return host;
}

/** Host in the call; a signed-out guest knocked, the HOST saw them waiting by name, admitted them, and they are in. */
export async function callWithGuest(
  cast: Cast,
  guestOpts: { name?: string; faults?: MediaFaults; launchArgs?: string[]; gesture?: boolean; blockDevices?: ("camera" | "microphone")[] } = {},
): Promise<{ host: Actor; guest: Actor }> {
  const host = await hostWithMeeting(cast);
  const name = guestOpts.name ?? GUEST;
  const guest = await cast.add({
    label: "guest",
    seat: "guest",
    displayName: name,
    ...(guestOpts.faults ? { faults: guestOpts.faults } : {}),
    ...(guestOpts.launchArgs ? { launchArgs: guestOpts.launchArgs } : {}),
    ...(guestOpts.blockDevices ? { blockDevices: guestOpts.blockDevices } : {}),
    ...(guestOpts.gesture === false ? { noGesture: true } : {}),
  });
  const meeting = cast.meeting!;
  await walkIn(host, meeting, { until: ["in-call"] });
  await walkIn(guest, meeting, { until: ["knocking", "in-call"], gesture: guestOpts.gesture ?? true });
  await admitWaiting(host, guest, name);
  return { host, guest };
}

/**
 * The host must SEE `name` waiting and admit them by name; the guest must then be in the call and
 * the host must see them. A guest shown the room before anyone admitted them is the admission race
 * (a product defect) and fails here — never a log line.
 */
export async function admitWaiting(host: Actor, guest: Actor, name: string): Promise<void> {
  await seeUntil(host, `${name} waiting to be let in`, (o) => (o.lobbyCount ?? 0) >= 1, TIMEOUTS.noticeMs);
  const g = await observe(guest.page);
  if (g.phase === "in-call") {
    guest.note(`ADMISSION RACE: shown the room (phase=in-call) while the host still lists them as waiting: ${summarize(g)}`);
    throw new Error(`admission race: ${name} was shown the room before the host admitted them (host lobby>=1)`);
  }
  await admit(host, name);
  await seePhase(guest, ["in-call"], 60_000);
  await seeUntil(host, `${name} in the call`, (o) => o.participants.some((p) => p.name.includes(name)), 30_000);
}

/** The name this person's own tile shows (their self view). Fails loudly when it cannot be read. */
export async function selfName(actor: Actor): Promise<string> {
  const o = await seeUntil(actor, "their own tile", (x) => x.participants.some((p) => p.self && p.name.length > 0), TIMEOUTS.noticeMs);
  return o.participants.find((p) => p.self)!.name;
}

/**
 * After a reload a person must get back into the call WITHOUT retyping their name and WITHOUT
 * knocking again; at most a Join press on the pre-join (pressed again if a press does not take).
 */
export async function backInAfterReload(actor: Actor, timeoutMs = 45_000): Promise<Observation> {
  const deadline = Date.now() + timeoutMs;
  let lastPress = 0;
  let o = await observe(actor.page);
  while (Date.now() < deadline) {
    o = await observe(actor.page);
    actor.saw(o);
    if (o.phase === "in-call") {
      actor.note(`SAW back in the call after the reload: ${summarize(o)}`);
      return o;
    }
    if (o.phase === "guest-name") throw new Error(`${actor.opts.label} was asked to type their name again after a reload: ${summarize(o)}`);
    if (o.phase === "knocking") throw new Error(`${actor.opts.label} had to knock again after a reload: ${summarize(o)}`);
    if (o.phase === "prejoin" && Date.now() - lastPress > 8000) {
      const join = actor.page.getByRole("button", { name: /^(Join now|Rejoin)$/ });
      if (await join.first().isEnabled().catch(() => false)) {
        await join.first().click();
        actor.note(lastPress ? "pressed Join now AGAIN after the reload" : "pressed Join now once after the reload");
        lastPress = Date.now();
      }
    }
    await actor.page.waitForTimeout(500).catch(() => undefined);
  }
  actor.note(`NEVER got back in after the reload: ${summarize(o)}`);
  throw new Error(`${actor.opts.label} should be back in the call within ${timeoutMs / 1000}s of a reload; saw ${summarize(o)}`);
}
