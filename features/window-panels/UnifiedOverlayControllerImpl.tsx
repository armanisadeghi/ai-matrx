"use client";

/**
 * UnifiedOverlayController — heavy body (Impl).
 *
 * Iterates `ALL_WINDOW_REGISTRY_ENTRIES` and renders one
 * <OverlaySurface> per entry. The registry module itself is ~860 LOC
 * with 96 dynamic-import wrappers and tray-preview JSX — substantial
 * static parse cost when a route entry statically imports it.
 *
 * Lazy-loaded by `UnifiedOverlayController.tsx` after client mount, so
 * the registry's parse cost is amortized across all routes via a single
 * shared chunk instead of being walked for each route's static graph.
 */
import { useEffect, useState } from "react";
import {
  ALL_WINDOW_REGISTRY_ENTRIES,
  assertRegistryIntegrity,
} from "@/features/window-panels/registry/windowRegistry";
import { OverlaySurface } from "./OverlaySurface";
import type { OverlayId } from "@/features/window-panels/registry/overlay-ids";
import { markUnifiedImplMounted } from "@/lib/redux/middleware/overlayDiagnostics";

let _integrityChecked = false;

export default function UnifiedOverlayControllerImpl() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    markUnifiedImplMounted();
    setMounted(true);
    if (process.env.NODE_ENV !== "production" && !_integrityChecked) {
      _integrityChecked = true;
      try {
        assertRegistryIntegrity();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[UnifiedOverlayController] registry integrity:", err);
      }
    }
  }, []);

  if (!mounted) return null;

  return (
    <>
      {ALL_WINDOW_REGISTRY_ENTRIES.map((entry) => (
        // entry.overlayId is `string` on WindowStaticMetadata for cycle-
        // avoidance, but every value in ALL_WINDOW_REGISTRY_ENTRIES is
        // verified by check-registry to exist in OVERLAY_IDS. Safe cast.
        <OverlaySurface
          key={entry.overlayId}
          overlayId={entry.overlayId as OverlayId}
        />
      ))}
    </>
  );
}
