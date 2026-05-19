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

// Mount-time warning gate — fires exactly once per page session regardless
// of how many times React might mount/unmount this controller (React 18+
// strict-mode double-invoke, route remounts, etc.).
let _warnedLegacyMount = false;

export default function UnifiedOverlayController() {
  // Outer-shell heartbeat: marks that the gate mounted us and the static
  // outer chunk parsed successfully. If this fires but the Impl heartbeat
  // does not, the next/dynamic chunk load is the failure (service worker,
  // CSP, offline, etc.) — the diagnostic timeout report calls it out.
  useEffect(() => {
    markUnifiedControllerMounted();
    // Loud, intentional, ships in production. The whole point of the
    // overhaul (docs/OVERLAY_WINDOW_OVERHAUL.md) is to retire this
    // controller; this log is how the team confirms the cutover took
    // effect everywhere. If you see it on prod after flipping
    // NEXT_PUBLIC_USE_NEW_OVERLAY_CONTROLLER=1, something is still
    // routing through this legacy path — investigate which provider
    // tree mounted us. Once the legacy code is deleted (post-cutover)
    // this whole file goes with it.
    if (!_warnedLegacyMount) {
      _warnedLegacyMount = true;
      // eslint-disable-next-line no-console
      console.warn(
        "[overlays] LEGACY UnifiedOverlayController is mounting — this is the OLD spread-render path. " +
          "To use the new explicit controller, set localStorage.matrx_new_overlay_controller=\"1\" " +
          "(per-tab override) or NEXT_PUBLIC_USE_NEW_OVERLAY_CONTROLLER=1 in env (preview/prod). " +
          "See docs/OVERLAY_WINDOW_OVERHAUL.md.",
      );
    }
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
