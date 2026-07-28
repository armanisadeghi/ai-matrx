import React from "react";
import { PublicProviders } from "./PublicProviders";
import { PublicHeader } from "@/components/matrx/PublicHeader";
import { PublicFooter } from "@/components/matrx/PublicFooter";
import { CanvasSideSheet } from "@/features/canvas/core/CanvasSideSheet";

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
        <PublicFooter />
      </div>
      {/* Canvas front door at layout root so the surface sits above all page
          content (z-10000) and is available from every public route. The
          heavy canvas core loads only when a canvas item exists — never
          statically import CanvasSideSheetImpl here (build-graph leak on
          every anonymous page; eslint bans it). */}
      <CanvasSideSheet />
    </PublicProviders>
  );
}
