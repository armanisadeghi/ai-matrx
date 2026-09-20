"use client";

/**
 * features/surfaces/components/chrome/SurfaceAgentsHeaderButton.tsx
 *
 * Universal shell-header Agents control — one of the three fixed header
 * controls (features/shell/FEATURE.md § The header right set). Intentionally
 * a **thin shell**:
 *   • Idle cost = one tap-target icon (RobotTapButton). No fetches. No lists.
 *   • On open → `next/dynamic({ ssr: false })` loads SurfaceAgentsPanelImpl,
 *     and only then do we fetch bound agents / related surfaces.
 *   • Signed out → the SAME button; a click opens the auth gate. It is never
 *     hidden, so the header row is identical for guests and members.
 *
 * Mount once in the AppShell header. Every `(core)` page gets it for free.
 * Pages that want smart Run mount a `SurfaceRuntimeProvider` (registers into
 * a module store the panel reads — header and `<main>` are siblings, so React
 * Context alone cannot bridge).
 */

import { useState } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

import { RobotTapButton } from "@ai-matrx/tap-target/buttons";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ai-matrx/design-system";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { useOpenAuthGateDialog } from "@/features/overlays/openers/authGate";

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

function GuestAgentsButton() {
  const openAuthGate = useOpenAuthGateDialog();
  return (
    <RobotTapButton
      ariaLabel="Agents for this page — sign in to use them"
      tooltip="Agents (sign in)"
      className="text-primary"
      onClick={() =>
        openAuthGate({
          featureName: "Agents",
          featureDescription:
            "Every page has agents that can read it and act on it. Sign in to run them.",
        })
      }
    />
  );
}

function SignedInAgentsButton() {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();

  const trigger = (
    <RobotTapButton
      ariaLabel="Agents for this page"
      tooltip="Agents"
      className="text-primary"
      onClick={isMobile ? () => setOpen(true) : undefined}
    />
  );

  if (isMobile) {
    return (
      <>
        {trigger}
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent className="bg-textured pb-safe max-h-[85dvh]">
            <DrawerHeader className="sr-only">
              <DrawerTitle>Agents</DrawerTitle>
            </DrawerHeader>
            {/* Condition is the whole point — chunk + fetches only when open */}
            {open && (
              <div className="overflow-y-auto px-1 pb-4">
                <SurfaceAgentsPanelImpl onRequestClose={() => setOpen(false)} />
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
        {open && (
          <SurfaceAgentsPanelImpl onRequestClose={() => setOpen(false)} />
        )}
      </PopoverContent>
    </Popover>
  );
}

export function SurfaceAgentsHeaderButton({
  isAuthenticated = true,
}: {
  isAuthenticated?: boolean;
}) {
  return isAuthenticated ? <SignedInAgentsButton /> : <GuestAgentsButton />;
}
