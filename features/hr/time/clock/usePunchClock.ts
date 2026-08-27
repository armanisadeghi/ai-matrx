/**
 * features/hr/time/clock/usePunchClock.ts — the punch widget's only controller.
 *
 * 🚨 **THE WIDGET RENDERS `hr_clock_state` AND DERIVES NO STATE OF ITS OWN** (L3-44, §2.1).
 * Everything this hook holds is one of exactly three things:
 *   • the last `ClockState` the server returned, verbatim;
 *   • the **intent** currently in flight (which key, which kind, how many attempts);
 *   • a transport fact this browser knows and the server cannot — offline, and the last error.
 *
 * It computes no phase, no allowed kinds, no elapsed hours and no eligibility. `phase`,
 * `allowedKinds`, `blocked`, `attestation` and `capture` are all server facts. If you find yourself
 * writing `if (phase === "clocked_in") allowed = [...]` here, stop: that list is
 * `clockState.allowedKinds`, and re-deriving it is how the button set and the server's refusals
 * drift apart.
 *
 * 🚨 **NO CLIENT COMPUTES HOURS** (L3-74). Nothing here subtracts timestamps or multiplies a rate.
 * The only elapsed figure that moves is `liveElapsed.ts`'s display-only ticker, anchored to the
 * server's own `elapsedWorkedMinutes` / `elapsedBreakMinutes`.
 */

"use client";

import { useEffect, useState } from "react";

import type { HrFixtureCase } from "@/features/hr/mock/transport";
import { HrRpcError } from "@/features/hr/time/api/rpc";
import { getClockState, recordPunch } from "@/features/hr/time/api/service";
import type {
  AttestationResponse,
  ClockState,
  PunchKind,
  PunchRecordResult,
  PunchSource,
} from "@/features/hr/time/api/types";

import { captureGeoIfRequested } from "./geoCapture";
import {
  attachAttestation,
  attachGeo,
  mintPunchIntent,
  retryPunchIntent,
  type PunchIntent,
} from "./punchIntent";

/**
 * The eight states of §2.1, as a discriminated union so an unhandled one is a compile error rather
 * than a blank panel. Five phases come from the server; `attesting`, `offline` and `error` are
 * facts about this interaction, and `blocked` is a **server** fact carrying a sentence and a door.
 */
export type PunchClockView =
  | { kind: "loading" }
  /** Route 34 before an operator has searched for anyone. Never a roster (L3-48). */
  | { kind: "no-subject" }
  | { kind: "blocked"; blocked: NonNullable<ClockState["blocked"]> }
  | { kind: "offline"; intent: PunchIntent | null; state: ClockState | null }
  | { kind: "error"; error: PunchClockError; intent: PunchIntent | null; state: ClockState | null }
  | { kind: "attesting"; intent: PunchIntent; state: ClockState }
  | { kind: "ready"; state: ClockState };

export interface PunchClockError {
  /**
   * 🚨 Rendered **verbatim** (§2.1: *"the typed error's human sentence, verbatim from the RPC"*).
   * Never replaced with a generic sentence — a denial that does not name what was missing is how an
   * hourly employee ends up with nowhere to go.
   */
  userMessage: string;
  code: string;
  /** True where a Retry can legitimately reuse the same intent. */
  retryable: boolean;
}

export interface PunchConfirmation {
  result: PunchRecordResult;
  intent: PunchIntent;
  /** What was captured, for §4.9's *"Location recorded"* line on the confirmation. */
  capturedNotices: readonly string[];
  /** A quiet sentence where capture was asked for and not obtained. Never an error. */
  captureUnavailable: string | null;
}

export interface UsePunchClockInput {
  /** `null` on route 34 until the operator picks somebody. */
  employmentId: string | null;
  /** `web` on route 6, `manager_entry` on route 34. The kiosk has its own lane. */
  source: PunchSource;
  /** The mandatory device/session segment of the idempotency key. */
  deviceOrSession: string;
  /** Mock-lane case for `hr_clock_state`. Ignored entirely when `NEXT_PUBLIC_HR_MOCK` is not `1`. */
  mockCase?: HrFixtureCase;
  /**
   * Mock-lane case for `hr_punch_record` only. Split from {@link mockCase} because the two most
   * important punch fixtures live behind states the clock-state fixture would never let you reach:
   * `edge` on the punch is the **idempotent replay that must render as a success**, while `edge` on
   * the clock state is `blocked`, which renders no punch control at all. One selector for both makes
   * the replay unreachable, which is how it goes unlooked-at until production.
   */
  punchMockCase?: HrFixtureCase;
}

export interface PunchClock {
  view: PunchClockView;
  state: ClockState | null;
  /** `Date.now()` when `state` arrived — the anchor the display-only ticker carries forward from. */
  stateReceivedAtMs: number;
  busy: boolean;
  confirmation: PunchConfirmation | null;
  /** Start a punch. Mints ONE intent and holds it for every retry of this intent. */
  punch: (kind: PunchKind) => void;
  /** 🚨 Reuses the same intent — same idempotency key, same instant. Never re-mints. */
  retry: () => void;
  /** Submit the clock-out attestation. Never refuses on a "no" answer (§3.2). */
  submitAttestation: (response: AttestationResponse) => void;
  /** Back out of the attestation card without writing anything. */
  cancelAttestation: () => void;
  dismissConfirmation: () => void;
  reload: () => void;
}

function toPunchClockError(cause: unknown): PunchClockError {
  if (cause instanceof HrRpcError) {
    return { userMessage: cause.userMessage, code: cause.code, retryable: true };
  }
  return {
    userMessage:
      "We could not reach the time clock. Your punch was not recorded. Try again, and tell your manager if it keeps failing.",
    code: "hr_transport_failed",
    retryable: true,
  };
}

function browserIsOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export function usePunchClock(input: UsePunchClockInput): PunchClock {
  const { employmentId, source, deviceOrSession, mockCase, punchMockCase } = input;

  const [state, setState] = useState<ClockState | null>(null);
  const [stateReceivedAtMs, setStateReceivedAtMs] = useState(0);
  const [view, setView] = useState<PunchClockView>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<PunchConfirmation | null>(null);
  const [pendingIntent, setPendingIntent] = useState<PunchIntent | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  // ── The single read the surface mounts on ────────────────────────────────────────────────────
  useEffect(() => {
    if (!employmentId) {
      // 🚨 Never leave the widget spinning at nobody. Route 34 mounts with no subject until the
      // operator has searched, and a permanent `loading` there is indistinguishable from a hung
      // request. `no-subject` is the honest arm of the union and it says what to do next.
      setView({ kind: "no-subject" });
      setState(null);
      return;
    }

    let live = true;
    const startTimer = window.setTimeout(() => {
      setView({ kind: "loading" });
      getClockState(employmentId, { mockCase })
        .then((next) => {
          if (!live) return;
          setState(next);
          setStateReceivedAtMs(Date.now());
          setView(next.blocked ? { kind: "blocked", blocked: next.blocked } : { kind: "ready", state: next });
        })
        .catch((cause: unknown) => {
          if (!live) return;
          setView({ kind: "error", error: toPunchClockError(cause), intent: null, state: null });
        });
    }, 0);

    return () => {
      live = false;
      window.clearTimeout(startTimer);
    };
  }, [employmentId, mockCase, reloadToken]);

  // ── Offline is a transport fact this browser knows and the server cannot ─────────────────────
  useEffect(() => {
    const onOffline = () =>
      setView((current) =>
        current.kind === "ready" || current.kind === "loading"
          ? { kind: "offline", intent: null, state }
          : current,
      );
    const onOnline = () => setReloadToken((n) => n + 1);

    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [state]);

  /**
   * Write one intent. 🚨 Takes the intent whole — there is deliberately no `(kind, key)` overload,
   * because that shape is what invites a caller to mint a second key for a retry.
   */
  async function send(intent: PunchIntent, currentState: ClockState) {
    if (browserIsOffline()) {
      // §2.1 / L3-71: the write is blocked with an explicit message and NEVER silently queued.
      // Extended offline queueing is deferred (AD-10) — that is a stated product limit, not a bug.
      setPendingIntent(intent);
      setView({ kind: "offline", intent, state: currentState });
      return;
    }

    setBusy(true);
    setPendingIntent(intent);
    try {
      const result = await recordPunch(
        {
          employmentId: intent.employmentId,
          kind: intent.kind,
          occurredAt: intent.occurredAt,
          source,
          idempotencyKey: intent.idempotencyKey,
          geo: intent.geo,
          attestation: intent.attestation as Record<string, unknown> | null,
        },
        { mockCase: punchMockCase ?? mockCase },
      );

      setState(result.clockState);
      setStateReceivedAtMs(Date.now());
      setPendingIntent(null);
      // 🚨 A replay is a SUCCESS PATH. `result.replayed === true` renders the SAME confirmation,
      // never an error (§1.1, §3.4) — the confirmation component says so in one extra line.
      setConfirmation({
        result,
        intent,
        capturedNotices: intent.capturedNotices,
        captureUnavailable: null,
      });
      setView(
        result.clockState.blocked
          ? { kind: "blocked", blocked: result.clockState.blocked }
          : { kind: "ready", state: result.clockState },
      );
    } catch (cause: unknown) {
      if (browserIsOffline()) {
        setView({ kind: "offline", intent, state: currentState });
      } else {
        setView({ kind: "error", error: toPunchClockError(cause), intent, state: currentState });
      }
    } finally {
      setBusy(false);
    }
  }

  async function beginPunch(kind: PunchKind, currentState: ClockState) {
    // ONE mint per user intent. Every path below carries this object; none re-mints.
    let intent = mintPunchIntent({
      kind,
      employmentId: currentState.employmentId,
      deviceOrSession,
      tz: currentState.tz,
    });

    setBusy(true);
    const capture = await captureGeoIfRequested(currentState.capture);
    setBusy(false);
    intent = attachGeo(intent, capture.geo, capture.notice);

    // The clock-out attestation is collected BEFORE the punch is written, and the card shows the
    // total it is asking about. The punch itself is written when the card is submitted — and it is
    // ALWAYS written, whatever the answers are (§3.2).
    if (kind === "clock_out" && currentState.attestation.requiredAtClockOut) {
      setPendingIntent(intent);
      setView({ kind: "attesting", intent, state: currentState });
      return;
    }

    await send(intent, currentState);
  }

  return {
    view,
    state,
    stateReceivedAtMs,
    busy,
    confirmation,

    punch: (kind: PunchKind) => {
      if (!state || busy) return;
      setConfirmation(null);
      void beginPunch(kind, state);
    },

    retry: () => {
      if (!pendingIntent || !state || busy) return;
      // 🚨 SAME key, SAME instant, one attempt later. This is the whole of L3-45's second half.
      void send(retryPunchIntent(pendingIntent), state);
    },

    submitAttestation: (response: AttestationResponse) => {
      if (!pendingIntent || !state || busy) return;
      // A "no" answer is never a blocked clock-out: the punch is written and the disagreement
      // becomes an exception (§3.2). There is no branch here that declines to send.
      void send(attachAttestation(pendingIntent, response), state);
    },

    cancelAttestation: () => {
      if (!state) return;
      setPendingIntent(null);
      setView({ kind: "ready", state });
    },

    dismissConfirmation: () => setConfirmation(null),

    reload: () => setReloadToken((n) => n + 1),
  };
}
