"use client";

/**
 * AgentSettingsPanelWrapper
 *
 * Wraps AgentSettingsContent from the new agent-settings feature for use inside
 * PromptBuilderRedux. Handles both panel (inline) and modal (dialog) modes.
 *
 * - Panel mode: rendered as the left sidebar in the builder
 * - Modal mode: opened via a Settings button in the header toolbar
 *
 * All settings logic is in agentSettingsSlice — this is pure display.
 */

import { useState } from "react";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AgentSettingsContent } from "@/features/agent-settings/components/AgentSettingsContent";
import { selectHasPendingSwitch } from "@/lib/redux/slices/agent-settings/selectors";
import { useAppSelector } from "@/lib/redux/hooks";
import { Badge } from "@/components/ui/badge";

interface AgentSettingsPanelWrapperProps {
  agentId: string;
}

// ── Inline panel (left sidebar) ───────────────────────────────────────────────

export function AgentSettingsPanelInline({
  agentId,
}: AgentSettingsPanelWrapperProps) {
  const hasPendingSwitch = useAppSelector((state) =>
    selectHasPendingSwitch(state, agentId),
  );

  return (
    <div className="h-full flex flex-col overflow-hidden bg-card">
      {/* Header row */}
      <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Settings
        </span>
        {hasPendingSwitch && (
          <Badge
            variant="outline"
            className="text-[10px] h-4 text-amber-500 border-amber-400 px-1.5"
          >
            Model conflict
          </Badge>
        )}
      </div>

      {/* Scrollable content */}
      <ScrollArea className="flex-1 overflow-auto">
        <AgentSettingsContent
          agentId={agentId}
          showTools
          showVariables={false}
          showParams
        />
      </ScrollArea>
    </div>
  );
}

// ── Modal trigger button + dialog ─────────────────────────────────────────────

export function AgentSettingsModalTrigger({
  agentId,
}: AgentSettingsPanelWrapperProps) {
  const [open, setOpen] = useState(false);
  const hasPendingSwitch = useAppSelector((state) =>
    selectHasPendingSwitch(state, agentId),
  );

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 text-xs"
        onClick={() => setOpen(true)}
      >
        <Settings2 className="w-3.5 h-3.5" />
        Settings
        {hasPendingSwitch && (
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[88dvh] flex flex-col gap-0 p-0">
          <DialogHeader className="px-4 py-3 border-b shrink-0">
            <DialogTitle className="text-sm">Model Settings</DialogTitle>
          </DialogHeader>

          <ScrollArea className="flex-1 overflow-auto">
            <AgentSettingsContent
              agentId={agentId}
              showTools
              showVariables={false}
              showParams
            />
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
