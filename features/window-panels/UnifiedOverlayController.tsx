"use client";

/**
 * UnifiedOverlayController — thin client shell.
 *
 * Statically importable from anywhere. The body
 * (`UnifiedOverlayControllerImpl.tsx`) imports the entire windowRegistry
 * (~860 LOC + 96 dynamic-import wrappers + tray-preview JSX) and is
 * `next/dynamic`-loaded so the registry's parse cost lives in a separate
 * shared chunk instead of in the static graph of every route entry.
 *
 * Adding a new window remains a 2-file change (registry entry + the
 * window component) — see `features/window-panels/registry/windowRegistry.ts`.
 */

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { OverlayErrorBoundary } from "@/features/window-panels/diagnostics/OverlayErrorBoundary";
import { markUnifiedControllerMounted } from "@/lib/redux/middleware/overlayDiagnostics";

const UnifiedOverlayControllerImpl = dynamic(
  () => import("./UnifiedOverlayControllerImpl"),
  { ssr: false, loading: () => null },
);

export default function UnifiedOverlayController() {
  // Outer-shell heartbeat: marks that the gate mounted us and the static
  // outer chunk parsed successfully. If this fires but the Impl heartbeat
  // does not, the next/dynamic chunk load is the failure (service worker,
  // CSP, offline, etc.) — the diagnostic timeout report calls it out.
  useEffect(() => {
    markUnifiedControllerMounted();
  }, []);

  return (
    // The error boundary catches dynamic-import rejections from the
    // next/dynamic wrapper above. Before this, a failed Impl chunk load
    // disappeared into the `loading: () => null` placeholder and only the
    // middleware's 1.5s timeout would surface the failure (with no error
    // captured). Now the error reaches the console with overlay context.
    <OverlayErrorBoundary
      overlayId="__unifiedController"
      instanceId="__shell"
    >
      <UnifiedOverlayControllerImpl />
    </OverlayErrorBoundary>
  );
}
