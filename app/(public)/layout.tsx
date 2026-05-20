import React from "react";
import { PublicProviders } from "./PublicProviders";
import { PublicHeader } from "@/components/matrx/PublicHeader";
import { CanvasSideSheet } from "@/features/canvas/core/CanvasSideSheet";
import { CanvasReopenChip } from "@/features/canvas/core/CanvasReopenChip";

export default function PublicLayout({
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
      {/* Canvas surface mounted at layout root so it sits above all page
          content (z-10000) and is available from every public route. */}
      <CanvasSideSheet />
      <CanvasReopenChip />
    </PublicProviders>
  );
}
