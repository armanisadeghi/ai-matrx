// app/(public-demos)/layout.tsx
//
// Sibling of (dev) that contributes to the same /demos/* URL space — but
// without the auth gate. Routes here are externally linkable (the old
// /demos/* URLs that lived under (public)/demos/).
//
// (dev)/demos/*       → auth required, internal dev/test surfaces
// (public-demos)/demos/public/* → no auth, externally linkable
//
// Both populate distinct URL segments under /demos/, so there is no route
// collision between the two groups.
//
// In Phase 2 (MATRX_PROFILE build gate), (public-demos) stays in the
// prod-core build; (dev) does not.
import React from "react";
import { PublicProviders } from "@/app/(public)/PublicProviders";
import { PublicHeader } from "@/components/matrx/PublicHeader";
import { CanvasReopenChip } from "@/features/canvas/core/CanvasReopenChip";
import { CanvasSideSheetInner } from "@/features/canvas/core/CanvasSideSheetInner";

export default function PublicDemosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PublicProviders>
      <div className="h-dvh flex flex-col overflow-hidden">
        <PublicHeader />
        <main className="flex-1 min-h-0 overflow-hidden">{children}</main>
      </div>
      <CanvasSideSheetInner />
      <CanvasReopenChip />
    </PublicProviders>
  );
}
