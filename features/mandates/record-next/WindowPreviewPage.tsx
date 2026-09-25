"use client";

// features/mandates/record-next/WindowPreviewPage.tsx
//
// /administration/mandates/window-preview — one button that opens the NEW
// mandate window so the owner can try it beside the old one.

import { AppWindow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOpenMandateWindowNext } from "@/features/overlays/openers/mandateWindowNext";

export function WindowPreviewPage() {
  const openWindow = useOpenMandateWindowNext();
  return (
    <div className="flex h-full items-center justify-center p-6">
      <Button onClick={() => openWindow()} className="gap-2">
        <AppWindow className="h-4 w-4" />
        Open mandate window
      </Button>
    </div>
  );
}
