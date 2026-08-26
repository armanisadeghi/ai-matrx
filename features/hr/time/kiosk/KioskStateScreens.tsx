/**
 * features/hr/time/kiosk/KioskStateScreens.tsx — the screens that are not a punch: the brick, the
 * wait for trust, the not-set-up tablet, and the refusals.
 *
 * Every one of them obeys the same three rules, which are the whole security posture of the kiosk:
 *
 *   1. **Plain language for a person who did not break anything.** The reader is an hourly employee
 *      standing at a wall tablet, not an administrator. Nothing here says "trust state", "session",
 *      "revoked device" or "401".
 *   2. **No door anywhere.** Not to HR, not to login, not to a support page. A tablet that can be
 *      navigated is a tablet that can be browsed.
 *   3. **Nothing is named that did not authenticate.** No employee, no manager, no PIN state.
 */

"use client";

import { Ban, Clock, Hourglass, WifiOff } from "lucide-react";

import { KioskFrame } from "./KioskFrame";
import { KIOSK_SKEW_REFUSAL } from "./kioskSkew";

/**
 * 🚨 **THE BRICK** (L3-69, SPEC-TIME §3.3). `suspended` or `revoked`: full-screen plain language,
 * **no PIN pad, no retry loop, no path anywhere else**. There is deliberately no control on this
 * screen at all — not even a Refresh — because a revoked tablet that retries is a revoked tablet
 * arguing with a decision somebody made on purpose.
 */
export function KioskBrickScreen({ trustState }: { trustState: "suspended" | "revoked" }) {
  return (
    <KioskFrame tone="stop">
      <div className="flex flex-col items-center gap-6 text-center">
        <Ban className="size-20 text-muted-foreground" />
        <h1 className="text-4xl font-semibold text-foreground">
          This tablet is no longer in use for the time clock.
        </h1>
        <p className="max-w-xl text-2xl text-muted-foreground">
          {trustState === "revoked"
            ? "Your punches cannot be recorded here. Please tell your manager and use another time clock."
            : "It has been paused. Your punches cannot be recorded here. Please tell your manager."}
        </p>
      </div>
    </KioskFrame>
  );
}

/**
 * Paired, not yet trusted (§3.3). **No punching until an administrator trusts this device** — so
 * there is no PIN pad on this screen either. The device id is shown because the administrator
 * doing the trusting needs to match it; the secret never is (see `deviceIdentity.ts`).
 */
export function KioskAwaitingTrustScreen({
  deviceId,
  organizationName,
  locationName,
}: {
  deviceId: string;
  organizationName: string;
  locationName: string | null;
}) {
  return (
    <KioskFrame organizationName={organizationName} locationName={locationName}>
      <div className="flex flex-col items-center gap-6 text-center">
        <Hourglass className="size-20 text-muted-foreground" />
        <h1 className="text-4xl font-semibold text-foreground">
          Waiting for an administrator to approve this tablet.
        </h1>
        <p className="max-w-xl text-2xl text-muted-foreground">
          This tablet is paired but cannot record punches yet. It will start working on its own once
          an administrator approves it.
        </p>
        <div className="rounded-xl border border-border bg-card px-6 py-4">
          <p className="text-base text-muted-foreground">Give the administrator this device code</p>
          <p className="select-all text-2xl font-semibold tabular-nums text-foreground">
            {deviceId}
          </p>
        </div>
      </div>
    </KioskFrame>
  );
}

/**
 * No identity on this tablet for the device id in the URL. The one screen in the kiosk that names
 * an address, and it is the kiosk's own — `/kiosk` is where a tablet is set up, and telling somebody
 * to type it is not a door out of the kiosk.
 */
export function KioskUnpairedScreen() {
  return (
    <KioskFrame tone="stop">
      <div className="flex flex-col items-center gap-6 text-center">
        <Clock className="size-20 text-muted-foreground" />
        <h1 className="text-4xl font-semibold text-foreground">This tablet is not set up yet.</h1>
        <p className="max-w-xl text-2xl text-muted-foreground">
          Ask an administrator to set it up. They will need to open this tablet&apos;s browser to
          <span className="whitespace-nowrap font-medium text-foreground"> /kiosk</span> and enter a
          pairing code.
        </p>
      </div>
    </KioskFrame>
  );
}

/**
 * The server refused the device outright, or the tablet cannot reach it. The message is the
 * server's, **verbatim** — it is written to leak nothing, and replacing it with a friendlier
 * sentence would be replacing a considered disclosure decision with a guess.
 */
export function KioskDeviceRefusedScreen({ message }: { message: string }) {
  return (
    <KioskFrame tone="stop">
      <div className="flex flex-col items-center gap-6 text-center">
        <WifiOff className="size-20 text-muted-foreground" />
        <h1 className="text-4xl font-semibold text-foreground">{message}</h1>
      </div>
    </KioskFrame>
  );
}

/**
 * 🚨 **OFFLINE, VERBATIM FROM §3.3** (L3-71): *"This tablet is offline. Your punch was not recorded.
 * Tell your manager."* A stated product limit under AD-10 — extended offline queueing is deferred,
 * and pretending otherwise with a spinner would let a worker walk away believing they punched.
 */
export function KioskOfflineCard() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card p-10 text-center">
      <WifiOff className="size-16 text-muted-foreground" />
      <p className="text-3xl font-semibold text-foreground">
        This tablet is offline. Your punch was not recorded.
      </p>
      <p className="text-2xl text-muted-foreground">Tell your manager.</p>
    </div>
  );
}

/**
 * 🚨 Skew beyond `maxClockSkewSeconds`: the punch was **refused before it was sent** (§3.3). The
 * screen blames the tablet, not the person, and says plainly that nothing was recorded.
 */
export function KioskClockWrongCard() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-destructive/40 bg-card p-10 text-center">
      <Clock className="size-16 text-destructive" />
      <p className="text-3xl font-semibold text-foreground">{KIOSK_SKEW_REFUSAL}</p>
    </div>
  );
}

/**
 * A refusal from `hr_kiosk_punch` — a wrong PIN, a lockout, an illegal transition. 🚨 The message is
 * the server's and **never reveals whether a PIN exists** (§3.3); this component adds no detail of
 * its own, and in particular never says "wrong PIN", never counts attempts on screen, and never
 * names anybody.
 */
export function KioskRefusedCard({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card p-10 text-center">
      <p className="text-3xl font-semibold text-foreground">{message}</p>
    </div>
  );
}
