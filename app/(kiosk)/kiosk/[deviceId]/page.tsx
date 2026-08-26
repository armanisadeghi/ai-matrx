// Route 36 — `/kiosk/[deviceId]`. The kiosk punch surface (SPEC-UI-IA §3.4 row 36, SPEC-TIME §3.3).
//
// 🚨 The `deviceId` in this URL is an ADDRESS, never a credential. It is checked against the
// identity the tablet stored at pairing, and the only thing that authenticates anything is the
// device secret held in `localStorage` and exchanged for a session token. Typing another device's
// id into this URL reaches the "this tablet is not set up" screen and nothing else.
//
// No `PageHeader`, no nav, no doors — `(kiosk)` has no shell. See `app/(kiosk)/layout.tsx`.

import { KioskPunchSurface } from "@/features/hr/time/kiosk/KioskPunchSurface";
import { mockCaseFromParam } from "@/features/hr/time/clock/mockCaseParam";

export default async function KioskDevicePage({
  params,
  searchParams,
}: {
  params: Promise<{ deviceId: string }>;
  searchParams: Promise<{ case?: string }>;
}) {
  const [{ deviceId }, search] = await Promise.all([params, searchParams]);
  return <KioskPunchSurface deviceId={deviceId} mockCase={mockCaseFromParam(search.case)} />;
}
