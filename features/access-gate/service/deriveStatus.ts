/**
 * deriveStatus — the ONE decision every access surface branches on.
 *
 * Pure on purpose, and in its own file so it can be tested without dragging in
 * a Supabase client. A wrong answer here is not a bug in a screen; it is a lie
 * told to a person about their own data, which is the thing this whole feature
 * exists to stop.
 */

import type {
  AccessDeniedContext,
  AccessDisclosure,
  AccessGateStatus,
} from "@/features/access-gate/types";

/** The permission level, normalized. Anything unrecognized is no access. */
function parseLevel(raw: unknown): AccessDeniedContext["level"] {
  return raw === "admin" || raw === "edit" || raw === "view" ? raw : "none";
}

/**
 * Turn the RPC payload into the ONE status a surface branches on.
 *
 * Order matters, and it encodes two different questions.
 *
 * FACTS ABOUT THE RECORD come first. A proven deletion is the answer, not a
 * symptom: whether the caller holds admin on the row changes nothing about a
 * row that is gone. Until 2026-08-25 `level` was tested first, so an admin
 * opening a deleted site was told "You do have access to it — something went
 * wrong on our side. Try again." — a retry that could never succeed, on a
 * record that was never coming back. That is exactly the class of lie this
 * feature exists to kill, and it hid because the two most common cases (an
 * admin on a LIVE row, a stranger on a deleted one) both answer correctly.
 *
 * FACTS ABOUT THE CALLER come second. "Do I actually have access?" is asked
 * before `denied` because a surface only calls this after a read failed — and
 * if the caller genuinely has access to a live record, the failure was
 * transient (a dropped connection, a timeout) and showing them a denial screen
 * would be its own lie.
 */
export function deriveStatus(
  payload: Record<string, unknown>,
  disclosure: AccessDisclosure,
): AccessGateStatus {
  // An unregistered token is a bug in the CALLING surface, not evidence about
  // the user's record. Reporting it as "missing" would tell someone their data
  // is gone because WE misconfigured a registry — the exact lie this feature
  // exists to kill. (Caught by the adversarial pass, 2026-08-11.)
  if (payload.unresolvable === true) return "error";
  if (disclosure === "anonymous") return "anonymous";
  // Facts about the RECORD, before any question about the caller.
  if (payload.exists === false) return "missing";
  if (payload.deleted === true) return "deleted";
  // Facts about the CALLER.
  if (parseLevel(payload.level) !== "none") return "ok";
  if (payload.exists === true) return "denied";
  return "error";
}
