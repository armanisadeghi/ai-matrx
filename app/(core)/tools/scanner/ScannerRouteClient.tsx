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

import { useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

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

// The skin is chosen ONCE per page load, never on resize/rotate: each skin
// owns live session + save-flow state, so a reactive width swap would
// unmount a mid-upload or mid-save surface (in-flight uploads have no
// manifest entry yet — swapping loses them). Device-shaped heuristic so a
// landscape phone (844px wide) still gets the capture-first skin.
type ScannerSkin = "mobile" | "desktop";
let lockedSkin: ScannerSkin | null = null;
const subscribeNever = () => () => {};
const getSkin = (): ScannerSkin => {
  if (lockedSkin === null) {
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const width = window.innerWidth;
    lockedSkin = width < 768 || (coarse && width < 1024) ? "mobile" : "desktop";
  }
  return lockedSkin;
};
const getServerSkin = (): ScannerSkin | null => null;

export default function ScannerRouteClient() {
  const skin = useSyncExternalStore(subscribeNever, getSkin, getServerSkin);
  if (skin === null) return loading();
  return skin === "mobile" ? <ScannerSurface /> : <ScannerDesktop />;
}
