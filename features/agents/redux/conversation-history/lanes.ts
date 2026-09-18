/**
 * Conversation lanes — the five independent on/off gates at the top of every
 * filterable conversation-history surface: Chat | Matrx | Auto | Plugins |
 * Subagents (Arman, 2026-09-18).
 *
 * The lane is decided in the DATABASE, once, by `chat.conversation_lane(...)`
 * (migrations/chat_conversation_lane_classifier.sql), exposed to PostgREST as
 * the computed field `lane` on `chat.conversation`. The list query filters
 * `.in("lane", enabledLanes)` server-side; the facet RPC
 * `get_cx_conversation_lane_facets` returns each (app, feature) facet WITH its
 * lane so the source tree only lists sources inside the enabled lanes.
 *
 * The lanes are an AND gate ABOVE the source tree: nothing the tree does
 * ("Select all", presets, "Defaults", "only") can re-admit a lane that is off.
 * `buildHistoryFilterSpec` (thunks) is the single place that proves it.
 */

import type { LucideIcon } from "lucide-react";
import { Bot, MessageSquare, Puzzle, Timer, Workflow } from "lucide-react";

export type ConversationLane = "chat" | "matrx" | "auto" | "plugin" | "subagent";

/** Display order — exactly the order Arman named them. */
export const CONVERSATION_LANES: readonly ConversationLane[] = [
  "chat",
  "matrx",
  "auto",
  "plugin",
  "subagent",
];

export interface LaneMeta {
  label: string;
  icon: LucideIcon;
  /** Tooltip — what lands in this lane. */
  description: string;
}

export const LANE_META: Record<ConversationLane, LaneMeta> = {
  chat: {
    label: "Chat",
    icon: MessageSquare,
    description: "Chats you started with an agent you picked",
  },
  matrx: {
    label: "Matrx",
    icon: Workflow,
    description: "Everything else you started in AI Matrx",
  },
  auto: {
    label: "Auto",
    icon: Timer,
    description: "Scheduled, workflow, system and automatic runs",
  },
  plugin: {
    label: "Plugins",
    icon: Puzzle,
    description: "Mirrored from Claude Code, Codex, Cursor and VS Code",
  },
  subagent: {
    label: "Subagents",
    icon: Bot,
    description: "Sub-agents spawned by an agent or a plugin",
  },
};

/** What a viewer sees before they ever touch a toggle. */
export const DEFAULT_CONVERSATION_LANES: readonly ConversationLane[] = [
  "chat",
  "matrx",
];

export function isConversationLane(value: unknown): value is ConversationLane {
  return (
    typeof value === "string" &&
    (CONVERSATION_LANES as readonly string[]).includes(value)
  );
}

/**
 * Normalizes a stored lane list: drops unknown values, dedupes, and returns
 * it in display order. `undefined`/non-array (never chosen) → the default.
 * An EMPTY array is a real choice (every lane off) and is kept.
 */
export function normalizeLanes(value: unknown): ConversationLane[] {
  if (!Array.isArray(value)) return [...DEFAULT_CONVERSATION_LANES];
  const set = new Set(value.filter(isConversationLane));
  return CONVERSATION_LANES.filter((l) => set.has(l));
}

/** Toggles one lane, keeping display order. */
export function toggleLane(
  lanes: readonly ConversationLane[],
  lane: ConversationLane,
): ConversationLane[] {
  const set = new Set(lanes);
  if (set.has(lane)) set.delete(lane);
  else set.add(lane);
  return CONVERSATION_LANES.filter((l) => set.has(l));
}

/**
 * Lane of a conversation the CLIENT just minted (the live-upsert path, before
 * any fetch has read the server's `lane`). A client-minted row is a person's
 * run from a product surface — never a sub-agent, plugin mirror or automation
 * — so it is Chat when its feature is a chat surface, else Matrx. This list
 * MUST equal the chat arm of `chat.conversation_lane` (same migration file).
 */
export const CHAT_LANE_FEATURES: readonly string[] = [
  "chat",
  "agent-runner",
  "agent-builder",
  "agent-app",
  "agent-comparison",
  "agent-generator",
  "agents-other",
  "voice-agent",
];

export function laneOfClientMintedRow(
  sourceFeature: string | null | undefined,
): ConversationLane {
  return sourceFeature && CHAT_LANE_FEATURES.includes(sourceFeature)
    ? "chat"
    : "matrx";
}
