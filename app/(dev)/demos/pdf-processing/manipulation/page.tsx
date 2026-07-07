"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

const PdfManipulationWorkbench = dynamic(
  () =>
    import("@/features/pdf-extractor/studio/PdfManipulationWorkbench").then(
      (m) => m.PdfManipulationWorkbench,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[calc(100dvh-var(--header-height))] w-full items-center justify-center bg-textured">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);

export default function PdfManipulationDemoPage() {
  return <PdfManipulationWorkbench />;
}
