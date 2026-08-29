import { redirect } from "next/navigation";

import { getServerAuth } from "@/utils/supabase/getServerAuth";

import ProductCaptureRouteClient from "../ProductCaptureRouteClient";

/**
 * /tools/product-capture/instant — the CLIENT-side process-mode test lane.
 *
 * The same full-screen capture surface as /tools/product-capture, plus a
 * Process button: the browser runs the intake-analysis agent through the
 * `product_capture.instant_analysis` mandate and streams the
 * `electronics_intake_analysis` record straight back into a bottom sheet.
 * A processed item goes `capturing → processed` directly (never `captured`),
 * so the server-side workflow lane can't double-process it. Both lanes stay
 * available while Arman A/B-tests which process mode wins.
 */
export const dynamic = "force-dynamic";

export default async function ProductCaptureInstantPage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string }>;
}) {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) redirect("/login?next=/tools/product-capture/instant");
  const { item } = await searchParams;
  return (
    <div className="flex h-full flex-col overflow-hidden bg-background pt-[var(--shell-header-h)]">
      <div className="min-h-0 flex-1">
        <ProductCaptureRouteClient initialItemId={item ?? null} mode="instant" />
      </div>
    </div>
  );
}
