"use client";

import React from "react";
import {
  MessageCircle,
  Rainbow,
  Search,
  Newspaper,
  Lightbulb,
} from "lucide-react";
import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";

export interface AgentOption {
  id: string;
  name: string;
  description?: string;
  icon?: React.ReactNode;
  promptId: string;
  variableDefaults?: VariableDefinition[];
}

/**
 * SEED MIRROR of the `chat.default_new_chat` mandate's system default. Runtime
 * paths resolve the mandate (see `features/agents/mandates`); this constant remains
 * only as the demo conversation page's loud-fallback and for the (currently
 * unconsumed) `useInstanceBootstrap` URL-parse fallback.
 */
export const DEFAULT_AGENT_ID = "6b6b4e45-4699-4860-8dea-d8a60e07d69a";

export const DEFAULT_AGENTS: AgentOption[] = [
  {
    id: "general-chat",
    name: "General Chat",
    description: "Helpful general assistant.",
    icon: React.createElement(MessageCircle, { size: 18 }),
    promptId: "6b6b4e45-4699-4860-8dea-d8a60e07d69a",
    variableDefaults: [],
  },
  {
    id: "custom-chat",
    name: "Custom Chat",
    description: "A warm, chatty assistant with customizable model & settings.",
    icon: React.createElement(Rainbow, { size: 18 }),
    promptId: "3ca61863-43cf-49cd-8da5-7e0a4b192867",
    variableDefaults: [],
  },
  {
    id: "deep-research",
    name: "Deep Research",
    description: "In-depth research and analysis.",
    icon: React.createElement(Search, { size: 18 }),
    promptId: "f76a6b8f-b720-4730-87de-606e0bfa0e0c",
    variableDefaults: [
      {
        name: "topic",
        defaultValue: "",
        required: false,
        helpText: "The topic to research",
        customComponent: { type: "textarea" },
      },
    ],
  },
  {
    id: "balanced-news-analysis",
    name: "Balanced News",
    description: "Get balanced, multi-perspective analysis of any news topic.",
    icon: React.createElement(Newspaper, { size: 18 }),
    promptId: "35461e07-bbd1-46cc-81a7-910850815703",
    variableDefaults: [
      {
        name: "topic",
        defaultValue: "",
        required: true,
        helpText: "Enter any news topic or recent news clip or data",
        customComponent: { type: "textarea" },
      },
    ],
  },
  {
    id: "get-ideas",
    name: "Get Ideas",
    description: "Generate creative, actionable ideas tailored to your needs.",
    icon: React.createElement(Lightbulb, { size: 18 }),
    promptId: "fc8fd18c-9324-48ca-85d4-faf1b1954945",
    variableDefaults: [
      {
        name: "topic",
        defaultValue: "Building a powerful ai app for attorneys",
        required: true,
        helpText: "What topic or concept do you want ideas for?",
        customComponent: { type: "textarea" },
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

/** The response-mode strip under the composer, in render order. */
export const RESPONSE_MODES = [
  "text",
  "images",
  "videos",
  "research",
  "brainstorm",
  "data",
  "recipe",
  "code",
] as const;

export type ResponseMode = (typeof RESPONSE_MODES)[number];

/**
 * THE ONE response-mode → MANDATE map (the auto-selector). Shared by the
 * cx-chat strip and public-chat's `ResponseModeButtons` — never duplicate it.
 * A mode maps to a mandate KEY, resolved at render time through
 * `useResponseModeAgents` (system default → the user's binding); `null` marks
 * a placeholder mode with no agent yet. A mode whose mandate cannot resolve
 * (not yet seeded, disabled) renders disabled with the reason — never a
 * silent fallback to a UUID.
 */
export const RESPONSE_MODE_MANDATE_MAP: Readonly<
  Record<ResponseMode, string | null>
> = {
  text: "chat.cx_default",
  images: "chat.cx_default",
  videos: "chat.response_mode_video",
  // D4 (wave 4): research mode has its OWN conversational mandate now — it
  // used to run `research.report` (the pipeline's report generator) with four
  // empty required variables, and kept that mandate's user-text channel
  // pinned open. Never point a chat mode at a pipeline stage again.
  research: "chat.response_mode_research",
  brainstorm: "chat.response_mode_brainstorm",
  data: "chat.response_mode_data",
  recipe: null,
  code: null,
};
