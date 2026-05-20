import React from "react";
import { PublicProviders } from "./PublicProviders";
import { PublicHeader } from "@/components/matrx/PublicHeader";
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
      </div>
      <CanvasSideSheet />
    </PublicProviders>
  );
}
