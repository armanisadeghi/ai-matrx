/**
 * features/hr/time/kiosk/KioskPunchSurface.tsx — route 36 `/kiosk/[deviceId]` (L3-67 … L3-71).
 *
 * The whole kiosk, assembled: authenticate the device, hold the session, heartbeat, and take one
 * punch at a time. Every rule it obeys is stated where it is implemented — this file's job is to be
 * exhaustive over the two unions (`KioskDeviceView` × `KioskPunchView`) and to add nothing.
 *
 * 🚨 **The device states outrank the punch states, always.** A brick is rendered instead of
 * everything else, including a confirmation that had just appeared: a device revoked mid-punch is a
 * device that stops, not one that finishes politely.
 *
 * 🚨 **No app shell, no nav, no session, no AI, no doors out** (L3-65). The `(kiosk)` layout gives
 * this surface `<Providers>` and nothing else — no `getServerAuth`, no `AppShell`, no `PageHeader`
 * (there is no shell to portal a header into). `no-dead-ends` names the kiosk as its one deliberate
 * exception; the absence of exits here is the security property, not an oversight.
 */

"use client";

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { HrFixtureCase } from "@/features/hr/mock/transport";
import { geoCaptureBeforeNotice } from "@/features/hr/time/clock/geoCapture";
import { formatStampedTime } from "@/features/hr/time/clock/stampedTime";

import { KioskFrame } from "./KioskFrame";
import { KioskIdleScreen } from "./KioskIdleScreen";
import { KioskPinPad } from "./KioskPinPad";
import { KioskPinResetPad } from "./KioskPinResetPad";
import {
  KioskConfirmationCard,
  KioskDisputeInstructions,
  KioskDuplicateCard,
} from "./KioskResultCards";
import {
  KioskAwaitingTrustScreen,
  KioskBrickScreen,
  KioskClockWrongCard,
  KioskDeviceRefusedScreen,
  KioskOfflineCard,
  KioskRefusedCard,
  KioskUnpairedScreen,
} from "./KioskStateScreens";
import { useKioskDevice } from "./useKioskDevice";
import { kioskKeyTimeZone, useKioskPunch } from "./useKioskPunch";

export interface KioskPunchSurfaceProps {
  deviceId: string;
  /** Which fixture the DEVICE lane answers with — `hr_kiosk_authenticate` / `…_heartbeat`. */
  mockCase?: HrFixtureCase;
  /**
   * Which fixture the PUNCH lane answers with, steered separately.
   *
   * A single selector cannot reach the states that matter: `edge` on the device lane is the
   * **revoked** tablet, which bricks the route, and `edge` on the punch lane is the
   * **duplicate-suspected** card — so one parameter for both makes the duplicate card literally
   * unreachable, and an ugly state nobody can look at is an ugly state nobody has checked. Inert
   * unless `NEXT_PUBLIC_HR_MOCK=1`, like every other selector in this lane.
   */
  punchMockCase?: HrFixtureCase;
}

export function KioskPunchSurface({ deviceId, mockCase, punchMockCase }: KioskPunchSurfaceProps) {
  const device = useKioskDevice(deviceId, mockCase);

  // The device states are terminal for the surface — nothing below them renders.
  if (device.view.kind === "loading") {
    return (
      <KioskFrame>
        <div className="flex items-center justify-center">
          <Loader2 className="size-12 animate-spin text-muted-foreground" />
        </div>
      </KioskFrame>
    );
  }
  if (device.view.kind === "unpaired") return <KioskUnpairedScreen />;
  if (device.view.kind === "bricked") return <KioskBrickScreen trustState={device.view.trustState} />;
  if (device.view.kind === "refused") {
    return <KioskDeviceRefusedScreen message={device.view.message} />;
  }
  if (device.view.kind === "awaiting-trust") {
    return (
      <KioskAwaitingTrustScreen
        deviceId={device.view.identity.deviceId}
        organizationName={device.view.identity.organizationDisplayName}
        locationName={device.view.identity.locationName}
      />
    );
  }

  return (
    <KioskReadySurface
      deviceId={deviceId}
      device={device}
      view={device.view}
      mockCase={punchMockCase}
    />
  );
}

/**
 * Split out so the punch hook mounts only against a **proven** trusted session — a hook called
 * conditionally is a React error, and a session narrowed by an `if` two components up is a session
 * the type system stops helping with.
 */
function KioskReadySurface({
  deviceId,
  device,
  view,
  mockCase,
}: {
  deviceId: string;
  device: ReturnType<typeof useKioskDevice>;
  view: Extract<ReturnType<typeof useKioskDevice>["view"], { kind: "ready" }>;
  mockCase?: HrFixtureCase;
}) {
  const punch = useKioskPunch({
    deviceId,
    session: view.session,
    skew: device.skew,
    offline: device.offline,
    mockCase,
  });

  const { config } = view.session;
  // §4.9's before-the-punch notice, from the DEVICE's config rather than a clock state — the kiosk
  // has no subject to ask about, but capture posture is a property of the tablet, not the person.
  const captureNotice = geoCaptureBeforeNotice({
    geoRequested: config.requireGeo,
    photoRequested: config.requirePhoto,
    maxGeoAccuracyM: null,
  });

  const frame = (children: ReactNode) => (
    <KioskFrame
      organizationName={view.identity.organizationDisplayName}
      locationName={config.locationName ?? view.identity.locationName}
    >
      {children}
    </KioskFrame>
  );

  // 🚨 Offline outranks whatever the punch view holds: a tablet that cannot reach the server must
  // say so on the idle screen too, so nobody starts a punch that cannot land (L3-71).
  if (device.offline && (punch.view.kind === "idle" || punch.view.kind === "offline")) {
    return frame(<KioskOfflineCard />);
  }

  switch (punch.view.kind) {
    case "idle":
      return frame(
        <KioskIdleScreen
          skew={device.skew}
          busy={false}
          onChoose={punch.begin}
          captureNotice={captureNotice}
        />,
      );

    case "identify":
      return frame(
        <KioskPinPad
          punchKind={punch.view.punchKind}
          pinLength={config.pinLength}
          busy={false}
          onSubmit={punch.submit}
          onCancel={punch.dismiss}
        />,
      );

    /*
     * 🚨 The accepted PIN was set by somebody else and is temporary. The punch is deliberately NOT
     * written first: an administrator's PIN would have recorded a real punch, and the reset could
     * then be walked away from — leaving the temporary secret live on somebody who thinks they are
     * done. The reset comes first, and the punch continues with the PIN they choose.
     */
    case "must-reset":
      return frame(
        <KioskPinResetPad
          employeeName={punch.view.employeeName}
          pinLength={config.pinLength}
          busy={false}
          refusal={punch.view.refusal}
          onSubmit={punch.submitNewPin}
          onCancel={punch.dismiss}
        />,
      );

    // `hr_kiosk_session_open` in flight — the PIN-accept step. Same rule as `submitting`: visibly
    // unfinished, and nothing here claims a punch happened.
    case "opening":
      return frame(
        <div className="flex flex-col items-center gap-6">
          <Loader2 className="size-16 animate-spin text-muted-foreground" />
          <p className="text-2xl text-muted-foreground">Checking…</p>
        </div>,
      );

    /*
     * 🚨 Lockout (R3), owned by `hr_kiosk_session_open`. The wording never says whether the employee
     * number exists, never says which of the two was wrong, and never says whether a PIN is set —
     * a lockout screen that distinguishes those is an oracle for guessing who works here.
     */
    case "locked":
      return frame(
        <div className="flex flex-col items-center gap-6 text-center">
          <p className="text-4xl font-semibold text-foreground">Too many attempts.</p>
          <p className="max-w-lg text-2xl text-muted-foreground">
            {punch.view.lockedUntil
              ? `Try again after ${formatStampedTime(punch.view.lockedUntil, kioskKeyTimeZone(config.tz))}, or ask your manager.`
              : "Try again later, or ask your manager."}
          </p>
          <Button onClick={punch.dismiss} className="min-h-[72px] px-10 text-xl">
            Done
          </Button>
        </div>,
      );

    // 🚨 Visibly unfinished, and deliberately NOT a confirmation (L3-68). Nothing on this screen
    // says a punch happened, because at this instant nothing is known to have happened.
    case "submitting":
      return frame(
        <div className="flex flex-col items-center gap-6">
          <Loader2 className="size-16 animate-spin text-muted-foreground" />
          <p className="text-3xl text-foreground">Recording…</p>
          <p className="text-xl text-muted-foreground">Wait for the confirmation before you go.</p>
        </div>,
      );

    case "confirmed":
      return frame(<KioskConfirmationCard result={punch.view.result} />);

    case "duplicate":
      return frame(
        <KioskDuplicateCard
          result={punch.view.result}
          onAcknowledge={punch.dismiss}
          onDispute={() => punch.dispute()}
        />,
      );

    case "disputing":
      return frame(
        <KioskDisputeInstructions result={punch.view.result} onDone={punch.dismiss} />,
      );

    case "refused":
      return frame(<KioskRefusedCard message={punch.view.message} />);

    case "clock-wrong":
      return frame(<KioskClockWrongCard />);

    case "offline":
      return frame(<KioskOfflineCard />);
  }
}
