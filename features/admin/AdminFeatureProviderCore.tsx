"use client";

// Method-C core (see code-splitting skill): everything here renders together
// whenever the admin gate in AdminFeatureProvider passes, so the set is
// compiled as ONE piece behind that single dynamic edge — no per-component
// boundaries. DevPerfOverlay is the exception: dev-only + debug-gated, so it
// keeps an in-gate React.lazy boundary (build-cheap) and never enters the
// production chunk.

import { lazy, Suspense } from "react";
import AdminIndicatorWrapper from "@/components/admin/controls/AdminIndicatorWrapper";
import CredentialExpiryNotifier from "@/components/admin/CredentialExpiryNotifier";
import { DebugIndicatorManager } from "@/components/debug/DebugIndicatorManager";

const DevPerfOverlay =
  process.env.NODE_ENV === "development"
    ? lazy(() => import("@/features/shell/components/dev/DevPerfOverlay"))
    : null;

export default function AdminFeatureProviderCore({
  isDebugMode,
}: {
  isDebugMode: boolean;
}) {
  return (
    <>
      <AdminIndicatorWrapper />
      <CredentialExpiryNotifier />
      <DebugIndicatorManager />
      {isDebugMode && DevPerfOverlay && (
        <Suspense fallback={null}>
          <DevPerfOverlay />
        </Suspense>
      )}
    </>
  );
}
