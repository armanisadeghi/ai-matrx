"use client";

import type { ReactNode } from "react";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import { SurfaceRuntimeProvider } from "./SurfaceRuntimeContext";

export function StaticSurfaceRuntimeProvider({
  surfaceName,
  scope,
  children,
}: {
  surfaceName: string;
  scope: SurfaceScopePayload;
  children: ReactNode;
}) {
  return (
    <SurfaceRuntimeProvider surfaceName={surfaceName} getScope={() => scope}>
      {children}
    </SurfaceRuntimeProvider>
  );
}
