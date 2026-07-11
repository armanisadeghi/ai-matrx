"use client";

/**
 * features/surfaces/components/chrome/SurfaceAgentsHeaderButton.tsx
 *
 * Universal shell-header Agents control. Intentionally a **thin shell**:
 *   • Idle cost = one tap-target icon (RobotTapButton). No fetches. No lists.
 *   • On open → `next/dynamic({ ssr: false })` loads SurfaceAgentsPanelImpl,
 *     and only then do we fetch bound agents / related surfaces.
 *
 * Mount once in the AppShell header (left of the avatar). Every `(core)` page
 * gets it for free. Pages that want smart Run mount a
 * `SurfaceRuntimeProvider` (registers into a module store the panel reads —
 * header and `<main>` are siblings, so React Context alone cannot bridge).
 */

import { useState } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

import { RobotTapButton } from "@/components/icons/tap-buttons";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";

const SurfaceAgentsPanelImpl = dynamic(
  () => import("./SurfaceAgentsPanelImpl"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center gap-2 p-8 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading agents…
      </div>
    ),
  },
);

export function SurfaceAgentsHeaderButton() {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();

  const trigger = (
    <RobotTapButton
      ariaLabel="Agents for this page"
      tooltip="Agents"
      className="text-primary"
    />
  );

  if (isMobile) {
    return (
      <>
        <span onClick={() => setOpen(true)}>{trigger}</span>
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent className="bg-textured pb-safe max-h-[85dvh]">
            <DrawerHeader className="sr-only">
              <DrawerTitle>Agents</DrawerTitle>
            </DrawerHeader>
            {/* Condition is the whole point — chunk + fetches only when open */}
            {open && (
              <div className="overflow-y-auto px-1 pb-4">
                <SurfaceAgentsPanelImpl />
              </div>
            )}
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        className="w-[340px] max-w-[92vw] p-0 bg-textured"
      >
        {open && <SurfaceAgentsPanelImpl />}
      </PopoverContent>
    </Popover>
  );
}
