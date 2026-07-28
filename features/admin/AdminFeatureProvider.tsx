"use client";

// Thin shell over ONE dynamic edge (Method C, code-splitting skill): the
// admin singletons always render together for admins, so they live statically
// inside AdminFeatureProviderCore behind this single boundary instead of four
// sibling dynamics. Non-admins never fetch the chunk.

import dynamic from "next/dynamic";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";
import { selectIsDebugMode } from "@/lib/redux/preferences/adminDebugSlice";

const AdminFeatureProviderCore = dynamic(
  () => import("./AdminFeatureProviderCore"),
  { ssr: false, loading: () => null },
);

export default function AdminFeatureProvider() {
  const isAdmin = useAppSelector(selectIsSuperAdmin);
  const isDebugMode = useAppSelector(selectIsDebugMode);

  if (!isAdmin) return null;

  return <AdminFeatureProviderCore isDebugMode={isDebugMode} />;
}
