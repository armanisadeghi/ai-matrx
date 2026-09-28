// components/AdminIndicatorWrapper.tsx
"use client";

/**
 * AdminIndicatorWrapper — admin-only ambient services that don't fit the
 * window-panels registry contract.
 *
 * The floating admin chip itself (`<AdminIndicator/>`) is now registered
 * as `overlayId: "adminIndicator"` in `windowRegistry.ts` and rendered by
 * the unified `OverlayController`. This wrapper retains:
 *   1. AdminDebugContextCollector — always-on for super admins; captures
 *      pathname, console errors, and browser metadata for the
 *      copy-context workflow.
 *   2. StreamProfilerOverlay — piggybacks on the same `adminIndicator`
 *      visibility flag the admin chip uses (toggling the chip on also
 *      opens the profiler). Kept here because it isn't a self-contained
 *      registry overlay — it needs to mount as a sibling of the chip,
 *      not as its own surface.
 */

import React, { Suspense } from "react";
import { AdminDebugContextCollector } from "@/components/admin/debug/AdminDebugContextCollector";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsOverlayOpen } from "@/lib/redux/slices/overlaySlice";
import { selectIsSuperAdminDebugger } from "@/lib/redux/slices/userSlice";
import dynamic from "next/dynamic";

const StreamProfilerOverlay = dynamic(
  () =>
    import("@/features/agents/components/shared/StreamProfilerOverlay").then(
      (mod) => mod.StreamProfilerOverlay,
    ),
  { ssr: false },
);

const AdminIndicatorWrapper = () => {
  const isAdmin = useAppSelector(selectIsSuperAdminDebugger);
  const isOverlayOpen = useAppSelector((state) =>
    selectIsOverlayOpen(state, "adminIndicator"),
  );

  if (!isAdmin) return null;

  return (
    <>
      <Suspense fallback={null}>
        <AdminDebugContextCollector />
      </Suspense>
      {isOverlayOpen && <StreamProfilerOverlay />}
    </>
  );
};

export default AdminIndicatorWrapper;
