"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Check, MoreHorizontal, Pencil, Play, Webhook } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAgentIsDirty } from "@/features/agents/redux/agent-definition/selectors";
import {
  TapTargetButtonForGroup,
  TapTargetButtonGroup,
} from "@/components/icons/TapTargetButton";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  BottomSheet,
  BottomSheetHeader,
  BottomSheetBody,
} from "@/components/official/bottom-sheet/BottomSheet";
import { cn } from "@/lib/utils";
import { AgentOptionsMenu } from "./AgentOptionsMenu";
import {
  MODES,
  deriveAgentMode,
  getAgentModeHref,
  type AgentPageMode,
  type ModeOption,
} from "./AgentModeController";

// Modes that stay visible directly on mobile — everything else goes in the
// "More" sheet. Per UX request: only Build + Run are prominent; the rest are
// one tap away in the sheet.
const PROMINENT: ModeOption[] = ["edit", "run"];

interface AgentHeaderMobileProps {
  agentId: string;
  /** Agent name — currently unused in mobile layout (icons-only to save space).
   *  Kept in the props for API symmetry with desktop and for future label use. */
  agentName?: string;
  /** Base path used for mode-switch navigation. Defaults to `/agents`. */
  basePath?: string;
}

export function AgentHeaderMobile({
  agentId,
  basePath = "/agents",
}: AgentHeaderMobileProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const isDirty = useAppSelector((state) => selectAgentIsDirty(state, agentId));
  const [showDirtyDialog, setShowDirtyDialog] = useState(false);
  const [pendingNew, setPendingNew] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const mode = deriveAgentMode(pathname, agentId, basePath);

  const navigateTo = (path: string) => {
    startTransition(() => router.push(path));
  };

  const handleModeChange = (next: ModeOption) => {
    if (next === mode) return;
    if (next === "new") {
      if (isDirty) {
        setPendingNew(true);
        setShowDirtyDialog(true);
      } else {
        navigateTo(`${basePath}/new`);
      }
      return;
    }
    navigateTo(getAgentModeHref(next, agentId, basePath));
  };

  const handleAgentSelect = (selectedId: string) => {
    if (selectedId === agentId) return;
    const nextHref = getAgentModeHref(mode, selectedId, basePath);
    startTransition(() => router.push(nextHref));
  };

  const prominentModes = MODES.filter((m) => PROMINENT.includes(m.id));

  return (
    <>
      <div className="flex items-center w-full gap-0.5 min-w-0">
        {/* Left: Agent selector */}
        <AgentListDropdown
          onSelect={handleAgentSelect}
          triggerSlot={
            <button
              className="flex h-9 w-9 shrink-0 items-center justify-center bg-transparent transition-transform active:scale-95 outline-none cursor-pointer"
              aria-label="Select agent"
            >
              <div className="flex h-6 w-6 items-center justify-center rounded-full matrx-shell-glass transition-colors">
                <Webhook className="w-3.5 h-3.5" />
              </div>
            </button>
          }
        />

        {/* Center: Build + Run + More */}
        <div className="flex-1 flex justify-center min-w-0">
          <TapTargetButtonGroup>
            {prominentModes.map(({ id, label, icon: Icon }) => {
              const isActive = id === mode;
              return (
                <TapTargetButtonForGroup
                  key={id}
                  icon={
                    <Icon
                      className={`w-4 h-4 ${isActive ? "text-primary" : ""}`}
                    />
                  }
                  ariaLabel={label}
                  onClick={() => handleModeChange(id)}
                />
              );
            })}
            <TapTargetButtonForGroup
              icon={
                <MoreHorizontal
                  className={`w-4 h-4 ${!PROMINENT.includes(mode as ModeOption) ? "text-primary" : ""}`}
                />
              }
              ariaLabel="More"
              onClick={() => setMoreOpen(true)}
            />
          </TapTargetButtonGroup>
        </div>

        {/* Right: Options menu */}
        <AgentOptionsMenu agentId={agentId} asTapTarget basePath={basePath} />
      </div>

      <BottomSheet
        open={moreOpen}
        onOpenChange={setMoreOpen}
        title="Agent mode"
      >
        <BottomSheetHeader
          title="Switch mode"
          trailing={
            <button
              onClick={() => setMoreOpen(false)}
              className="text-primary active:opacity-70 min-h-[44px] px-1 text-[15px]"
            >
              Done
            </button>
          }
        />
        <BottomSheetBody>
          {MODES.map((m, idx) => {
            const Icon = m.icon;
            const isActive = m.id === mode;
            return (
              <button
                key={m.id}
                onClick={() => {
                  setMoreOpen(false);
                  handleModeChange(m.id);
                }}
                className={cn(
                  "flex items-center w-full px-5 min-h-[52px] active:bg-white/5 transition-colors",
                  idx < MODES.length - 1 && "border-b border-white/[0.06]",
                )}
              >
                <Icon
                  className={cn(
                    "w-4 h-4 mr-3 shrink-0",
                    isActive ? "text-primary" : "text-muted-foreground",
                  )}
                />
                <span
                  className={cn(
                    "text-[15px] flex-1 text-left",
                    isActive && "font-medium",
                  )}
                >
                  {m.label}
                </span>
                {isActive && (
                  <Check className="w-4 h-4 text-primary shrink-0" />
                )}
              </button>
            );
          })}
        </BottomSheetBody>
      </BottomSheet>

      <AlertDialog open={showDirtyDialog} onOpenChange={setShowDirtyDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to this agent. If you leave now, your
              changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setShowDirtyDialog(false);
                setPendingNew(false);
              }}
            >
              Stay
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowDirtyDialog(false);
                if (pendingNew) {
                  setPendingNew(false);
                  navigateTo(`${basePath}/new`);
                }
              }}
            >
              Discard & Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
