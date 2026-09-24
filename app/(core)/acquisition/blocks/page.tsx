// app/(core)/acquisition/blocks/page.tsx
//
// /acquisition/blocks — THE BLOCK LEDGER. Every failed acquisition anywhere on the
// platform, as one org-scoped row. Written by aidream/services/block_ledger.
//
// Guests are sent to sign in: a block belongs to an organization, and there is
// nothing honest to show somebody who is not in one.

import { redirect } from "next/navigation";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { BlockLedgerPage } from "@/features/block-ledger/BlockLedgerPage";

export default async function AcquisitionBlocksRoute() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) redirect("/login?next=/acquisition/blocks");
  return <BlockLedgerPage />;
}
