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
import { kioskPunch } from "@/features/hr/time/api/service";
import type { KioskPunchResult, PunchKind } from "@/features/hr/time/api/types";
import { mintPunchIntent, retryPunchIntent, type PunchIntent } from "@/features/hr/time/clock/punchIntent";

import { KIOSK_SKEW_REFUSAL, skewCorrectedNow, type KioskClockSkew } from "./kioskSkew";
import type { TrustedKioskSession } from "./useKioskDevice";

export type KioskPunchView =
  | { kind: "idle" }
  /** The act is chosen; the PIN pad is up. Nothing has been sent. */
  | { kind: "pin"; punchKind: PunchKind }
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
  /** Choose the act. Mints the one intent this punch will carry through every attempt. */
  begin: (punchKind: PunchKind) => void;
  /** Send it. The PIN is passed in and never stored anywhere in this hook. */
  submit: (pin: string) => void;
  /** 🚨 Same intent, same key — one more attempt at the SAME punch, never a second one. */
  retry: (pin: string) => void;
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

  return {
    view,

    begin: (punchKind: PunchKind) => {
      // ONE mint per user intent. See the header for why the employment segment is a nonce here.
      const minted = mintPunchIntent({
        kind: punchKind,
        employmentId: `kioskintent-${crypto.randomUUID()}`,
        deviceOrSession: deviceId,
        tz: kioskKeyTimeZone(),
        at: skewCorrectedNow(skew),
      });
      setIntent(minted);
      setView({ kind: "pin", punchKind });
    },

    submit: (pin: string) => {
      if (!intent || view.kind !== "pin") return;
      void send(intent, pin);
    },

    retry: (pin: string) => {
      if (!intent) return;
      void send(retryPunchIntent(intent), pin);
    },

    dispute: () =>
      setView((current) =>
        current.kind === "duplicate" ? { kind: "disputing", result: current.result } : current,
      ),

    dismiss: () => {
      setIntent(null);
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
function kioskKeyTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export { KIOSK_SKEW_REFUSAL };
