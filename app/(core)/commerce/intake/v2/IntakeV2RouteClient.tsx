"use client";

/**
 * Client boundary for /commerce/intake/v2 — the iPhone-style rebuild.
 *
 * ONE `ssr:false` dynamic boundary (code-splitting doctrine, same as
 * /commerce/intake): the camera runtime + the capture-camera chrome never
 * enter a server chunk; everything beneath is static.
 */

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

const loading = () => (
  <div className="flex h-full items-center justify-center">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

const IntakeCaptureScreenV2 = dynamic(
  () =>
    import("@/features/commerce-intake/components/IntakeCaptureScreenV2").then(
      (m) => m.IntakeCaptureScreenV2,
    ),
  { ssr: false, loading },
);

export default function IntakeV2RouteClient({
  initialAssetId,
  mode = "standard",
}: {
  initialAssetId: string | null;
  /** "instant" adds the client-run Process lane (/commerce/intake/v2/instant). */
  mode?: "standard" | "instant";
}) {
  return <IntakeCaptureScreenV2 initialAssetId={initialAssetId} mode={mode} />;
}
