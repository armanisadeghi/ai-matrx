"use client";

/**
 * Client boundary for /tools/product-capture.
 *
 * The surface is camera-driven and browser-only, so it is code-split with
 * `ssr: false` — the camera runtime never enters a server chunk (the
 * code-splitting doctrine; same pattern as /tools/scanner).
 */

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

const loading = () => (
  <div className="flex h-full items-center justify-center">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

const CaptureScreen = dynamic(
  () =>
    import("@/features/product-capture/components/CaptureScreen").then(
      (m) => m.CaptureScreen,
    ),
  { ssr: false, loading },
);

export default function ProductCaptureRouteClient({
  initialItemId,
}: {
  initialItemId: string | null;
}) {
  return <CaptureScreen initialItemId={initialItemId} />;
}
