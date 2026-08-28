"use client";

import { toast } from "@/lib/toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAppStore } from "@/lib/redux/hooks";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AgentListInlinePicker } from "@/features/agents/components/agent-listings/AgentListInlinePicker";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import type { AgentDefinitionRecord } from "@/features/agents/types/agent-definition.types";
import type { AgentConfig } from "@/features/cx-chat/types/agents";

interface AgentPickerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedAgent?: AgentConfig | null;
  onSelect: (agent: AgentConfig) => void;
}

const CX_CHAT_PICKER_CONSUMER_ID = "cx-chat-agent-picker";

function toAgentConfig(agent: AgentDefinitionRecord): AgentConfig {
  return {
    promptId: agent.id,
    name: agent.name,
    description: agent.description ?? undefined,
    variableDefaults:
      agent.variableDefinitions as AgentConfig["variableDefaults"],
  };
}

/**
 * CX-chat shell for the canonical agent roster. Mobile keeps a bottom drawer
 * and desktop keeps a dialog, but both render the same `AgentListInlinePicker`
 * core as the main chat header dropdown.
 */
export function AgentPickerSheet({
  open,
  onOpenChange,
  selectedAgent,
  onSelect,
}: AgentPickerSheetProps) {
  const isMobile = useIsMobile();
  const store = useAppStore();

  const handleSelect = (agentId: string) => {
    const agent = selectAgentById(store.getState(), agentId);
    if (!agent) {
      toast.error("The selected agent could not be loaded.");
      return;
    }
    onSelect(toAgentConfig(agent));
    onOpenChange(false);
  };

  const picker = (
    <AgentListInlinePicker
      consumerId={CX_CHAT_PICKER_CONSUMER_ID}
      onSelect={handleSelect}
      activeAgentId={selectedAgent?.promptId ?? null}
      className="h-full"
    />
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="h-[85dvh]">
          <DrawerHeader className="shrink-0 border-b border-border text-left">
            <DrawerTitle>Choose an agent</DrawerTitle>
            <DrawerDescription>
              Search, filter, sort, and preview every available agent.
            </DrawerDescription>
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-hidden">{picker}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(680px,80dvh)] max-w-2xl flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4 text-left">
          <DialogTitle>Choose an agent</DialogTitle>
          <DialogDescription>
            Search, filter, sort, and preview every available agent.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden">{picker}</div>
      </DialogContent>
    </Dialog>
  );
}

export default AgentPickerSheet;
