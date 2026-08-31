"use client";

/**
 * agent-actions — the shared "Agent" identity section for context-menu-v3.
 *
 * Every floating window that operates on ONE agent (memory, skills, test
 * cases, connections, run history, find-usages, prompt preview, …) needs the
 * same handful of agent-level actions. Before this file each surface either
 * had nothing (a right-click fell through to the page underneath — the
 * classic "no menu of its own" defect for windows) or reimplemented a copy
 * (AgentContentWindow's inline "agent-advanced-editor" section, AgentDebugWindow's
 * bare "Copy agent ID" button). This is the ONE builder — grow it here, never
 * fork a sibling for the same identity (SECTIONS.md § THE ADOPTION PROTOCOL).
 *
 * Usage:
 *
 *   const section = useAgentMenuSection({
 *     agentId,
 *     agentName,
 *     onRefresh: () => dispatch(fetchFullAgent(agentId)),
 *     onOpenBuilder: () => openAgentContentWindow({ initialAgentId: agentId }),
 *   });
 *
 * 🚨 Agent-disclosure: this section is about the SUBJECT agent these windows
 * already edit/inspect — it is not an "Agents" roster or Bind affordance, so
 * it never runs afoul of the agent-native-surface law.
 */

import { Cpu, Copy, RefreshCw, ExternalLink } from "lucide-react";
import { toast } from "@/lib/toast";
import type {
  ContextMenuEntityRef,
  ContextMenuExtraSection,
} from "@/features/context-menu-v3/types";
import {
  withAvailability,
  type AvailabilityMap,
} from "@/features/context-menu-v3/utils/availability";

/** The `[CONTEXT_MENU_ENTITY_KEY]` value every agent-scoped window should pass. */
export function agentEntityRef(
  agentId: string,
  agentName?: string | null,
): ContextMenuEntityRef {
  return {
    type: "agent",
    id: agentId,
    title: agentName?.trim() || "Agent",
    resourceType: "agent",
  };
}

export interface AgentMenuSectionArgs {
  agentId: string;
  agentName?: string | null;
  /** Re-fetch this agent's full definition from the server. Omit to disable. */
  onRefresh?: () => void;
  /** Open this agent in its own advanced editor window. Omit to disable. */
  onOpenBuilder?: () => void;
  /** Per-surface `unavailableHere(...)` / `needs(...)` map — see SECTIONS.md. */
  unavailable?: AvailabilityMap;
}

export function useAgentMenuSection({
  agentId,
  agentName,
  onRefresh,
  onOpenBuilder,
  unavailable,
}: AgentMenuSectionArgs): ContextMenuExtraSection {
  const section: ContextMenuExtraSection = {
    id: "agent",
    label: "Agent",
    icon: Cpu,
    items: [
      {
        kind: "item",
        id: "agent-copy-id",
        label: "Copy agent ID",
        icon: Copy,
        onSelect: () => {
          void navigator.clipboard.writeText(agentId);
          toast.success("Agent ID copied");
        },
      },
      {
        kind: "item",
        id: "agent-copy-name",
        label: "Copy agent name",
        icon: Copy,
        disabled: !agentName,
        onSelect: () => {
          void navigator.clipboard.writeText(agentName ?? "");
          toast.success("Agent name copied");
        },
      },
      { kind: "separator", id: "agent-sep-1" },
      {
        kind: "item",
        id: "agent-open-builder",
        label: "Open in builder",
        icon: ExternalLink,
        disabled: !onOpenBuilder,
        onSelect: () => onOpenBuilder?.(),
      },
      {
        kind: "item",
        id: "agent-refresh",
        label: "Refresh agent data",
        icon: RefreshCw,
        disabled: !onRefresh,
        onSelect: () => onRefresh?.(),
      },
    ],
  };
  return unavailable ? withAvailability(section, unavailable) : section;
}
