// components/admin/debug/debugModuleRegistry.tsx

import {
  LucideIcon,
  ShieldCheck,
  MessageSquare,
  FileCode2,
  Server,
} from "lucide-react";
import TokenStatusDebug from "./TokenStatusDebug";
import ChatDebug from "./ChatDebug";
import AgentAssistantMarkdownDebugModule from "./AgentAssistantMarkdownDebugModule";
import CodeWorkspaceDebug from "./CodeWorkspaceDebug";
import { ComponentType } from "react";

/**
 * Debug Module Definition
 *
 * Each debug module represents a specific area of the application
 * that can be inspected/debugged through the Admin Indicator
 */
export interface DebugModule {
  id: string;
  name: string;
  icon: LucideIcon;
  component: ComponentType;
  description: string;
  color?: string; // Optional custom color for the icon
}

/**
 * Debug Module Registry
 *
 * To add a new debug module:
 * 1. Create your debug component in components/admin/debug/
 * 2. Import it here
 * 3. Add a new entry to this array with:
 *    - Unique id
 *    - Display name
 *    - Lucide icon
 *    - Your component
 *    - Brief description
 *
 * That's it! The icon will automatically appear in the Admin Indicator
 */
export const debugModules: DebugModule[] = [
  {
    id: "auth",
    name: "Authentication",
    icon: ShieldCheck,
    component: TokenStatusDebug,
    description: "Monitor token refresh status and session expiry",
    color: "text-green-500",
  },
  {
    id: "chat",
    name: "Chat Session",
    icon: MessageSquare,
    component: ChatDebug,
    description:
      "Live state of the active chat session, agent config, and recent API calls",
    color: "text-blue-400",
  },
  {
    id: "agent-assistant-markdown",
    name: "Agent MD sink",
    icon: FileCode2,
    component: AgentAssistantMarkdownDebugModule,
    description:
      "Opens a window with source vs draft markdown (edits from assistant bubbles, debug sink)",
    color: "text-amber-400",
  },
  {
    id: "code-workspace",
    name: "Code workspace",
    icon: Server,
    component: CodeWorkspaceDebug,
    description:
      "Sandbox connection state, proxy_url, AI binding verdict, and raw orchestrator payload",
    color: "text-emerald-400",
  },
];

/**
 * Get a debug module by ID
 */
export const getDebugModule = (id: string): DebugModule | undefined => {
  return debugModules.find((module) => module.id === id);
};

/**
 * Check if a debug module exists
 */
export const hasDebugModule = (id: string): boolean => {
  return debugModules.some((module) => module.id === id);
};
