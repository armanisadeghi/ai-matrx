"use client";

/**
 * Public-chat response-mode controls.
 *
 * The retired AgentSelector that previously lived here was an unused,
 * hardcoded second agent roster. Agent choice now belongs exclusively to the
 * canonical AgentListDropdown / AgentListInlinePicker family.
 */

import React from "react";
import {
  BarChart,
  ChefHat,
  ChevronLeft,
  Code,
  Image,
  Lightbulb,
  MessageCircle,
  Search,
  Video,
} from "lucide-react";
import type { ResponseMode } from "@/features/cx-chat/components/agent/local-agents";
import { useResponseModeAgents } from "@/features/cx-chat/components/agent/useResponseModeAgents";

/**
 * Each mode is a MANDATE — the ONE map lives in cx-chat's `local-agents.ts`
 * (`RESPONSE_MODE_MANDATE_MAP`) and resolves for this user through
 * `useResponseModeAgents`. A mode whose mandate cannot resolve is disabled
 * with the reason as its title — never a silent fallback to a hardcoded id.
 */
const RESPONSE_MODE_ICONS: Record<ResponseMode, React.ReactNode> = {
  text: <MessageCircle size={16} />,
  images: <Image size={16} />,
  videos: <Video size={16} />,
  research: <Search size={16} />,
  brainstorm: <Lightbulb size={16} />,
  data: <BarChart size={16} />,
  recipe: <ChefHat size={16} />,
  code: <Code size={16} />,
};

const RESPONSE_MODE_LABELS: Record<ResponseMode, string> = {
  text: "Text",
  images: "Images",
  videos: "Videos",
  research: "Research",
  brainstorm: "Brainstorm",
  data: "Data",
  recipe: "Recipe",
  code: "Code",
};

interface ResponseModeButtonsProps {
  disabled?: boolean;
  /** The currently selected agent's promptId — used to derive active mode. */
  selectedAgentId?: string | null;
  /** Called with the mode id and the mandate-resolved agent id. */
  onModeSelect?: (modeId: string, agentId: string | null) => void;
}

export function ResponseModeButtons({
  disabled,
  selectedAgentId,
  onModeSelect,
}: ResponseModeButtonsProps) {
  const { modes, modeForAgent } = useResponseModeAgents();
  const activeMode = selectedAgentId ? modeForAgent(selectedAgentId) : "text";

  return (
    <div className="flex flex-wrap justify-center gap-1 md:gap-1.5">
      {modes.map((entry) => {
        const isActive = activeMode === entry.mode;
        const isMapped = entry.agentId !== null;
        const unresolved = entry.mandateKey !== null && entry.error !== null;
        return (
          <button
            key={entry.mode}
            onClick={() => {
              if (disabled || !entry.agentId) return;
              onModeSelect?.(entry.mode, entry.agentId);
            }}
            disabled={disabled || !isMapped}
            title={
              unresolved
                ? `Not available yet — no agent is assigned (${entry.mandateKey})`
                : undefined
            }
            className={`py-1 px-2.5 rounded-full flex items-center gap-1 border text-xs transition-colors ${
              isActive
                ? "bg-zinc-300 dark:bg-zinc-600 text-gray-800 dark:text-gray-200 border-zinc-300 dark:border-zinc-700"
                : isMapped
                  ? "text-gray-800 dark:text-gray-300 hover:bg-zinc-300 dark:hover:bg-zinc-700 border-zinc-300 dark:border-zinc-700"
                  : "text-gray-400 dark:text-gray-600 border-zinc-200 dark:border-zinc-800 cursor-not-allowed"
            } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <span className={isActive ? "text-yellow-500" : ""}>
              {RESPONSE_MODE_ICONS[entry.mode]}
            </span>
            <span className="pr-0.5">{RESPONSE_MODE_LABELS[entry.mode]}</span>
          </button>
        );
      })}
    </div>
  );
}

interface BackToStartButtonProps {
  onBack: () => void;
  agentName?: string;
}

export function BackToStartButton({
  onBack,
  agentName,
}: BackToStartButtonProps) {
  return (
    <button
      onClick={onBack}
      className="flex items-center gap-1 px-2 py-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors text-xs"
      title="Back to agent selection"
    >
      <ChevronLeft size={14} />
      <span className="hidden md:inline">{agentName || "Back"}</span>
    </button>
  );
}
