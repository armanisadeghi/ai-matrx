/**
 * features/hr/time/kiosk/useKioskSession.ts — the wall tablet's device session, and the heartbeat
 * that can take it away.
 *
 * 🚨 **REVOCATION IS IMMEDIATE, AND IT BRICKS** (L3-69, §3.3). `suspended` or `revoked` — from the
 * authenticate call or from any heartbeat — puts the route into `bricked` and it **never leaves**.
 * No PIN pad, no retry loop, no countdown, no "try again later", and no path to any other HR
 * surface. An administrator revoking a stolen tablet needs it to stop being a time clock at most
 * `heartbeatSeconds` later, and a retry loop that keeps re-authenticating is a device that argues
 * with its own revocation.
 *
 * 🚨 **THE HEARTBEAT INTERVAL IS A KNOB** (`kiosk_heartbeat_seconds`), read from the session's own
 * config. There is no number in this file. Same for the skew tolerance and the confirmation
 * dismiss — a wall tablet in a warehouse and one in an office are configured differently, and a
 * constant here would make that impossible without a deploy.
 *
 * WHY `trustState` IS CHECKED AND `sessionToken` IS NOT ASSUMED
 * -------------------------------------------------------------
 * `hr_kiosk_authenticate` answers a `pending` or `revoked` device with **no session token** — the
 * trust state is the answer, and the token is absent. So this hook keys on `trustState` and treats
 * a missing token as "no session", rather than trusting the declared type and crashing on a null.
 */

"use client";

import { useEffect, useState } from "react";

import type { HrFixtureCase } from "@/features/hr/mock/transport";
import {
  authenticateKioskDevice,
  heartbeatKioskSession,
} from "@/features/hr/time/api/service";
import type { KioskDeviceSession, KioskTrustState } from "@/features/hr/time/api/types";

import { measureKioskSkew, type KioskClockSkew } from "./kioskSkew";
import { readKioskDevice, type KioskDeviceIdentity } from "./kioskDeviceStore";

export type KioskSessionView =
  /** Nothing has been asked yet. */
  | { kind: "loading" }
  /** No device identity on this tablet — route 36 sends the operator back to pairing. */
  | { kind: "unpaired" }
  /** Paired, not yet trusted. No punching until an administrator trusts it (§3.3). */
  | { kind: "awaiting-trust" }
  /** 🚨 Terminal. Suspended or revoked. */
  | { kind: "bricked"; trustState: KioskTrustState }
  /** The secret did not work, or the org turned the kiosk off. Leaks nothing. */
  | { kind: "unavailable"; message: string }
  | { kind: "ready"; session: KioskDeviceSession; skew: KioskClockSkew };

export interface KioskSessionState {
  view: KioskSessionView;
  identity: KioskDeviceIdentity | null;
  /** Re-measured on every heartbeat, so a tablet whose clock drifts mid-shift is caught mid-shift. */
  skew: KioskClockSkew | null;
}

function isBricking(trustState: KioskTrustState | string): boolean {
  return trustState === "suspended" || trustState === "revoked";
}

export function useKioskSession(mockCase?: HrFixtureCase): KioskSessionState {
  const [identity, setIdentity] = useState<KioskDeviceIdentity | null>(null);
  const [session, setSession] = useState<KioskDeviceSession | null>(null);
  const [skew, setSkew] = useState<KioskClockSkew | null>(null);
  const [view, setView] = useState<KioskSessionView>({ kind: "loading" });

  // ── Authenticate once, from the identity this tablet already holds ───────────────────────────
  useEffect(() => {
    const stored = readKioskDevice();
    setIdentity(stored);

    if (!stored) {
      setView({ kind: "unpaired" });
      return;
    }

    let live = true;
    authenticateKioskDevice(stored.deviceId, stored.deviceSecret, { mockCase })
      .then((next) => {
        if (!live) return;

        if (isBricking(next.trustState)) {
          setView({ kind: "bricked", trustState: next.trustState });
          return;
        }
        if (next.trustState !== "trusted" || !next.sessionToken) {
          setView({ kind: "awaiting-trust" });
          return;
        }

        const measured = measureKioskSkew(
          next.serverTime,
          Date.now(),
          next.config.maxClockSkewSeconds,
        );
        setSession(next);
        setSkew(measured);
        setView({ kind: "ready", session: next, skew: measured });
      })
      .catch((cause: unknown) => {
        if (!live) return;
        // The server's sentence where it gave one. It is written to leak nothing: not whether the
        // device exists, not whether the secret was close.
        const message =
          cause instanceof Error && cause.message
            ? "This tablet is not set up. Ask an administrator to pair it again."
            : "This tablet is not set up. Ask an administrator to pair it again.";
        setView({ kind: "unavailable", message });
      });

    return () => {
      live = false;
    };
  }, [mockCase]);

  // ── The heartbeat: how a wall tablet learns it was revoked without waiting for a punch ────────
  useEffect(() => {
    if (!session?.sessionToken) return;
    // 🚨 The knob, from the session's own config. Never a constant.
    const intervalMs = Math.max(1, session.config.heartbeatSeconds) * 1000;

    let live = true;
    const id = window.setInterval(() => {
      void heartbeatKioskSession(session.sessionToken, { mockCase })
        .then((beat) => {
          if (!live) return;
          if (isBricking(beat.trustState)) {
            // Terminal, and it takes effect on this tick. No grace, no countdown.
            setView({ kind: "bricked", trustState: beat.trustState as KioskTrustState });
            window.clearInterval(id);
            return;
          }
          // Re-sync skew every beat (§3.3) — a tablet that drifts after boot is still caught.
          const measured = measureKioskSkew(
            beat.serverTime,
            Date.now(),
            session.config.maxClockSkewSeconds,
          );
          setSkew(measured);
          setView({ kind: "ready", session, skew: measured });
        })
        .catch(() => {
          /*
            A failed heartbeat is NOT a revocation and must never be treated as one — a break-room
            tablet on flaky wifi would brick itself daily. Trust state only changes on an answer
            that actually says so. The punch path has its own offline handling, which is where a
            connectivity problem becomes visible to the person standing there.
          */
        });
    }, intervalMs);

    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [session, mockCase]);

  return { view, identity, skew };
}
