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

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

import { TapTargetButton } from "@ai-matrx/tap-target";
import { INTELLIGENCE_ICON } from "@/components/icons/domain-icons";
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
import { GRID_COMPANION_ATTR } from "@/features/data-tables/grid-companion";

export const SurfaceAgentsPanelImpl = dynamic(
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

/** What a guest is told when they reach for Agents — one copy for every door. */
export const AGENTS_AUTH_GATE = {
  featureName: "Agents",
  featureDescription:
    "Every page has agents that can read it and act on it. Sign in to run them.",
};

function GuestAgentsButton() {
  const openAuthGate = useOpenAuthGateDialog();
  return (
    <TapTargetButton
      icon={<INTELLIGENCE_ICON className="h-5 w-5" />}
      ariaLabel="Agents for this page — sign in to use them"
      tooltip="Agents (sign in)"
      className="text-primary"
      onClick={() => openAuthGate(AGENTS_AUTH_GATE)}
    />
  );
}

function SignedInAgentsButton() {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  // An item that launched something else (Surface Context, a run window) closes
  // the popover; returning focus to the trigger then re-opened its "Agents"
  // tooltip, which stuck over the page's toolbar (page-pass 2026-09-27). Focus
  // returns to the trigger only when the person dismissed the popover itself
  // (Escape, click away) — never after an item handed off to another layer.
  const launchedRef = useRef(false);
  const closeAfterLaunch = () => {
    launchedRef.current = true;
    setOpen(false);
  };

  const trigger = (
    <TapTargetButton
      icon={<INTELLIGENCE_ICON className="h-5 w-5" />}
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
        sizing="content"
        align="end"
        side="bottom"
        className="p-0 bg-textured"
        onCloseAutoFocus={(event) => {
          if (launchedRef.current) {
            launchedRef.current = false;
            event.preventDefault();
          }
        }}
      >
        {open && <SurfaceAgentsPanelImpl onRequestClose={closeAfterLaunch} />}
      </PopoverContent>
    </Popover>
  );
}

export function SurfaceAgentsHeaderButton({
  isAuthenticated = true,
}: {
  isAuthenticated?: boolean;
}) {
  // THE GRID'S COMPANION (merged-grid review 2, fix lane F): opening the page's agents to ask about
  // the selected cell is not clicking away from the grid — both grids keep the selection through
  // a press on this marker (`GRID_COMPANION_ATTR`). `contents` adds no box to the header row.
  return (
    <span {...{ [GRID_COMPANION_ATTR]: "" }} className="contents">
      {isAuthenticated ? <SignedInAgentsButton /> : <GuestAgentsButton />}
    </span>
  );
}
