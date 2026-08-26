// Route 36 — `/kiosk/[deviceId]`. The kiosk punch surface.
// SPEC-UI-IA §3.4 row 36, SPEC-TIME §3.3, L3-67 … L3-71.
//
// 🚨 The `deviceId` in the URL is NOT the authorization. The device secret this tablet holds is
// (§1.2: "the token IS the authorization"), and `useKioskDevice` refuses when the stored identity
// names a different device than the URL does. A device id in a URL is a bookmark, not a credential.

import { KioskPunchSurface } from "@/features/hr/time/kiosk/KioskPunchSurface";
import { mockCaseFromParam } from "@/features/hr/time/clock/mockCaseParam";

export default async function KioskDevicePage({
  params,
  searchParams,
}: {
  params: Promise<{ deviceId: string }>;
  searchParams: Promise<{ case?: string }>;
}) {
  const [{ deviceId }, query] = await Promise.all([params, searchParams]);

  return <KioskPunchSurface deviceId={deviceId} mockCase={mockCaseFromParam(query.case)} />;
}
