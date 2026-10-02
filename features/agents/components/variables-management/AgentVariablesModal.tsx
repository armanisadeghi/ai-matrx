"use client";

import { useState } from "react";
import { Variable } from "lucide-react";
import { useIsMobile } from "@ai-matrx/kit/media-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { AgentVariablesPanel } from "@/features/agents/components/variables-management/AgentVariablesPanel";
import { AgentVariablesManager } from "@/features/agents/components/variables-management/AgentVariablesManager";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAgentVariableDefinitions } from "@ai-matrx/chat/agents/redux/agent-definition/selectors";

interface AgentVariablesModalProps {
  agentId: string;
}

export function AgentVariablesModal({ agentId }: AgentVariablesModalProps) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();

  const variables = useAppSelector((state) =>
    selectAgentVariableDefinitions(state, agentId),
  );
  const count = variables?.length ?? 0;

  const trigger = (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 relative"
      onClick={() => setOpen(true)}
      title="Variables"
    >
      <Variable className="h-4 w-4" />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground leading-none">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Button>
  );

  if (isMobile) {
    return (
      <>
        {trigger}
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent className="max-h-[90dvh] flex flex-col">
            <DrawerHeader className="px-4 pt-4 pb-2 shrink-0">
              <DrawerTitle>Agent Variables</DrawerTitle>
              <DrawerDescription>
                {count} variable{count !== 1 ? "s" : ""} defined
              </DrawerDescription>
            </DrawerHeader>
            <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-safe">
              <AgentVariablesManager agentId={agentId} />
            </div>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <>
      {trigger}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[90vw] w-full xl:max-w-4xl h-[80dvh] flex flex-col overflow-hidden p-0">
          <DialogHeader className="px-6 pt-5 pb-4 shrink-0 border-b border-border">
            <DialogTitle className="text-base font-semibold">
              Agent Variables
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {count > 0
                ? `${count} variable${count !== 1 ? "s" : ""} defined — select one to edit or add a new one`
                : "Define named values that can be filled in when running this agent"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-hidden" style={{ minHeight: 0 }}>
            <AgentVariablesPanel agentId={agentId} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
