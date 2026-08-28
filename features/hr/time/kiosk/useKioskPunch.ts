/**
 * features/hr/time/kiosk/useKioskPunch.ts — one kiosk punch, from choosing the act to the card.
 *
 * 🚨 **NO OPTIMISTIC UI** (L3-68, SPEC-TIME §3.3). There is no state in this hook that shows a
 * confirmation before the server answered. `submitting` is a visibly *unfinished* state and the
 * confirmation card is reachable only from a resolved `kioskPunch` response. *A card that appears
 * first lets a worker walk away unpunched* — and on a wall tablet they will, because the card is
 * the only thing that ever tells them anything.
 *
 * 🚨 **OFFLINE BLOCKS THE WRITE AND NEVER QUEUES** (L3-71, AD-10). *"This tablet is offline. Your
 * punch was not recorded. Tell your manager."* A stated product limit, not a spinner and not a
 * silent hope. The idempotency key exists so queueing can be added later without a re-key.
 *
 * 🚨 **SKEW BEYOND THE MAX REFUSES THE PUNCH BEFORE IT IS SENT** (§3.3). Not a warning, not a
 * flag — the request is not made.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * 🚨 THE IDEMPOTENCY KEY ON A KIOSK, AND THE ONE THING THE CONTRACT CANNOT GIVE US
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * `mintPunchIdempotencyKey` composes `<device_or_session>:<employment>:<kind>:<local_iso_minute>`
 * (SPEC-DATA-MODEL §7.1). The kiosk **cannot know the employment**: identity is the PIN, and the PIN
 * is resolved server-side inside `hr_kiosk_punch`. Two candidate fillings for that segment, and both
 * of the obvious ones are wrong:
 *
 *   • **The device id alone.** Then two employees punching the same kind in the same minute on the
 *     same tablet — which is *exactly what a shift change is* — mint the same key and collapse onto
 *     one row under the org-wide unique constraint. One of them is not paid. This is the precise
 *     failure `api/idempotencyKey.ts` was written to prevent.
 *   • **Anything derived from the PIN**, hashed or not. The key is stored in a durable, HR-readable
 *     index; a 4-digit PIN behind a device-salted hash is brute-forceable by anyone who can read it.
 *
 * So the segment is a **per-intent nonce**: minted once when the employee chooses the act, held
 * across every retry of that intent (which is the key's actual job — one intent, one punch, however
 * many attempts), and different for every other person at the tablet. It preserves the declared
 * four-segment composition and the retry guarantee, and gives up only cross-page-load dedup, which
 * the key never provided on any surface.
 *
 * **DEBT, named in the report:** `hr_kiosk_punch` should re-scope the key server-side once it has
 * resolved the employment from the PIN, so the org-wide constraint carries the employment the client
 * genuinely cannot supply. Until it does, the near-duplicate detector in §3.4 — which works off a
 * *different* mechanism (same kind, same employment, inside the window) — is what catches a real
 * second punch, and the `duplicate-suspected` card below is its face.
 */

"use client";

import { useEffect, useState } from "react";

import type { HrFixtureCase } from "@/features/hr/mock/transport";
import { HrRpcError } from "@/features/hr/time/api/rpc";
import {
  closeKioskSession,
  kioskPunch,
  openKioskSession,
  resetKioskPin,
} from "@/features/hr/time/api/service";
import type { KioskPunchResult, PunchKind } from "@/features/hr/time/api/types";
import { mintPunchIntent, type PunchIntent } from "@/features/hr/time/clock/punchIntent";

import { KIOSK_SKEW_REFUSAL, skewCorrectedNow, type KioskClockSkew } from "./kioskSkew";
import type { TrustedKioskSession } from "./useKioskDevice";

export type KioskPunchView =
  | { kind: "idle" }
  /**
   * The act is chosen; the pad asks for the **employee number and then the PIN**. Nothing sent yet.
   *
   * 🚨 **A PIN ALONE IDENTIFIES NOBODY** (§1.2, §3.3). It is a secret, not an identifier, and two
   * employees may hold the same four digits. The pad used to collect a PIN only and hand it to
   * `hr_kiosk_punch`, which cannot resolve a person from it — R2.
   */
  | { kind: "identify"; punchKind: PunchKind }
  /** `hr_kiosk_session_open` in flight — the PIN-accept step. Visibly unfinished. */
  | { kind: "opening"; punchKind: PunchKind }
  /**
   * 🚨 The accepted PIN was set by somebody else and is temporary (`must_reset`). The person is
   * already authenticated — the session is bound to them — and this is the only surface they have,
   * so they replace it here before the punch goes through.
   */
  | {
      kind: "must-reset";
      punchKind: PunchKind;
      employeeName: string | null;
      /** The server's refusal from a rejected reset attempt, rendered verbatim. */
      refusal: string | null;
    }
  /**
   * 🚨 Lockout, owned by `hr_kiosk_session_open` (R3). The wording never reveals whether the
   * employee number or the PIN was the wrong one, nor whether either exists.
   */
  | { kind: "locked"; lockedUntil: string | null }
  /** 🚨 Visibly unfinished. Never a confirmation. */
  | { kind: "submitting"; punchKind: PunchKind }
  | { kind: "confirmed"; result: KioskPunchResult }
  /** §3.4's real second punch. ONE door, and never a silent write. */
  | { kind: "duplicate"; result: KioskPunchResult }
  /** Behind that one door. See `KioskDisputeInstructions` for why it instructs rather than writes. */
  | { kind: "disputing"; result: KioskPunchResult }
  /** The server's own sentence, verbatim. Never names anyone who did not authenticate. */
  | { kind: "refused"; message: string }
  | { kind: "clock-wrong" }
  | { kind: "offline" };

export interface KioskPunch {
  view: KioskPunchView;
  /** Choose the act. The pad comes up next; nothing is sent until the person is identified. */
  begin: (punchKind: PunchKind) => void;
  /**
   * Identify and punch: opens the person-bound session with the employee number + PIN, then writes
   * the punch against it and closes the session.
   *
   * 🚨 Neither the number nor the PIN is ever stored in React state — both are arguments that live
   * only for the duration of this call. A wall tablet must not hold somebody's credentials in a
   * component that the next person walks up to.
   */
  submit: (employeeNumber: string, pin: string) => void;
  /**
   * Replace the temporary PIN and then continue the punch with the NEW one — `hr_kiosk_punch`
   * re-checks the PIN, and the old one stops verifying the instant the reset lands.
   */
  submitNewPin: (newPin: string) => void;
  /** The duplicate card's ONE door. Opens instructions; it never writes a second punch. */
  dispute: () => void;
  /** Back to idle from anywhere. The tablet must never sit on a person's name. */
  dismiss: () => void;
}

export interface UseKioskPunchInput {
  /** The device's own id — the key's `device_or_session` segment. Never the session token: a
   *  bearer credential does not belong in a durable, HR-readable index. */
  deviceId: string;
  session: TrustedKioskSession;
  skew: KioskClockSkew | null;
  offline: boolean;
  mockCase?: HrFixtureCase;
}

export function useKioskPunch({
  deviceId,
  session,
  skew,
  offline,
  mockCase,
}: UseKioskPunchInput): KioskPunch {
  const [view, setView] = useState<KioskPunchView>({ kind: "idle" });
  const [intent, setIntent] = useState<PunchIntent | null>(null);
  /*
   * The punch waiting on a forced PIN reset. 🚨 The employee NUMBER is held (it is an identifier the
   * session already accepted); the PIN is NOT — the new one arrives as an argument and the old one
   * is dead the moment the reset lands.
   */
  const [pendingReset, setPendingReset] = useState<{
    intent: PunchIntent;
    employeeNumber: string;
  } | null>(null);

  // ── Auto-dismiss to idle at the server's configured seconds (L3-68) ─────────────────────────
  //
  // The confirmation and the refusal go by themselves: a wall tablet left showing either one is a
  // tablet the next person cannot use. The **duplicate** card deliberately does not — it carries a
  // decision ("That's not right"), and a card that expires while somebody is reading it takes their
  // only door with it.
  const autoDismiss =
    view.kind === "confirmed" || view.kind === "refused" || view.kind === "clock-wrong";
  useEffect(() => {
    if (!autoDismiss) return;
    const id = window.setTimeout(
      () => setView({ kind: "idle" }),
      session.config.confirmDismissSeconds * 1000,
    );
    return () => window.clearTimeout(id);
  }, [autoDismiss, view, session.config.confirmDismissSeconds]);

  async function send(current: PunchIntent, pin: string) {
    if (offline) {
      setView({ kind: "offline" });
      return;
    }
    if (skew?.beyondMax) {
      // 🚨 Refused before it is sent. The request is not made at all.
      setView({ kind: "clock-wrong" });
      return;
    }

    setView({ kind: "submitting", punchKind: current.kind });
    try {
      const result = await kioskPunch(
        {
          sessionToken: session.sessionToken,
          employeePin: pin,
          kind: current.kind,
          // The tablet's own clock, corrected by the measured skew. The server keeps this raw and
          // stamps the corrected truth beside it — both are always stored (§3.3).
          deviceReportedAt: skewCorrectedNow(skew).toISOString(),
          idempotencyKey: current.idempotencyKey,
        },
        { mockCase },
      );
      /*
       * 🚨 The person-bound session ends the moment the punch resolves (§3.3's flowchart closes it
       * on the confirmation card). A wall tablet must never sit with one employee's identity live on
       * it while the next person walks up — that is the whole reason this session's TTL is measured
       * in MINUTES while the device session's is measured in hours (§1.2).
       *
       * Fire-and-forget deliberately: the punch is already written and the confirmation is owed to
       * the person standing there. A failed close expires on its own within minutes; blocking the
       * card on it would trade a guaranteed harm for a bounded one.
       */
      void closeKioskSession(session.sessionToken, "completed", { mockCase }).catch(() => {});

      // A replay is a SUCCESS: `result.replayed` renders the same confirmation with one extra line.
      setView(
        result.duplicateSuspected
          ? { kind: "duplicate", result }
          : { kind: "confirmed", result },
      );
    } catch (cause: unknown) {
      if (cause instanceof HrRpcError) {
        // 🚨 Verbatim. The kiosk's refusals never say whether a PIN exists and never name anyone.
        setView({ kind: "refused", message: cause.userMessage });
        return;
      }
      setView({ kind: "offline" });
    }
  }

  /**
   * 🚨 **ONE INDISTINGUISHABLE FAILURE** (§1.2, §3.3). A wrong employee number and a wrong PIN
   * produce the same sentence, so the pad can never be used to discover who works here. The server
   * answers `not_authenticated` for both on purpose; this must not helpfully elaborate.
   */
  async function identifyThenPunch(current: PunchIntent, employeeNumber: string, pin: string) {
    if (offline) {
      setView({ kind: "offline" });
      return;
    }
    if (skew?.beyondMax) {
      setView({ kind: "clock-wrong" });
      return;
    }
    if (!employeeNumber || !pin) return;

    setView({ kind: "opening", punchKind: current.kind });
    try {
      const person = await openKioskSession(session.sessionToken, employeeNumber, pin, { mockCase });

      /*
       * 🚨 A temporary PIN stops here. The punch is NOT written first and reset afterwards: an
       * administrator's PIN would then have recorded a real punch, and the reset could be walked
       * away from — leaving the temporary secret live on a person who thinks they are done.
       */
      if (person.mustReset) {
        setPendingReset({ intent: current, employeeNumber });
        setView({
          kind: "must-reset",
          punchKind: current.kind,
          employeeName: null,
          refusal: null,
        });
        return;
      }
    } catch (cause: unknown) {
      if (cause instanceof HrRpcError) {
        const reason = typeof cause.details.reason === "string" ? cause.details.reason : cause.code;
        if (reason === "locked") {
          const until = cause.details.locked_until;
          setView({ kind: "locked", lockedUntil: typeof until === "string" ? until : null });
          return;
        }
        // Uniform. Never "no such employee number", never "wrong PIN".
        setView({
          kind: "refused",
          message: "That did not work. Check your employee number and PIN, or ask your manager.",
        });
        return;
      }
      setView({ kind: "offline" });
      return;
    }

    // The person is bound to the device session; the punch goes against it.
    await send(current, pin);
  }

  return {
    view,

    begin: (punchKind: PunchKind) => {
      // ONE mint per user intent. See the header for why the employment segment is a nonce here.
      const minted = mintPunchIntent({
        kind: punchKind,
        employmentId: `kioskintent-${crypto.randomUUID()}`,
        deviceOrSession: deviceId,
        tz: kioskKeyTimeZone(session.config.tz),
        at: skewCorrectedNow(skew),
      });
      setIntent(minted);
      setView({ kind: "identify", punchKind });
    },

    /**
     * 🚨 R2 + R3. The pad hands over the **employee number and the PIN**, and this opens the
     * person-bound session before it punches.
     *
     * `hr_kiosk_session_open` is the PIN-accept step and **it owns the lockout counter** —
     * `hr_kiosk_punch` re-checks the PIN but counts nothing. A kiosk that punched directly, as this
     * one did, had no lockout at all: a PIN could be guessed forever, four digits at a time, on an
     * unattended tablet.
     */
    submit: (employeeNumber: string, pin: string) => {
      if (!intent || view.kind !== "identify") return;
      void identifyThenPunch(intent, employeeNumber.trim(), pin);
    },

    submitNewPin: (newPin: string) => {
      if (!pendingReset || view.kind !== "must-reset") return;
      void (async () => {
        setView({ kind: "opening", punchKind: pendingReset.intent.kind });
        try {
          await resetKioskPin(session.sessionToken, newPin, { mockCase });
        } catch (cause: unknown) {
          // The server's sentence, verbatim — "Choose a PIN different from the one you were given."
          setView({
            kind: "must-reset",
            punchKind: pendingReset.intent.kind,
            employeeName: null,
            refusal:
              cause instanceof HrRpcError
                ? cause.userMessage
                : "That did not work. Try again, or ask your manager.",
          });
          return;
        }
        /*
         * The session is still bound to this person, but `hr_kiosk_punch` re-checks the PIN — and
         * the temporary one no longer verifies. The punch continues with the PIN they just chose.
         */
        setPendingReset(null);
        await send(pendingReset.intent, newPin);
      })();
    },

    dispute: () =>
      setView((current) =>
        current.kind === "duplicate" ? { kind: "disputing", result: current.result } : current,
      ),

    dismiss: () => {
      setIntent(null);
      setPendingReset(null);
      setView({ kind: "idle" });
    },
  };
}

/**
 * The zone the kiosk mints its key's local minute in.
 *
 * 🚨 The key's minute segment must be stable for one intent, and `mintPunchIdempotencyKey` refuses
 * to guess it — it takes the punch's **stamped** zone precisely so two surfaces in different zones
 * mint the same key. The kiosk session does not carry an IANA zone (it carries `locationName`,
 * which is a label, not a zone), so the tablet's own resolved zone is the only value available, and
 * it is the right one in practice: a wall tablet is physically at the location whose punches it
 * records.
 *
 * **DEBT, named in the report:** `KioskDeviceSession.config` should carry the device location's
 * IANA `tz`, the way `ClockState` does. Until it does, a tablet whose OS zone is misconfigured
 * mints a key against the wrong minute — harmless to the punch itself (the server stamps the truth
 * from the location), but it weakens the retry guarantee across a minute boundary.
 */
/**
 * The zone a kiosk renders and keys against.
 *
 * 🚨 **THE LOCATION'S STAMPED ZONE, NOT THE TABLET'S.** `hr._kiosk_device_config` returns `tz`
 * explicitly *"because the tablet renders stamped times"* — and this lane used to infer it from the
 * device's own OS clock, carrying a debt note that said the session had none. It does. The tablet's
 * clock is the one thing already under suspicion here (see `kioskSkew.ts`), so trusting its zone to
 * decide which DAY a punch belongs to was the same mistake in a different unit: a tablet set to the
 * wrong region would mint keys and render confirmations against the wrong `local_work_date`.
 *
 * The browser zone remains only as a last resort for a truncated envelope, and it is the honest
 * one: there is nothing better to fall back to, and the server stamps the authoritative value on
 * the punch regardless.
 */
export function kioskKeyTimeZone(sessionTz?: string | null): string {
  return sessionTz || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export { KIOSK_SKEW_REFUSAL };
