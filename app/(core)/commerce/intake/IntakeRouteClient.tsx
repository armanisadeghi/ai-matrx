"use client";

/**
 * Client boundary for /commerce/intake.
 *
 * The surface is camera-driven and browser-only, so it is code-split with
 * `ssr: false` — the camera runtime never enters a server chunk (the
 * code-splitting doctrine; same pattern as /tools/product-capture and
 * /tools/scanner). ONE dynamic boundary; everything beneath is static.
 */

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

const loading = () => (
  <div className="flex h-full items-center justify-center">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

const IntakeCaptureScreen = dynamic(
  () =>
    import("@/features/commerce-intake/components/IntakeCaptureScreen").then(
      (m) => m.IntakeCaptureScreen,
    ),
  { ssr: false, loading },
);

export default function IntakeRouteClient({
  initialAssetId,
}: {
  initialAssetId: string | null;
}) {
  return <IntakeCaptureScreen initialAssetId={initialAssetId} />;
}
