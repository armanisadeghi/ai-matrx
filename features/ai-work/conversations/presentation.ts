// features/ai-work/conversations/presentation.ts
//
// Pure label helpers shared by the /work/conversations table, the audience
// filter, and the provenance panel. Kept out of the column registry so the
// SAME words appear in a table cell, a filter option and a detail row — a
// surface that calls one thing three names is how a user stops trusting it.

import {
  CODING_SESSION_PROVIDER_META,
  type CodingSessionProvider,
} from "@/features/agent-connections/coding-sessions/catalog";
import { formatText } from "@/utils/text/text-case-converter";
import { MACHINE_CONVERSATION_TYPES } from "./types";

/** Plain-language name for a `chat.conversation.conversation_type`. */
export function conversationTypeLabel(value: string | null): string {
  switch (value) {
    case "standard":
      return "Chat";
    case "subagent":
      return "Subagent run";
    case "workflow":
      return "Workflow run";
    case "research":
      return "Research run";
    case "scheduled":
      return "Scheduled run";
    case "podcast":
      return "Podcast build";
    case "hindsight_replay":
      return "Hindsight replay";
    case "auto":
      return "Automatic run";
    case "system":
      return "System run";
    default:
      return value ? formatText(value) : "Unknown";
  }
}

export function isMachineConversationType(value: string | null): boolean {
  return (MACHINE_CONVERSATION_TYPES as readonly string[]).includes(
    value ?? "",
  );
}

/** Plain-language name for `chat.conversation.origin_class`. */
export function originClassLabel(value: string | null): string {
  switch (value) {
    case "human":
      return "Started by a person";
    case "child_agent":
      return "Started by another agent";
    case "scheduled":
      return "Started by a schedule";
    case "workflow":
      return "Started by a workflow";
    case "api":
      return "Started over the API";
    case "system":
      return "Started by the platform";
    case "unknown":
      return "Origin not recorded";
    default:
      return value ? formatText(value) : "Origin not recorded";
  }
}

export function providerLabel(provider: string | null): string | null {
  if (!provider) return null;
  return (
    CODING_SESSION_PROVIDER_META[provider as CodingSessionProvider]?.label ??
    formatText(provider)
  );
}

// ── TITLE PROVENANCE ────────────────────────────────────────────────────────
//
// Arman cannot do a gap analysis while a derived title is indistinguishable
// from the label Claude Code itself shows in its sidebar. `title_source` on the
// binding is the only thing that separates them, so it is stated everywhere the
// title is stated — and the DEFAULT reading is "ours", because that is what an
// unstamped row actually is.

export type TitleProvenance = {
  /** Short chip text beside the title. */
  chip: string;
  /** One sentence a non-technical user can act on. */
  detail: string;
  /** True only when the provider supplied the label. */
  fromProvider: boolean;
};

export function titleProvenance(
  titleSource: string | null,
  provider: string | null,
): TitleProvenance {
  const name = providerLabel(provider);
  // `first_prompt` and NULL both mean AI Matrx derived it. NULL is not
  // "unknown": every stamped row says first_prompt, and the unstamped ones
  // predate the stamp and were derived the same way.
  if (!titleSource || titleSource === "first_prompt") {
    return {
      chip: "AI Matrx title",
      detail: name
        ? `AI Matrx wrote this title from the first prompt. It is NOT the label ${name} shows.`
        : "AI Matrx wrote this title from the first prompt.",
      fromProvider: false,
    };
  }
  if (titleSource === "user") {
    return {
      chip: "Your title",
      detail: "You renamed this conversation. Nothing derived it.",
      fromProvider: false,
    };
  }
  return {
    chip: name ? `${name} title` : "Provider title",
    detail: name
      ? `${name} supplied this title (source: ${titleSource}).`
      : `The provider supplied this title (source: ${titleSource}).`,
    fromProvider: true,
  };
}
