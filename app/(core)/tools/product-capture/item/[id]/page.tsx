import { redirect } from "next/navigation";

import { getServerAuth } from "@/utils/supabase/getServerAuth";

import ItemDetailRouteClient from "./ItemDetailRouteClient";

/**
 * /tools/product-capture/item/[id] — VIEW mode for one capture item: manage
 * its images (delete / add), edit its SKU and notes, or jump back into
 * CAPTURE mode on it (`/tools/product-capture?item=<id>`).
 */
export const dynamic = "force-dynamic";

export default async function ProductCaptureItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) redirect("/login?next=/tools/product-capture/all");
  const { id } = await params;
  return <ItemDetailRouteClient itemId={id} />;
}
