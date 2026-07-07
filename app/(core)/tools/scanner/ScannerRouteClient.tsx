"use client";

/**
 * Client boundary for /tools/scanner.
 *
 * The scanner is camera-driven and browser-only, so the whole surface is
 * code-split with `ssr: false` — it never enters a server chunk (see the
 * code-splitting doctrine in CLAUDE.md).
 */

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

const ScannerSurface = dynamic(
  () => import("@/features/pdf/scanner/components/ScannerSurface"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);

export default function ScannerRouteClient() {
  return <ScannerSurface />;
}
