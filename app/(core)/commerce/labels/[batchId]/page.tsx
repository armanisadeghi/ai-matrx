// app/(core)/commerce/labels/[batchId]/page.tsx
//
// One label batch (print run): print / preview / PDF / calibration through
// the @ai-matrx/print seam, reprint ranges, void codes, per-code doors.

import { redirect } from "next/navigation";

import { currentRequestLoginHref } from "@/utils/auth/server-login-href";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

import { LabelBatchRouteClient } from "./LabelBatchRouteClient";

export const dynamic = "force-dynamic";

export default async function LabelBatchPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { batchId } = await params;
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated)
    redirect(await currentRequestLoginHref(`/commerce/labels/${batchId}`));
  return <LabelBatchRouteClient batchId={batchId} />;
}
