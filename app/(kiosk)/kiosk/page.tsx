// Route 35 — `/kiosk`. The kiosk device landing (SPEC-UI-IA §3.4 row 35, SPEC-TIME §3.3, L3-66).
//
// Pair this tablet to an employer with a one-time code, or resume a tablet that is already paired.
// Everything after pairing belongs to route 36; this page hands off and stops.
//
// 🚨 No `PageHeader` here, and there never can be: `(kiosk)` has no app shell for a header to
// portal into. No nav, no doors, no AI — see `app/(kiosk)/layout.tsx`.

import { KioskPairingSurface } from "@/features/hr/time/kiosk/KioskPairingSurface";
import { mockCaseFromParam } from "@/features/hr/time/clock/mockCaseParam";

export default async function KioskPairingPage({
  searchParams,
}: {
  searchParams: Promise<{ case?: string }>;
}) {
  const params = await searchParams;
  return <KioskPairingSurface mockCase={mockCaseFromParam(params.case)} />;
}
