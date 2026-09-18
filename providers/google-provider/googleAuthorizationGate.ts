/**
 * 🚨 THE ONE-WINDOW GATE — ONE Google authorization window PER PERSON, not per
 * component (V-23 NEW-3, lane F-103).
 *
 * Before this module the platform had two locks and neither one was a lock:
 *
 *   1. `useGoogleConsentRunner` held a `useRef(false)`. A ref is per component
 *      instance, so two mounted surfaces (Settings → Connectors and the consent
 *      dialog, say) each held their OWN "lock" and each opened its own window.
 *      It also covered 2 of 19 authorization call sites.
 *   2. The provider read a `useState` flag (`authInProgress`) inside the
 *      rendered closure. Two presses in the SAME tick both read the stale
 *      `false` — React had not re-rendered yet — and both walked through.
 *
 * So the gate lives HERE, at module scope: one browser tab is one person, one
 * module instance, one gate. It is taken the moment a press is ACCEPTED — before
 * any organization wait, which is the multi-second gap a second press used to
 * walk through — and released when the window resolves, is dismissed, or the
 * call fails. The redirect path takes it and deliberately never releases it: the
 * page is leaving, and the fresh page load gets a fresh module.
 *
 * A second press while it is held is REFUSED with a named sentence (law 4:
 * nothing fails silently) — never silently dropped, never a second window.
 *
 * Callers that must hold the gate across their own awaits (the consent runner
 * waits for the organization first) take a handle and pass it down; the provider
 * primitives JOIN that handle instead of re-acquiring. A caller that passes
 * nothing has the gate taken for it inside the primitive, so no call site can
 * bypass it by forgetting.
 */

/** The exact sentence a refused second press gets. */
export const GOOGLE_AUTHORIZATION_BUSY_MESSAGE =
  "A Google authorization window is already open.";

/**
 * The refusal. It is an Error subclass so every existing `catch` that reads
 * `.message` keeps working, and a typed class so a surface can tell "someone is
 * already consenting" from "Google refused us".
 */
export class GoogleAuthorizationBusyError extends Error {
  /** What is holding the gate, when the holder named itself. */
  readonly holder: string | null;

  constructor(holder: string | null) {
    super(
      holder
        ? `${GOOGLE_AUTHORIZATION_BUSY_MESSAGE} Finish or close the ${holder} window, then press again.`
        : GOOGLE_AUTHORIZATION_BUSY_MESSAGE,
    );
    this.name = "GoogleAuthorizationBusyError";
    this.holder = holder;
  }
}

export interface GoogleAuthorizationGateHandle {
  /** Who took it, for the refusal sentence. */
  readonly holder: string | null;
  /** Idempotent: releasing twice, or after someone else took it, is a no-op. */
  release(): void;
}

let active: GoogleAuthorizationGateHandle | null = null;

/**
 * Take the gate, or refuse. Never returns `null` — a caller that cannot open a
 * window must be told why, so the refusal is thrown.
 */
export function acquireGoogleAuthorizationGate(
  holder?: string | null,
): GoogleAuthorizationGateHandle {
  if (active) throw new GoogleAuthorizationBusyError(active.holder);
  const handle: GoogleAuthorizationGateHandle = {
    holder: holder ?? null,
    release() {
      if (active === handle) active = null;
    },
  };
  active = handle;
  return handle;
}

/** Is a Google authorization window open (or being opened) right now? */
export function googleAuthorizationGateIsHeld(): boolean {
  return active !== null;
}

/**
 * Take the gate, UNLESS `existing` is the handle currently holding it — in which
 * case this call is part of that same accepted press and joins it. The returned
 * handle is a no-op release for a joined call, so an inner `finally` can never
 * drop a lock its caller still needs.
 */
export function acquireOrJoinGoogleAuthorizationGate(
  existing: GoogleAuthorizationGateHandle | null | undefined,
  holder?: string | null,
): GoogleAuthorizationGateHandle {
  if (existing && existing === active) {
    return { holder: existing.holder, release() {} };
  }
  return acquireGoogleAuthorizationGate(holder);
}

/**
 * Test-only reset. Module state outlives a React unmount by design, so a suite
 * that leaves the gate held would poison every later test.
 */
export function resetGoogleAuthorizationGateForTests(): void {
  active = null;
}
