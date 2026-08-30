"use client";

/**
 * Client boundary for /commerce/intake/v3 — the vertical-rail chrome.
 *
 * ONE `ssr:false` dynamic boundary (code-splitting doctrine, same as
 * /commerce/intake and /v2): the camera runtime + chrome never enter a
 * server chunk; everything beneath is static.
 */

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

const loading = () => (
  <div className="flex h-full items-center justify-center">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

const IntakeCaptureScreenV3 = dynamic(
  () =>
    import("@/features/commerce-intake/components/IntakeCaptureScreenV3").then(
      (m) => m.IntakeCaptureScreenV3,
    ),
  { ssr: false, loading },
);

export default function IntakeV3RouteClient({
  initialAssetId,
  mode = "standard",
}: {
  initialAssetId: string | null;
  /** "instant" adds the client-run Process lane (/commerce/intake/v3/instant). */
  mode?: "standard" | "instant";
}) {
  return <IntakeCaptureScreenV3 initialAssetId={initialAssetId} mode={mode} />;
}
