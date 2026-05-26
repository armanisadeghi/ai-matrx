"use client";

import { useSearchParams } from "next/navigation";
import type { Layout } from "react-resizable-panels";
import { StudioView } from "@/features/transcript-studio/components/StudioView";

interface StudioRouteProps {
  defaultColumnLayout?: Record<string, number>;
  defaultSidebarLayout?: Layout;
}

export function StudioRoute({
  defaultColumnLayout,
  defaultSidebarLayout,
}: StudioRouteProps) {
  const searchParams = useSearchParams();
  const initialSessionId = searchParams.get("session");

  return (
    <StudioView
      config={{
        containerVariant: "page",
        showSidebar: true,
        showSettings: true,
        initialSessionId,
        defaultColumnLayout,
        defaultSidebarLayout,
      }}
    />
  );
}
