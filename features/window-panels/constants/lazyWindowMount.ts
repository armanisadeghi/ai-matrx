/**
 * lazyWindowMount — the ONE deadline for "a window opened lazily has not
 * mounted yet".
 *
 * Every window component enters through `next/dynamic`, so between the action
 * that opens a window and the moment that window exists there is a chunk to
 * fetch (prod) or COMPILE (dev). Nothing in the app can predict how long that
 * takes: a cold Turbopack compile of a window's chunk on a loaded box is
 * routinely tens of seconds, a warm prod fetch is tens of milliseconds.
 *
 * 🚨 A WALL CLOCK IS NEVER THE SIGNAL THAT A WINDOW FAILED. Two subsystems
 * wait for a lazily-mounted window — `diagnostics/overlayRenderWatchdog.ts`
 * (did the panel appear?) and `url-sync/UrlPanelManager.tsx` (did the
 * `?panels=` token's window register its address?). Both wait on the REAL
 * signal the window emits when it mounts (`ackOverlayRender`, the
 * `urlSyncSlice` entry) and use this constant only as a last-resort ceiling
 * for ANNOUNCING that the wait failed — never as the thing that decides it
 * failed, and never as licence to destroy state the person gave us.
 *
 * Before 2026-09-20 the URL manager used its own 5 s constant AND acted on its
 * expiry by deleting the `?panels=` token from the address bar: a shared
 * deep link opened nothing and erased itself, in four of eight measured loads
 * (V-28 NEW-5). The deadline is now one number, generous on both runtimes, and
 * its expiry is a NOTICE, not a mutation.
 */
export const LAZY_WINDOW_MOUNT_DEADLINE_MS =
  process.env.NODE_ENV === "production" ? 12_000 : 45_000;
