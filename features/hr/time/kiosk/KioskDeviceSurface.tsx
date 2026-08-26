/**
 * features/hr/time/kiosk/KioskDeviceSurface.tsx — route 36's body: which screen this tablet is on.
 *
 * The session decides everything here. `useKioskSession` authenticates once from the identity the
 * tablet holds and then heartbeats; this component is a switch over its view and holds no state of
 * its own.
 *
 * 🚨 **`bricked` IS TERMINAL AND IS CHECKED FIRST.** It is the first branch below, before the URL is
 * validated and before anything else can render, so there is no ordering in which a revoked tablet
 * briefly shows a PIN pad.
 */

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import type { HrFixtureCase } from "@/features/hr/mock/transport";

import { KioskFrame } from "./KioskFrame";
import { KioskPunchSurface } from "./KioskPunchSurface";
import {
  KioskAwaitingTrustScreen,
  KioskBrickScreen,
  KioskUnavailableScreen,
} from "./KioskScreens";
import { useKioskSession } from "./useKioskSession";

export function KioskDeviceSurface({
  deviceId,
  mockCase,
}: {
  deviceId: string;
  mockCase?: HrFixtureCase;
}) {
  const router = useRouter();
  const { view, identity, skew } = useKioskSession(mockCase);

  // A tablet with no identity has nothing to authenticate. Back to pairing — not an error screen,
  // because "this tablet has not been set up yet" is a setup step, not a failure.
  useEffect(() => {
    if (view.kind === "unpaired") router.replace("/kiosk");
  }, [view.kind, router]);

  // 🚨 First. A revoked device never renders anything else, in any ordering.
  if (view.kind === "bricked") {
    return (
      <KioskFrame tone="stop">
        <KioskBrickScreen />
      </KioskFrame>
    );
  }

  if (view.kind === "unavailable") {
    return (
      <KioskFrame tone="stop">
        <KioskUnavailableScreen message={view.message} />
      </KioskFrame>
    );
  }

  if (view.kind === "awaiting-trust") {
    return (
      <KioskFrame
        organizationName={identity?.organizationDisplayName}
        locationName={identity?.locationName}
      >
        <KioskAwaitingTrustScreen deviceId={identity?.deviceId ?? null} />
      </KioskFrame>
    );
  }

  if (view.kind === "ready") {
    /*
      The URL names a different device than the one this tablet holds. That is a bookmark, a typo, or
      somebody trying a device id they were told about — never a reason to punch. It resolves to the
      tablet's OWN device, because the identity on the device is the authority and the URL is not.
    */
    if (identity && identity.deviceId !== deviceId) {
      return (
        <KioskFrame tone="stop">
          <KioskUnavailableScreen message="This tablet is set up for a different time clock." />
        </KioskFrame>
      );
    }

    return (
      <KioskFrame
        organizationName={identity?.organizationDisplayName}
        locationName={view.session.config.locationName ?? identity?.locationName}
      >
        <KioskPunchSurface
          session={view.session}
          deviceId={deviceId}
          skew={skew}
          mockCase={mockCase}
        />
      </KioskFrame>
    );
  }

  return (
    <KioskFrame>
      <div className="flex justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    </KioskFrame>
  );
}
