"use client";

// features/mandates/record-next/WindowPreviewPage.tsx
//
// /administration/intelligence/mandates/window — opening this page IS asking
// for the mandate window, so it opens on arrival (UX punch list 2026-09-26: a
// whole page holding one centred button was a wasted click). The button stays,
// small, for re-opening after the window is closed.

import { useEffect, useRef } from "react";
import { AppWindow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOpenMandateWindowNext } from "@/features/overlays/openers/mandateWindowNext";

export function WindowPreviewPage() {
  const openWindow = useOpenMandateWindowNext();
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    openWindow();
  }, [openWindow]);
  return (
    <div className="p-4">
      <Button variant="outline" size="sm" onClick={() => openWindow()} className="gap-2">
        <AppWindow className="h-4 w-4" />
        Open the mandate window again
      </Button>
    </div>
  );
}
