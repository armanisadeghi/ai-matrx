"use client";

import React, { useState, useCallback, useMemo } from "react";
import {
  ChevronDown,
  ChevronLeft,
  Boxes,
  Search,
  BookOpen,
  Code,
  Image,
  MessageCircle,
  Newspaper,
  Lightbulb,
  Video,
  BarChart,
  ChefHat,
  Atom,
} from "lucide-react";
import type { AgentConfig } from "@/features/cx-chat/types/agents";

// ============================================================================
// TYPES
// ============================================================================

interface AgentOption {
  id: string;
  name: string;
  description?: string;
  icon?: React.ReactNode;
  promptId: string;
  variableDefaults?: AgentConfig["variableDefaults"];
}

interface AgentSelectorProps {
  agents: AgentOption[];
  selectedAgent: AgentOption | null;
  onSelect: (agent: AgentOption) => void;
  disabled?: boolean;
}

// ============================================================================
// DEFAULT AGENTS
// ============================================================================

export const DEFAULT_AGENTS: AgentOption[] = [
  {
    id: "general-chat",
    name: "General Chat",
    description: "Helpful general assistant.",
    icon: <MessageCircle size={18} />,
    promptId: "6b6b4e45-4699-4860-8dea-d8a60e07d69a",
    variableDefaults: [],
  },
  {
    id: "custom-chat",
    name: "Custom Chat",
    description: "A warm, chatty assistant with customizable model & settings.",
    icon: <Atom size={18} />,
    promptId: "3ca61863-43cf-49cd-8da5-7e0a4b192867",
    variableDefaults: [],
  },
  {
    id: "deep-research",
    name: "Deep Research",
    description: "In-depth research and analysis.",
    icon: <Search size={18} />,
    promptId: "f76a6b8f-b720-4730-87de-606e0bfa0e0c",
    variableDefaults: [
      {
        name: "topic",
        defaultValue: "",
        required: false,
        helpText: "The topic to research",
        customComponent: {
          type: "textarea",
        },
      },
    ],
  },
  {
    id: "balanced-news-analysis",
    name: "Balanced News",
    description: "Get balanced, multi-perspective analysis of any news topic.",
    icon: <Newspaper size={18} />,
    promptId: "35461e07-bbd1-46cc-81a7-910850815703",
    variableDefaults: [
      {
        name: "topic",
        defaultValue: "",
        required: true,
        helpText: "Enter any news topic or recent news clip or data",
        customComponent: {
          type: "textarea",
        },
      },
    ],
  },
  {
    id: "get-ideas",
    name: "Get Ideas",
    description: "Generate creative, actionable ideas tailored to your needs.",
    icon: <Lightbulb size={18} />,
    promptId: "fc8fd18c-9324-48ca-85d4-faf1b1954945",
    variableDefaults: [
      {
        name: "topic",
        defaultValue: "Building a powerful ai app for attorneys",
        required: true,
        helpText: "What topic or concept do you want ideas for?",
        customComponent: {
          type: "textarea",
        },
      },
      {
        name: "creativity_level",
        defaultValue: "Balanced - Mix of practical and innovative",
        required: false,
        helpText: "How creative do you want to get?",
        customComponent: {
          type: "radio",
          options: [
            "Grounded - Practical and immediately actionable",
            "Balanced - Mix of practical and innovative",
            "Experimental - Push boundaries and explore wild ideas",
            "Visionary - Think big, ignore current constraints",
          ],
          allowOther: false,
        },
      },
      {
        name: "idea_count",
        defaultValue: "10-15 (Standard set)",
        required: false,
        helpText: "How many ideas would you like?",
        customComponent: {
          type: "radio",
          options: [
            "5-8 (Quick brainstorm)",
            "10-15 (Standard set)",
            "20-30 (Comprehensive exploration)",
            "As many as possible",
          ],
          allowOther: true,
        },
      },
    ],
  },
];

// ============================================================================
// AGENT SELECTOR COMPONENT
// ============================================================================

export function AgentSelector({
  agents,
  selectedAgent,
  onSelect,
  disabled,
}: AgentSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = useCallback(
    (agent: AgentOption) => {
      onSelect(agent);
      setIsOpen(false);
    },
    [onSelect],
  );

  const displayAgents = agents.length > 0 ? agents : DEFAULT_AGENTS;
  const selected = selectedAgent || displayAgents[0];

  return (
    <div className="relative">
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl bg-muted border border-border hover:bg-accent transition-colors ${
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
        }`}
      >
        <div className="flex items-center gap-2">
          {selected.icon || <Boxes size={18} />}
          <span className="text-sm font-medium text-foreground">
            {selected.name}
          </span>
        </div>
        <ChevronDown
          size={16}
          className={`text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown */}
          <div className="absolute top-full left-0 mt-2 w-72 max-h-96 overflow-y-auto bg-popover rounded-xl border border-border shadow-lg z-50">
            <div className="p-2">
              {displayAgents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => handleSelect(agent)}
                  className={`w-full flex items-start gap-3 p-3 rounded-lg hover:bg-accent transition-colors text-left ${
                    selected.id === agent.id
                      ? "bg-blue-50 dark:bg-blue-900/20"
                      : ""
                  }`}
                >
                  <div className="flex-shrink-0 mt-0.5 text-muted-foreground">
                    {agent.icon || <Boxes size={18} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground">
                      {agent.name}
                    </div>
                    {agent.description && (
                      <div className="text-xs text-muted-foreground dark:text-gray-400 mt-0.5 line-clamp-2">
                        {agent.description}
                      </div>
                    )}
                  </div>
                  {selected.id === agent.id && (
                    <div className="flex-shrink-0">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// RESPONSE MODE BUTTONS (matches authenticated chat style)
// ============================================================================

/**
 * Maps each response mode to a system agent ID.
 * Modes with an agentId will switch the active agent when clicked.
 * Modes without an agentId are placeholders for future functionality.
 */
export const RESPONSE_MODE_AGENT_MAP: Record<string, string | null> = {
  text: "ce7c5e71-cbdc-4ed1-8dd9-a7eac930b6b8",
  images: "ce7c5e71-cbdc-4ed1-8dd9-a7eac930b6b8",
  videos: "7def859b-6bdc-4867-9471-4b2de7a7e2f7",
  research: "7a90bace-1c2b-4d40-829d-b6d875573324",
  brainstorm: "01120af5-5511-4fe7-a4f2-586db6f05a4e",
  data: "f76a6b8f-b720-4730-87de-606e0bfa0e0c",
  recipe: null,
  code: null,
};

// Reverse map: agentId → modeId for deriving active state from selected agent
const AGENT_TO_MODE: Record<string, string> = {};
for (const [modeId, agentId] of Object.entries(RESPONSE_MODE_AGENT_MAP)) {
  if (agentId && !AGENT_TO_MODE[agentId]) {
    AGENT_TO_MODE[agentId] = modeId;
  }
}

const RESPONSE_MODES = [
  { id: "text", label: "Text", icon: <MessageCircle size={16} /> },
  { id: "images", label: "Images", icon: <Image size={16} /> },
  { id: "videos", label: "Videos", icon: <Video size={16} /> },
  { id: "research", label: "Research", icon: <Search size={16} /> },
  { id: "brainstorm", label: "Brainstorm", icon: <Lightbulb size={16} /> },
  { id: "data", label: "Data", icon: <BarChart size={16} /> },
  { id: "recipe", label: "Recipe", icon: <ChefHat size={16} /> },
  { id: "code", label: "Code", icon: <Code size={16} /> },
] as const;

interface ResponseModeButtonsProps {
  disabled?: boolean;
  /** The currently selected agent's promptId — used to derive active mode */
  selectedAgentId?: string | null;
  /** Called when a mode button is clicked. Receives modeId and mapped agentId. */
  onModeSelect?: (modeId: string, agentId: string | null) => void;
}

export function ResponseModeButtons({
  disabled,
  selectedAgentId,
  onModeSelect,
}: ResponseModeButtonsProps) {
  // Derive active mode from the selected agent instead of local state
  const activeMode = useMemo(() => {
    if (!selectedAgentId) return "text";
    return AGENT_TO_MODE[selectedAgentId] || null;
  }, [selectedAgentId]);

  const handleSelect = (modeId: string) => {
    if (disabled) return;
    const agentId = RESPONSE_MODE_AGENT_MAP[modeId];
    if (agentId) {
      onModeSelect?.(modeId, agentId);
    }
  };

  return (
    <div className="flex flex-wrap justify-center gap-1 md:gap-1.5">
      {RESPONSE_MODES.map((mode) => {
        const agentId = RESPONSE_MODE_AGENT_MAP[mode.id];
        const isActive = activeMode === mode.id;
        const isMapped = agentId !== null;
        return (
          <button
            key={mode.id}
            onClick={() => handleSelect(mode.id)}
            disabled={disabled || !isMapped}
            className={`py-1 px-2.5 rounded-full flex items-center gap-1 border text-xs transition-colors ${
              isActive
                ? "bg-zinc-300 dark:bg-zinc-600 text-gray-800 dark:text-gray-200 border-zinc-300 dark:border-zinc-700"
                : isMapped
                  ? "text-gray-800 dark:text-gray-300 hover:bg-zinc-300 dark:hover:bg-zinc-700 border-zinc-300 dark:border-zinc-700"
                  : "text-gray-400 dark:text-gray-600 border-zinc-200 dark:border-zinc-800 cursor-not-allowed"
            } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <span className={isActive ? "text-yellow-500" : ""}>
              {mode.icon}
            </span>
            <span className="pr-0.5">{mode.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// BACK BUTTON — navigates back to the starting welcome screen
// ============================================================================

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

export default AgentSelector;
