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
/**
 * What the CALLER'S OWN failed read was.
 *
 *  - `fault` — a transport or query failure (a timeout, a malformed request).
 *    It says nothing about access, so a level claim is believable and a retry
 *    can work.
 *  - `access-question` — the read returned NOTHING, or a policy refused it.
 *    That is itself an authorization answer, and it outranks any level the
 *    resolver claims: see the header of this function.
 */
export type AccessReadOutcome = "fault" | "access-question";

export function deriveStatus(
  payload: Record<string, unknown>,
  disclosure: AccessDisclosure,
  read: AccessReadOutcome,
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
  // Facts about the CALLER — and only where the caller's own read left room
  // for them.
  //
  // 🚨 A LEVEL CLAIM IS NOT EVIDENCE AGAINST A READ THAT CAME BACK EMPTY
  // (V-XT-2/N2, 2026-09-15). `access_denied_context` promotes any platform
  // admin to `level: 'admin'` because the `platform_admin_all` RLS policy
  // normally lets them read the row. When the surface's own read returned
  // nothing anyway, those two answers disagree — and the screen used to
  // resolve the disagreement in favour of the claim, telling a person "You do
  // have access to it — something went wrong on our side. Try again." about a
  // conversation the server had refused them with `404
  // conversation_not_found`, on a retry that could never succeed.
  //
  // So `ok` — "you can open this, the failure was transient" — is reachable
  // only from a read that actually FAILED transiently. A read that simply
  // returned nothing is an access answer, and the record is reported as what
  // the caller actually got: closed.
  if (read === "fault" && parseLevel(payload.level) !== "none") return "ok";
  if (payload.exists === true) return "denied";
  return "error";
}
