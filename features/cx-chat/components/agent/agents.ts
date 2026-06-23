// app/(ssr)/demos/chat/_lib/agents.ts
//
// Hardcoded agent data for server-side rendering.
// This avoids any DB call for the initial render. The client will
// hydrate the full agent config from the database after mount.

import type { WelcomeAgent } from "@/features/cx-chat/components/ChatWelcomeServer";

export const DEFAULT_AGENT_ID = "ce7c5e71-cbdc-4ed1-8dd9-a7eac930b6b8";

export const MATRX_CHAT_AGENT: WelcomeAgent = {
  promptId: "ce7c5e71-cbdc-4ed1-8dd9-a7eac930b6b8",
  name: "Matrx Chat",
  description: "Fully customizable agent.",
  variableDefaults: [
    {
      name: "tone",
      defaultValue: "Professional",
      customComponent: {
        type: "radio",
        options: [
          "Professional",
          "Casual",
          "Friendly",
          "Academic",
          "Empathetic",
          "Technical",
        ],
        allowOther: true,
      },
    },

    {
      name: "response_length",
      defaultValue: "Standard/Balanced",
      customComponent: {
        type: "radio",
        options: [
          "Concise/Brief",
          "Standard/Balanced",
          "Detailed/Comprehensive",
        ],
        allowOther: false,
      },
    },

    {
      name: "use_emojis",
      defaultValue: "Sometimes",
      customComponent: {
        type: "radio",
        options: ["Never", "Rarely", "Sometimes", "Frequently"],
        allowOther: false,
      },
    },

    {
      name: "follow_up_questions",
      defaultValue: "Yes - When Needed",
      customComponent: {
        type: "radio",
        options: [
          "Yes - Proactively",
          "Yes - When Needed",
          "No - Only Answer Directly",
        ],
        allowOther: false,
      },
    },

    {
      name: "formatting_style",
      defaultValue: "Moderate Formatting",
      customComponent: {
        type: "radio",
        options: [
          "Minimal Formatting",
          "Moderate Formatting",
          "Rich Formatting with Headers/Lists",
        ],
        allowOther: false,
      },
    },

    {
      name: "explanation_level",
      defaultValue: "Assume General Knowledge",
      customComponent: {
        type: "radio",
        options: [
          "Assume Expert Knowledge",
          "Assume General Knowledge",
          "Explain Like I'm a Beginner",
        ],
        allowOther: false,
      },
    },
  ],
};

/** Hardcoded built-in agents for instant SSR. */
export const BUILTIN_AGENTS: Record<string, WelcomeAgent> = {
  "ce7c5e71-cbdc-4ed1-8dd9-a7eac930b6b8": MATRX_CHAT_AGENT,
  "3ca61863-43cf-49cd-8da5-7e0a4b192867": {
    promptId: "3ca61863-43cf-49cd-8da5-7e0a4b192867",
    name: "Custom Chat",
    description: "A warm, chatty assistant with customizable model & settings.",
    variableDefaults: [],
  },
  "f76a6b8f-b720-4730-87de-606e0bfa0e0c": {
    promptId: "f76a6b8f-b720-4730-87de-606e0bfa0e0c",
    name: "Deep Research",
    description: "In-depth research and analysis.",
    variableDefaults: [{ name: "topic", defaultValue: "", required: false }],
  },
  "35461e07-bbd1-46cc-81a7-910850815703": {
    promptId: "35461e07-bbd1-46cc-81a7-910850815703",
    name: "Balanced News",
    description: "Get balanced, multi-perspective analysis of any news topic.",
    variableDefaults: [],
  },
  "fc8fd18c-9324-48ca-85d4-faf1b1954945": {
    promptId: "fc8fd18c-9324-48ca-85d4-faf1b1954945",
    name: "Get Ideas",
    description: "Generate creative, actionable ideas tailored to your needs.",
    variableDefaults: [],
  },
};

/**
 * Resolve an agent by ID. Returns hardcoded data for built-in agents,
 * or a minimal stub for unknown agents (client will fetch full config).
 */
export function resolveAgentForSSR(agentId: string): WelcomeAgent {
  const builtin = BUILTIN_AGENTS[agentId];
  if (builtin) return builtin;

  // Unknown agent — return a stub. The client island will fetch
  // full config from the database and hydrate the display name.
  return {
    promptId: agentId,
    name: "", // Empty — client will resolve from DB
    description: undefined,
    variableDefaults: [],
  };
}

export function getDefaultAgent(): WelcomeAgent {
  return BUILTIN_AGENTS[DEFAULT_AGENT_ID];
}
