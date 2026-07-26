"use client";

import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/slices/userSlice";
import CaptureInspectorPanel from "@/features/admin/capture-inspector/CaptureInspectorPanel";

export default function CaptureInspectorClient() {
  const isAdmin = useAppSelector(selectIsAdmin) ?? false;

  return (
    <div className="h-[calc(100dvh-2.5rem)]">
      <CaptureInspectorPanel isAdmin={isAdmin} />
    </div>
  );
}
