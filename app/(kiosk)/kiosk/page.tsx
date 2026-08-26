// Route 35 — `/kiosk`. Kiosk device landing: pair this tablet, or resume a paired one.
// SPEC-UI-IA §3.4 row 35, SPEC-TIME §3.3, L3-66.

import { KioskPairingSurface } from "@/features/hr/time/kiosk/KioskPairingSurface";
import { mockCaseFromParam } from "@/features/hr/time/clock/mockCaseParam";

export default async function KioskPairingPage({
  searchParams,
}: {
  searchParams: Promise<{ case?: string }>;
}) {
  const params = await searchParams;

  // `KioskPairingSurface` renders its own `KioskFrame` — wrapping it again would double the chrome
  // and break the `flex flex-col` scroll chain the frame depends on.
  return <KioskPairingSurface mockCase={mockCaseFromParam(params.case)} />;
}
