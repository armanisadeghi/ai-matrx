"use client";

import dynamic from "next/dynamic";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";
import { selectIsDebugMode } from "@/lib/redux/preferences/adminDebugSlice";

const AdminNavInjector = dynamic(
  () => import("@/features/shell/components/sidebar/AdminNavInjector"),
  { ssr: false, loading: () => null },
);

const AdminIndicatorWrapper = dynamic(
  () => import("@/components/admin/controls/AdminIndicatorWrapper"),
  { ssr: false, loading: () => null },
);

const AppleKeyExpiryBanner = dynamic(
  () => import("@/components/admin/AppleKeyExpiryBanner"),
  { ssr: false, loading: () => null },
);

const DebugIndicatorManager = dynamic(
  () =>
    import("@/components/debug/DebugIndicatorManager").then((m) => ({
      default: m.DebugIndicatorManager,
    })),
  { ssr: false, loading: () => null },
);

const DevPerfOverlay =
  process.env.NODE_ENV === "development"
    ? dynamic(() => import("@/features/shell/components/dev/DevPerfOverlay"), {
        ssr: false,
        loading: () => null,
      })
    : () => null;

export default function AdminFeatureProvider() {
  const isAdmin = useAppSelector(selectIsSuperAdmin);
  const isDebugMode = useAppSelector(selectIsDebugMode);

  if (!isAdmin) return null;

  return (
    <>
      <AdminNavInjector />
      <AdminIndicatorWrapper />
      <AppleKeyExpiryBanner />
      <DebugIndicatorManager />
      {isDebugMode && <DevPerfOverlay />}
    </>
  );
}
