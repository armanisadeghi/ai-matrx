// app/(core)/acquisition/page.tsx
//
// /acquisition — THE ACQUISITION CONSOLE. One screen per expert: every source we
// have, every account they are connected through, and everything that is stuck
// with the one action that unsticks it.
//
// It is the INDEX of the /acquisition family, so the Block Ledger at
// /acquisition/blocks becomes its drill-down rather than a sibling nobody finds.
//
// Guests are sent to sign in: every register this reads is scoped to a workspace,
// and there is nothing honest to show somebody who is not in one.

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { AcquisitionConsolePage } from "@/features/acquisition-console/AcquisitionConsolePage";

export default async function AcquisitionConsoleRoute() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) redirect("/login?next=/acquisition");
  return (
    // `useSearchParams` (the Rulebook filter) needs a boundary to stream past.
    <Suspense fallback={null}>
      <AcquisitionConsolePage />
    </Suspense>
  );
}
