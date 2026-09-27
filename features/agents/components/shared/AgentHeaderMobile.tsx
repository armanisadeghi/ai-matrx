"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Check, MoreHorizontal, Pencil, Play, Webhook } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAgentIsDirty } from "@/features/agents/redux/agent-definition/selectors";
import {
  TapTargetButtonForGroup,
  TapTargetButtonGroup,
} from "@ai-matrx/tap-target";
import { AgentListDropdown } from "@ai-matrx/agents/catalog/react";
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
} from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePhonePageActions } from "@/features/shell/components/header/phone-page-actions";
import { HeaderActionsSlot } from "@/features/shell/components/header/HeaderActionsSlot";
import { AgentOptionsMenu } from "./AgentOptionsMenu";
import { AgentSaveTapButton } from "./AgentSaveTapButton";
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
  /** Route-specific actions (the run page's New run) — rows in the phone ⋮. */
  extraActions?: ReactNode;
}

export function AgentHeaderMobile({
  agentId,
  agentName,
  basePath = "/agents",
  extraActions,
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
  const { host: shellSheet } = usePhonePageActions();
  // Below 768px only: between 768 and lg this layout still shows, with the
  // shell's own icons and no ⋮ to fold into.
  const isPhone = useIsMobile();

  const dirtyDialog = (
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
  );

  // 🚨 THE SHEET CONTRACT (page-pass shared defects, 2026-09-27). With the
  // shell's ⋮ mounted, the phone header is the AGENT'S NAME (the picker) +
  // Save; every mode and the options menu are one-tap rows in the ⋮'s "This
  // page" section — no icon-only row with its own "More" sheet beside the ⋮.
  if (shellSheet && isPhone) {
    return (
      <>
        <div className="flex items-center w-full gap-1 min-w-0">
          <AgentListDropdown
            onSelect={handleAgentSelect}
            activeAgentId={agentId}
            label={agentName?.trim() || "Select agent"}
            triggerSlot={
              <button
                className="flex min-w-0 items-center gap-1.5 rounded-full px-1.5 py-1 text-sm font-medium text-foreground transition-colors hover:bg-[var(--matrx-glass-bg-active)]"
                aria-label="Switch agent"
              >
                <Webhook className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="min-w-0 truncate">{agentName?.trim() || "Select agent"}</span>
              </button>
            }
          />
          <div className="flex-1" />
          <AgentSaveTapButton agentId={agentId} />
          <HeaderActionsSlot>
            {MODES.map((m) => {
              const Icon = m.icon;
              const isActive = m.id === mode;
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => handleModeChange(m.id)}
                  className="flex w-full min-h-12 items-center gap-3 px-2 text-left text-base"
                >
                  <Icon className={cn("h-5 w-5 shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
                  <span className={cn("flex-1", isActive && "font-medium")}>{m.label}</span>
                  {isActive ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
                </button>
              );
            })}
            {extraActions}
            <AgentOptionsMenu agentId={agentId} asTapTarget basePath={basePath} />
          </HeaderActionsSlot>
        </div>
        {dirtyDialog}
      </>
    );
  }

  return (
    <>
      <div className="flex items-center w-full gap-0.5 min-w-0">
        {/* Left: Agent selector */}
        <AgentListDropdown
          onSelect={handleAgentSelect}
          activeAgentId={agentId}
          label={agentName?.trim() || "Select agent"}
          triggerSlot={
            <button
              className="flex h-9 w-9 shrink-0 items-center justify-center bg-transparent transition-transform active:scale-95 outline-none cursor-pointer"
              aria-label="Select agent"
            >
              <div className="flex h-6 w-6 items-center justify-center rounded-full matrx-glass-thin-border transition-colors">
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

        {/* Right: Save + Options menu. Save is rendered as a sibling rather
            than inside the mode pill because saving isn't a navigation mode —
            it stays visible alongside Build/Run/More so dirty edits never
            require a trip into the More sheet. The component self-hides when
            not in edit mode, so View/Run keep the original two-icon layout. */}
        <AgentSaveTapButton agentId={agentId} />
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
                  "flex items-center w-full px-5 min-h-[52px] active:bg-glass-active transition-colors",
                  idx < MODES.length - 1 && "border-b border-glass-edge",
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

      {dirtyDialog}
    </>
  );
}
