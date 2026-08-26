/**
 * features/hr/time/kiosk/useKioskDevice.ts — the kiosk session: authenticate, hold, heartbeat, brick.
 *
 * 🚨 **REVOCATION IS IMMEDIATE AND IT BRICKS THE ROUTE** (L3-69, SPEC-TIME §3.3). `suspended` or
 * `revoked` — from the first authenticate or from any later heartbeat — moves this hook to
 * `bricked` and it **never leaves**. No PIN pad, no retry loop, no polling that might quietly let a
 * revoked tablet back in, and no path anywhere else. A wall tablet is revoked because something is
 * wrong with it or with the place it is standing; a device that argues with that decision every
 * sixty seconds is the security hole the decision was made to close.
 *
 * 🚨 **THE HEARTBEAT INTERVAL IS A KNOB** — `session.config.heartbeatSeconds`, from the server,
 * every time. There is no fallback constant in this file, because a fallback is how a
 * server-configured 15-second heartbeat silently becomes 60 on the one tablet that matters.
 *
 * 🚨 **NO DOORS OUT.** This hook exposes no navigation and no href. The kiosk's absence of exits is
 * a security property, not a dead end (`no-dead-ends` names it as the one deliberate exception), so
 * nothing here may grow a "back to HR" affordance.
 */

"use client";

import { useEffect, useState } from "react";

import type { HrFixtureCase } from "@/features/hr/mock/transport";
import { HrRpcError } from "@/features/hr/time/api/rpc";
import { authenticateKioskDevice, heartbeatKioskSession } from "@/features/hr/time/api/service";
import type { KioskDeviceSession, KioskTrustState } from "@/features/hr/time/api/types";

import { clearKioskIdentity, readKioskIdentity, type KioskDeviceIdentity } from "./deviceIdentity";
import { measureKioskSkew, type KioskClockSkew } from "./kioskSkew";

/**
 * A session the tablet may actually punch with. Narrower than {@link KioskDeviceSession} on purpose:
 * `trustState` is `trusted` and `sessionToken` is a non-empty string, both **proven** rather than
 * assumed, so no component downstream has to re-check either.
 *
 * (`KioskDeviceSession.sessionToken` is typed `string`, but the untrusted answers legitimately carry
 * no token — the server has nothing to hand a device it will not accept punches from. Narrowing
 * here is what keeps that from becoming a `"null"` string in an RPC argument. Reported as a contract
 * finding rather than patched into `api/types.ts`, which is not this lane's file.)
 */
export interface TrustedKioskSession {
  sessionToken: string;
  expiresAt: string;
  serverTime: string;
  configVersion: string;
  config: KioskDeviceSession["config"];
}

export type KioskDeviceView =
  | { kind: "loading" }
  /** No identity on this tablet, or it belongs to a different device id than the URL names. */
  | { kind: "unpaired" }
  /** Paired, not yet trusted. No punching until an administrator says so (§3.3). */
  | { kind: "awaiting-trust"; identity: KioskDeviceIdentity }
  /** 🚨 Terminal. `suspended` or `revoked`. Nothing leaves this state. */
  | { kind: "bricked"; trustState: Extract<KioskTrustState, "suspended" | "revoked"> }
  /** The server refused the device outright. Its sentence, verbatim. */
  | { kind: "refused"; message: string }
  | { kind: "ready"; session: TrustedKioskSession; identity: KioskDeviceIdentity };

export interface KioskDevice {
  view: KioskDeviceView;
  /** Held for the session, re-taken on every heartbeat. `null` before the first response. */
  skew: KioskClockSkew | null;
  /** True while the tablet cannot reach the server at all. Punching is blocked, never queued. */
  offline: boolean;
}

function isBrickingTrust(state: string): state is "suspended" | "revoked" {
  return state === "suspended" || state === "revoked";
}

export function useKioskDevice(deviceId: string, mockCase?: HrFixtureCase): KioskDevice {
  const [view, setView] = useState<KioskDeviceView>({ kind: "loading" });
  const [skew, setSkew] = useState<KioskClockSkew | null>(null);
  const [offline, setOffline] = useState(false);
  /**
   * Seconds between the re-checks a *pending* device makes while it waits to be trusted. The
   * server's own `heartbeatSeconds`, learned from the first authenticate response — which carries
   * the config even when it declines to issue a token. Null until then, and the poll simply does
   * not run: 🚨 there is no fallback constant, because a fallback is how a configured interval
   * silently becomes something else on the one tablet nobody is watching.
   */
  const [trustPollSeconds, setTrustPollSeconds] = useState<number | null>(null);
  const [trustPollToken, setTrustPollToken] = useState(0);

  // ── Authenticate on mount, and again on each trust re-check while pending ───────────────────
  useEffect(() => {
    const identity = readKioskIdentity();
    if (!identity || identity.deviceId !== deviceId) {
      setView({ kind: "unpaired" });
      return;
    }

    let live = true;
    void authenticateKioskDevice(identity.deviceId, identity.deviceSecret, { mockCase })
      .then((session) => {
        if (!live) return;
        setSkew(measureKioskSkew(session.serverTime, Date.now(), session.config.maxClockSkewSeconds));
        setTrustPollSeconds(session.config.heartbeatSeconds);

        if (isBrickingTrust(session.trustState)) {
          setView({ kind: "bricked", trustState: session.trustState });
          return;
        }
        // `pending`, or a trusted answer the server declined to issue a token for: either way this
        // tablet may not punch, and the honest screen is the one that says an administrator has to act.
        if (session.trustState !== "trusted" || !session.sessionToken) {
          setView({ kind: "awaiting-trust", identity });
          return;
        }
        setView({
          kind: "ready",
          identity,
          session: {
            sessionToken: session.sessionToken,
            expiresAt: session.expiresAt,
            serverTime: session.serverTime,
            configVersion: session.configVersion,
            config: session.config,
          },
        });
      })
      .catch((cause: unknown) => {
        if (!live) return;
        if (cause instanceof HrRpcError) {
          // The server does not recognise this secret. Holding onto it produces a tablet stuck in a
          // refusal loop forever, so the identity goes and the screen says to pair it again.
          clearKioskIdentity();
          setView({ kind: "refused", message: cause.userMessage });
          return;
        }
        setOffline(true);
        setView({
          kind: "refused",
          message:
            "This tablet cannot reach the time clock right now. Nothing can be recorded until it can.",
        });
      });

    return () => {
      live = false;
    };
  }, [deviceId, mockCase, trustPollToken]);

  // ── While pending: re-check on its own, so nobody has to come back and touch the tablet ─────
  //
  // §3.3's flowchart has the waiting screen resume the moment an administrator sets `trusted`. The
  // screen already promises it will start working by itself; this is that promise. 🚨 It runs ONLY
  // in `awaiting-trust` — a bricked device never re-checks anything.
  const awaitingTrust = view.kind === "awaiting-trust";
  useEffect(() => {
    if (!awaitingTrust || !trustPollSeconds) return;
    const id = window.setInterval(
      () => setTrustPollToken((n) => n + 1),
      trustPollSeconds * 1000,
    );
    return () => window.clearInterval(id);
  }, [awaitingTrust, trustPollSeconds]);

  // ── The heartbeat. Re-checks trust and re-syncs the clock, at the server's own interval. ─────
  const ready = view.kind === "ready" ? view : null;
  const sessionToken = ready?.session.sessionToken ?? null;
  const heartbeatSeconds = ready?.session.config.heartbeatSeconds ?? null;
  const maxSkewSeconds = ready?.session.config.maxClockSkewSeconds ?? null;

  useEffect(() => {
    if (!sessionToken || !heartbeatSeconds || maxSkewSeconds === null) return;

    let live = true;
    const id = window.setInterval(() => {
      void heartbeatKioskSession(sessionToken, { mockCase })
        .then((beat) => {
          if (!live) return;
          setOffline(false);
          setSkew(measureKioskSkew(beat.serverTime, Date.now(), maxSkewSeconds));
          // 🚨 The brick. Terminal, and deliberately set without checking the current view: there is
          // no state a revoked device is allowed to stay in.
          if (isBrickingTrust(beat.trustState)) {
            window.clearInterval(id);
            setView({ kind: "bricked", trustState: beat.trustState });
          }
        })
        .catch(() => {
          if (!live) return;
          // A missed heartbeat is a network fact, not a trust decision. The tablet keeps its
          // session and stops accepting punches until it can reach the server again — it never
          // guesses that it is still trusted, and it never guesses that it is not.
          setOffline(true);
        });
    }, heartbeatSeconds * 1000);

    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [sessionToken, heartbeatSeconds, maxSkewSeconds, mockCase]);

  // ── The browser's own offline signal, which arrives faster than a missed heartbeat ───────────
  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    setOffline(typeof navigator !== "undefined" && navigator.onLine === false);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  return { view, skew, offline };
}
