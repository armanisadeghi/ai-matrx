"use client";

/**
 * AgentSkillsButton
 *
 * Toolbar trigger in the agent builder that opens the non-blocking
 * `agentSkillsWindow` floating panel (see
 * `features/window-panels/windows/agents/AgentSkillsWindow.tsx`).
 *
 * Replaced the old `AgentSkillsModal` — a blocking Dialog that trapped the
 * user while they browsed the catalogue. The window keeps the builder usable
 * underneath, and the picker itself now opens each skill's full instructions.
 */

import { Lightbulb } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsOverlayOpen } from "@/lib/redux/slices/overlaySlice";
import { useOpenAgentSkillsWindow } from "@/features/overlays/openers/agentSkillsWindow";
import { selectAgentSkillConfig } from "@/features/agents/redux/agent-definition/selectors";
import { cn } from "@/lib/utils";

interface AgentSkillsButtonProps {
  agentId: string;
}

export function AgentSkillsButton({ agentId }: AgentSkillsButtonProps) {
  const openSkillsWindow = useOpenAgentSkillsWindow();
  const skillConfig = useAppSelector((state) =>
    selectAgentSkillConfig(state, agentId),
  );
  const isOpen = useAppSelector((state) =>
    selectIsOverlayOpen(state, "agentSkillsWindow"),
  );

  const totalCount =
    skillConfig.included.length +
    skillConfig.listed.length +
    skillConfig.forbidden.length;

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("relative h-7 w-7", isOpen && "bg-accent")}
      onClick={() => openSkillsWindow(agentId)}
      title="Skills"
    >
      <Lightbulb className="h-4 w-4" />
      {totalCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-bold leading-none text-primary-foreground">
          {totalCount > 9 ? "9+" : totalCount}
        </span>
      )}
    </Button>
  );
}
