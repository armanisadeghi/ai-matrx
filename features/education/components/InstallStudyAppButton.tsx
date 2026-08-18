"use client";

/**
 * "Install the study app" — the education surface's consumer of the platform
 * install primitive (`lib/pwa/`).
 *
 * Renders nothing when there is nothing to offer (already installed, or a
 * browser with neither the prompt API nor an Add-to-Home-Screen flow), so it is
 * safe to mount unconditionally. On iOS Safari — which never fires
 * `beforeinstallprompt` — it opens a drawer with the actual two taps instead of
 * a button that silently does nothing.
 */

import { useState } from "react";
import { Download, Share, SquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useInstallPrompt } from "@/lib/pwa/useInstallPrompt";
import { toast } from "@/lib/toast";

export function InstallStudyAppButton({
  className,
}: {
  className?: string;
}) {
  const { availability, install } = useInstallPrompt();
  const [iosOpen, setIosOpen] = useState(false);

  if (availability === "installed" || availability === "unavailable") {
    return null;
  }

  if (availability === "ios-manual") {
    return (
      <>
        <Button
          variant="outline"
          size="sm"
          className={className}
          onClick={() => setIosOpen(true)}
        >
          <Download className="mr-2 h-4 w-4" />
          Add to Home Screen
        </Button>
        <Drawer open={iosOpen} onOpenChange={setIosOpen}>
          <DrawerContent className="pb-safe">
            <DrawerHeader>
              <DrawerTitle>Add AI Matrx to your Home Screen</DrawerTitle>
              <DrawerDescription>
                Two taps, and studying opens like an app — full screen, and your
                downloaded decks work without a signal.
              </DrawerDescription>
            </DrawerHeader>
            <ol className="space-y-4 px-4 pb-6 text-sm text-foreground">
              <li className="flex items-start gap-3">
                <Share className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <span>
                  Tap the <span className="font-medium">Share</span> button in
                  the Safari toolbar.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <SquarePlus className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <span>
                  Choose{" "}
                  <span className="font-medium">Add to Home Screen</span>, then
                  tap <span className="font-medium">Add</span>.
                </span>
              </li>
            </ol>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className={className}
      onClick={async () => {
        const outcome = await install();
        if (outcome === "accepted") {
          toast.success("Study app installed — open it from your home screen.");
        }
      }}
    >
      <Download className="mr-2 h-4 w-4" />
      Install the study app
    </Button>
  );
}
