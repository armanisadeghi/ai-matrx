// features/hr/settings/devices/HrDevicesSection.tsx
//
// Route 75a's body: L3's finished fleet panel, bound to the live doors, above the D13 override
// shape for the kiosk knobs.
//
// 🚨 THE PANEL IS L3's AND IS NOT REBUILT HERE. `KioskDevicesPanel` is described by its own
// header as "the whole of L3's half … deliberately shaped so L1's page is one line". Building a
// second fleet table in this lane would be exactly the second implementation that lane took care
// to prevent. This file supplies the two things a component cannot supply itself: the employer it
// is scoped to, and the transport.
//
// 🚨 WHY THE KNOBS STAY ON THE PAGE TOO. Route 75a is a settings route, and §2.4's uniform shape
// applies to every one of them: platform default · whether this org overrides · the control. The
// fleet table manages DEVICES; the knobs configure how a kiosk BEHAVES (PIN length, lockout,
// clock-skew tolerance, whether a photo is required). An administrator revoking a tablet and an
// administrator tightening the PIN are the same person on the same errand, and splitting them
// across two routes is how one of them gets missed.

"use client";

import { useMemo } from "react";

import { KioskDevicesPanel } from "@/features/hr/time/devices/KioskDevicesPanel";
import { useHrContext } from "@/features/hr/shared/useHrContext";
import { HrLoading, HrNoAccess } from "@/features/hr/shared/HrStates";
import { HrLanePanel } from "@/features/hr/settings/components/HrLanePanel";

import { liveKioskDeviceAdminSource } from "./liveKioskDeviceAdminSource";

export function HrDevicesSection() {
  const { active, isLoading } = useHrContext();
  const organizationId = active?.organization_id ?? null;

  // One source per employer. Rebinding on every render would re-fire the panel's `useEffect`
  // load on every keystroke elsewhere on the page — the panel keys its effect on `source`.
  const source = useMemo(
    () => (organizationId ? liveKioskDeviceAdminSource(organizationId) : null),
    [organizationId],
  );

  if (isLoading) return <HrLoading variant="panel" rows={6} />;

  // No employer resolved: the shell above already renders the picker as the page, so this body
  // says nothing rather than inventing a second empty state for the same fact.
  if (!organizationId || !source) return <HrNoAccess />;

  return (
    <div className="space-y-8">
      <KioskDevicesPanel source={source} />
      <HrLanePanel
        section="devices"
        prefixes={["kiosk_", "pairing_code", "pin_"]}
        promise="How a paired clock behaves: PIN length and lockout, how far its clock may drift before punches are refused, whether it captures a photo or a location, and how long a pairing code stays valid."
      />
    </div>
  );
}
