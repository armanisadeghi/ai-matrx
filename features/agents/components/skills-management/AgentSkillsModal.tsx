"use client";

/**
 * AgentSkillsModal
 *
 * Trigger button + large catalogue workspace (desktop) / Drawer (mobile)
 * for editing the per-agent `skill_config` JSONB.
 *
 * The skill_config save piggybacks on the existing agent save flow —
 * setAgentSkillConfig marks the field dirty, and the next saveAgent thunk
 * picks it up via agentDefinitionToUpdate's skill_config branch.
 */

import { useCallback, useState } from "react";
import { Lightbulb } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";

import { selectAgentSkillConfig } from "@/features/agents/redux/agent-definition/selectors";
import { setAgentSkillConfig } from "@/features/agents/redux/agent-definition/slice";
import { SkillConfigPicker } from "@/features/skills/components/SkillConfigPicker";
import type { SkillConfig } from "@/features/skills/types";

interface AgentSkillsModalProps {
  agentId: string;
}

export function AgentSkillsModal({ agentId }: AgentSkillsModalProps) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const dispatch = useAppDispatch();
  const skillConfig = useAppSelector((state) =>
    selectAgentSkillConfig(state, agentId),
  );

  const includedCount = skillConfig.included.length;
  const listedCount = skillConfig.listed.length;
  const totalCount = includedCount + listedCount + skillConfig.forbidden.length;

  const handleChange = useCallback(
    (next: SkillConfig) => {
      dispatch(setAgentSkillConfig({ id: agentId, skillConfig: next }));
    },
    [agentId, dispatch],
  );

  const trigger = (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 relative"
      onClick={() => setOpen(true)}
      title="Skills"
    >
      <Lightbulb className="h-4 w-4" />
      {totalCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground leading-none">
          {totalCount > 9 ? "9+" : totalCount}
        </span>
      )}
    </Button>
  );

  if (isMobile) {
    return (
      <>
        {trigger}
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent className="h-[94dvh] max-h-[94dvh] flex flex-col">
            <DrawerHeader className="px-4 pt-4 pb-2 shrink-0">
              <DrawerTitle>Agent Skills</DrawerTitle>
              <DrawerDescription>
                Search and organize the full skills catalogue. Changes are saved
                with the next agent save.
              </DrawerDescription>
            </DrawerHeader>
            <div className="min-h-0 flex-1 overflow-hidden">
              <SkillConfigPicker value={skillConfig} onChange={handleChange} />
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
        <DialogContent className="flex h-[min(92dvh,960px)] w-[calc(100vw-2rem)] max-w-[min(96vw,1440px)] flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b border-border px-6 py-4">
            <DialogTitle className="text-lg font-semibold">
              Agent Skills
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Search and organize the full skills catalogue. Changes are saved
              with the next agent save.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-hidden">
            <SkillConfigPicker value={skillConfig} onChange={handleChange} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
