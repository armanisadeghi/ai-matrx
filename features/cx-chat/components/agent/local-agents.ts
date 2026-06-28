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
