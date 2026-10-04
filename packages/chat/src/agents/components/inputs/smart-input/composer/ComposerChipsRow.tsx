"use client";

/**
 * The chips row ABOVE the composer card (brief §7, Amendment 1 A1) — shown in
 * Work and Advanced: where the agent runs (the Cloud chip, which opens the
 * Environment menu in place — the same menu as + › Environment) and what this
 * chat is connected to (`ChatConnectionsStrip variant="chips"`, the
 * conversation's own truth). In Advanced every resource chosen from a
 * connection (a repository · its default branch) is a chip of its own, and a
 * connection with nothing chosen offers its chooser — Work never shows them (A1).
 *
 * Browser, the working doc, the scratchpad and anything the host attached
 * (a canvas) are the conversation context rail's pills, which render inside
 * the card in EVERY mode — they are live state, and hidden never means
 * invisible.
 */

import { useState } from "react";
import { ChevronDown, Cloud, Server } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { cn } from "@ai-matrx/design-system";
import { useOpenRunControlsWindow } from "../../../../../host/window-openers";
import { useOpenCloudBrowserCanvas } from "@host/features/cloud-browser/hooks/useOpenCloudBrowserCanvas";
import { ChatConnectionsStrip } from "../ChatConnectionsStrip";
import { ComposerConnectPromo } from "./ComposerConnectPromo";
import { useComputeTargetActions } from "../use-compute-target-actions";
import { ComposerEnvironmentPanel } from "./ComposerPlusMenu";
import { COMPOSER_CHIP_CLASS, COMPOSER_ROW_CLASS } from "./composer-chip";
import { composerShows } from "./composer-mode-visibility";
import type { ComposerMode } from "./composer-types";

export function ComposerChipsRow({
  conversationId,
  mode,
  menuSide,
  className,
  chipShape = "md",
}: {
  conversationId: string;
  mode: ComposerMode;
  menuSide: "top" | "bottom";
  className?: string;
  /** Corner option under comparison (Arman, 2026-10-03): `soft` = 8px corners. */
  chipShape?: "md" | "soft";
}) {
  const [envOpen, setEnvOpen] = useState(false);
  const compute = useComputeTargetActions(conversationId);
  const openRunControlsWindow = useOpenRunControlsWindow();
  const openCloudBrowser = useOpenCloudBrowserCanvas();
  const boundName = compute.boundView?.target?.name ?? null;
  const EnvIcon = boundName ? Server : Cloud;

  return (
    <div
      className={cn(
        COMPOSER_ROW_CLASS,
        "gap-1 px-1",
        chipShape === "soft" && "[&>*]:!rounded-lg",
        className,
      )}
    >
      <Popover open={envOpen} onOpenChange={setEnvOpen} modal={false}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(COMPOSER_CHIP_CLASS, envOpen && "bg-accent")}
            aria-label={`Runs on: ${boundName ?? "Cloud"}`}
          >
            <EnvIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="max-w-[160px] truncate">{boundName ?? "Cloud"}</span>
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          /* sizing: fixed — the Environment menu is 320px by the brief (§6) */
          side={menuSide}
          align="start"
          sideOffset={6}
          className="w-80 p-1"
        >
          <ComposerEnvironmentPanel
            conversationId={conversationId}
            sandboxBlocked={compute.sandboxBlocked}
            onOpenSandbox={() => {
              setEnvOpen(false);
              openRunControlsWindow({ conversationId, initialTab: "sandbox" });
            }}
            onOpenBrowser={() => {
              setEnvOpen(false);
              openCloudBrowser({ conversationId });
            }}
            onChosen={() => setEnvOpen(false)}
          />
        </PopoverContent>
      </Popover>
      <ChatConnectionsStrip
        conversationId={conversationId}
        variant="chips"
        showResources={composerShows(mode, "chips.repos")}
        emptyChips={<ComposerConnectPromo conversationId={conversationId} menuSide={menuSide} />}
      />
    </div>
  );
}
