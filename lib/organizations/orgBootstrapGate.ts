// lib/organizations/orgBootstrapGate.ts
//
// THE ONE "HAS THE ORGANIZATION QUESTION BEEN ANSWERED YET?" SIGNAL.
//
// Two different things used to be confused for each other:
//
//   "no organization is selected"      — a fact, worth refusing on;
//   "nobody has looked yet"            — a race, and refusing on it is a LIE.
//
// `ensureOrgId` joined only the sync engine's warm-cache hydration
// (`store._sync.boot()`) before deciding. That is enough on a warm boot, where
// the person's last organization comes back out of IndexedDB. On a FIRST-EVER
// session there is no local record and no apex cookie, so the only answer
// comes from `appContextPolicy.remote.fetch` → `resolveActiveOrgContext`,
// which deliberately waits for `whenPageIdle` before spending the network. A
// write made in that window — an autosave, a first note, a canvas score — was
// refused with "Select an organization" although the person has one and the
// app was about to find it. A false refusal is as dishonest as a false
// success.
//
// So: ONE promise, settled once, by whoever answers the question first. There
// is no second fetch here — this module starts nothing and knows nothing about
// organizations. It only lets a caller WAIT for the answer the boot path is
// already fetching, and it is settled from exactly the places that produce
// that answer:
//
//   - `bootstrapActiveOrganization` (lib/redux/thunks/activeOrgBootstrap.ts),
//     in its `finally`, beside the `setOrgBootstrapResolved(true)` dispatch;
//   - `appContextPolicy.remote.fetch` (lib/redux/slices/appContextSlice.ts),
//     on EVERY exit including the aborted and null ones.
//
// The wait is BOUNDED. A promise that can never settle is a hang, and a hang
// is the worst of the three failures — so after `RESOLUTION_TIMEOUT_MS` the
// wait gives up and the caller refuses, exactly as it would have before.
//
// Law: common-docs/policies/context-is-carried-never-rebuilt.md.

/** How long a write may wait for the boot answer before refusing anyway. */
export const RESOLUTION_TIMEOUT_MS = 10_000;

let settled = false;
let announce: (() => void) | null = null;
let resolution: Promise<void> = new Promise<void>((resolve) => {
  announce = resolve;
});

/** True once the boot path has answered the organization question. */
export function isOrgBootstrapResolved(): boolean {
  return settled;
}

/**
 * Announce that the organization question has been answered — with an
 * organization or without one. Idempotent; every producer may call it.
 */
export function markOrgBootstrapResolved(): void {
  if (settled) return;
  settled = true;
  announce?.();
}

/**
 * Wait for the boot path's answer, or for `RESOLUTION_TIMEOUT_MS`, whichever
 * comes first. Resolves either way — the caller decides what to do with a
 * still-empty selection. Never rejects.
 */
export async function whenOrgBootstrapResolved(
  timeoutMs: number = RESOLUTION_TIMEOUT_MS,
): Promise<void> {
  if (settled) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    resolution,
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
    }),
  ]);
  if (timer !== undefined) clearTimeout(timer);
}

/** Reset the gate. For tests and in-place auth swaps only. */
export function resetOrgBootstrapGate(): void {
  announce?.();
  settled = false;
  resolution = new Promise<void>((resolve) => {
    announce = resolve;
  });
}
