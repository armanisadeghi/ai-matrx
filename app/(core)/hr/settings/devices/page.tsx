import { Suspense } from "react";

import { HrLoading } from "@/features/hr/shared/HrStates";
import { HrDevicesSection } from "@/features/hr/settings/devices/HrDevicesSection";

/**
 * Route 75a `/hr/settings/devices` (SPEC-UI-IA §3.11).
 *
 * Kiosk device management: pair a device, name it, set its location and trust state, and revoke
 * it. R-L3 U-08 found that no route owned this — SPEC-TIME §3.3 says pairing codes are generated
 * and devices trusted or revoked "in `/hr/settings`", and §3.11's routes 67–81 contained no device
 * route. **A tablet that pairs and can never be trusted is a tablet that never punches.**
 *
 * This is also the deep link `hr.time.kiosk_device_untrusted` points at
 * (`/hr/settings/devices?device=…`), so without the route that notice lands on a 404 — a notice
 * telling somebody a clock is untrusted and then giving them nowhere to go.
 *
 * No `PageHeader`: the section layout injects the header and owns the HR-admin gate. The body is
 * the section component, which binds L3's finished panel to the live doors — the page itself
 * stays one line, exactly as that panel was shaped to allow.
 */
export const metadata = { title: "Devices" };

export default function Page() {
  return (
    <Suspense fallback={<HrLoading variant="panel" rows={6} />}>
      <HrDevicesSection />
    </Suspense>
  );
}
