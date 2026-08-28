import { redirect } from "next/navigation";

import { getServerAuth } from "@/utils/supabase/getServerAuth";

import ProductCaptureRouteClient from "./ProductCaptureRouteClient";

/**
 * /tools/product-capture — warehouse-style rapid capture of product photos,
 * video, voice notes and text ahead of eBay-listing categorization.
 *
 * Lands DIRECTLY in the full-screen capture surface (a warehouse worker's
 * whole visit is shooting): rapid Mode 1 (shutter → Next item) and QR
 * auto-switch Mode 2, with photo/video toggle, SKU quick entry, autosaving
 * notes and transcribed voice notes. Feature: `features/product-capture/`.
 */
export const dynamic = "force-dynamic";

export default async function ProductCapturePage() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) redirect("/login?next=/tools/product-capture");
  return (
    <div className="flex h-full flex-col overflow-hidden bg-background pt-[var(--shell-header-h)]">
      <div className="min-h-0 flex-1">
        <ProductCaptureRouteClient />
      </div>
    </div>
  );
}
