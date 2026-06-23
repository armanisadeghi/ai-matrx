/**
 * ProTextarea "…" menu agent actions — shared ids, labels, and copy.
 * Each action runs an agent over the field text; Apply replaces the textarea value.
 */

import type { SessionContextItem } from "@/features/transcript-studio/types";
import { DEFAULT_NEW_CHAT_AGENT_ID } from "@/features/agents/components/chat/chat-quick-actions.config";

/** Placeholder default for "Help with this…" until a dedicated surface role ships. */
export const PRO_TEXTAREA_HELP_DEFAULT_AGENT_ID = DEFAULT_NEW_CHAT_AGENT_ID;

export type ProTextareaAgentActionId = "cleanup" | "help" | "customAgent";

/** Popover view state for ProTextarea's "…" menu. */
export type ProTextareaMenuMode = "menu" | ProTextareaAgentActionId | "boundAgent";

export function isProTextareaAgentActionId(
  mode: ProTextareaMenuMode,
): mode is ProTextareaAgentActionId {
  return mode !== "menu" && mode !== "boundAgent";
}

export interface ProTextareaAgentActionDefinition {
  id: ProTextareaAgentActionId;
  menuLabel: string;
  popoverTitle: string;
  /** When true, the action menu refuses to open without field text (Clean up). */
  requiresSourceText: boolean;
  emptyTextToast: string;
  chooseAgentToast: string;
  applySuccessToast: string;
  resolveDefaultAgentId: (ctx: ProTextareaAgentActionContext) => string | null;
}

export interface ProTextareaAgentActionContext {
  cleanupAgentId?: string | null;
  cleanupSurfaceAgentId?: string | null;
  helpAgentId?: string | null;
  customAgentId?: string | null;
}

export interface ProTextareaAgentActionProps {
  /** AI "Clean up" in the "…" menu. ON by default. */
  enableCleanup?: boolean;
  cleanupAgentId?: string | null;
  cleanupContextItems?: SessionContextItem[];
  /** "Help with this…" — general-purpose agent assist. OFF by default. */
  enableHelpWithThis?: boolean;
  /** Override the help default (General Chat placeholder until filtered). */
  helpAgentId?: string | null;
  helpContextItems?: SessionContextItem[];
  /** "Custom Agent" — same flow, separate menu entry for a future agent filter. */
  enableCustomAgent?: boolean;
  customAgentId?: string | null;
  customAgentContextItems?: SessionContextItem[];
}

export const PRO_TEXTAREA_AGENT_ACTIONS: Record<
  ProTextareaAgentActionId,
  ProTextareaAgentActionDefinition
> = {
  cleanup: {
    id: "cleanup",
    menuLabel: "Clean up",
    popoverTitle: "Clean up",
    requiresSourceText: true,
    emptyTextToast: "Add some text before cleaning it up",
    chooseAgentToast: "Choose a cleanup agent first",
    applySuccessToast: "Cleaned text applied",
    resolveDefaultAgentId: (ctx) =>
      ctx.cleanupAgentId ?? ctx.cleanupSurfaceAgentId ?? null,
  },
  help: {
    id: "help",
    menuLabel: "Help with this…",
    popoverTitle: "Help with this…",
    requiresSourceText: false,
    emptyTextToast: "Add some text before asking for help",
    chooseAgentToast: "Choose an agent first",
    applySuccessToast: "Agent response applied",
    resolveDefaultAgentId: (ctx) =>
      ctx.helpAgentId ?? PRO_TEXTAREA_HELP_DEFAULT_AGENT_ID,
  },
  customAgent: {
    id: "customAgent",
    menuLabel: "Custom Agent",
    popoverTitle: "Custom Agent",
    requiresSourceText: false,
    emptyTextToast: "Add some text before running an agent",
    chooseAgentToast: "Choose an agent first",
    applySuccessToast: "Agent response applied",
    resolveDefaultAgentId: (ctx) => ctx.customAgentId ?? null,
  },
};

export function isEmbeddedProTextareaAgentAction(
  id: ProTextareaAgentActionId,
): boolean {
  return id === "help" || id === "customAgent";
}

export function isProTextareaAgentActionEnabled(
  id: ProTextareaAgentActionId,
  props: Pick<
    ProTextareaAgentActionProps,
    "enableCleanup" | "enableHelpWithThis" | "enableCustomAgent"
  >,
): boolean {
  switch (id) {
    case "cleanup":
      return props.enableCleanup !== false;
    case "help":
      return props.enableHelpWithThis === true;
    case "customAgent":
      return props.enableCustomAgent === true;
    default:
      return false;
  }
}
