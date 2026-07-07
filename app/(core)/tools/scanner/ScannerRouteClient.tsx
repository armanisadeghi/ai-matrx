"use client";

/**
 * Client boundary for /tools/scanner.
 *
 * The scanner is camera-driven and browser-only, so both skins are
 * code-split with `ssr: false` — they never enter a server chunk (see the
 * code-splitting doctrine in CLAUDE.md). Mobile gets the phone-shaped
 * capture-first surface; desktop gets the sidebar + workspace shell from
 * the Photo-to-PDF Desktop design. Same engine underneath
 * (useScanSession + useScanSaveFlow).
 */

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

import { useIsMobile } from "@/hooks/use-mobile";

const loading = () => (
  <div className="flex h-full items-center justify-center">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

const ScannerSurface = dynamic(
  () => import("@/features/pdf/scanner/components/ScannerSurface"),
  { ssr: false, loading },
);

const ScannerDesktop = dynamic(
  () => import("@/features/pdf/scanner/components/desktop/ScannerDesktop"),
  { ssr: false, loading },
);

export default function ScannerRouteClient() {
  const isMobile = useIsMobile();
  return isMobile ? <ScannerSurface /> : <ScannerDesktop />;
}
