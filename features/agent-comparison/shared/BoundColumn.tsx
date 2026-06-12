"use client";

/**
 * BoundColumn
 *
 * The single per-conversation rendering surface used by every comparison
 * mode (model, settings, tools, tuning, system-prompt, request-mod,
 * variations, and the open battle).
 *
 * ⚠️ This is NOT a separate display system. It is a THIN wrapper around the
 * canonical `AgentConversationColumn` — the exact same transcript / streaming
 * / Creator Panel / input surface used by `/agents/[id]/run`, `/build`, and
 * `/chat`. Battle only layers two small deltas on top:
 *
 *   • addition  — `ResponseFeedbackBar`, mounted INSIDE the scroll area
 *                 (via the `afterMessages` slot) so it sits directly under
 *                 the last assistant response.
 *   • exclusion — `hideInput` for locked-input modes, where the user types
 *                 the shared message once in the page-level locked section.
 *
 * Everything else (the streaming bubble, auto-scroll, scroll-to-bottom,
 * older-history pagination, Creator Panel telemetry, UI-first tools) comes
 * from the canonical component for free. Do NOT re-implement any of that
 * here — any future change to the results display must flow through
 * `AgentConversationColumn` so all battle modes inherit it automatically.
 */

import { AgentConversationColumn } from "@/features/agents/components/shared/AgentConversationColumn";
import { ResponseFeedbackBar } from "../components/ResponseFeedbackBar";

export interface BoundColumnProps {
  conversationId: string;
  surfaceKey: string;
  /**
   * When true, hide the SmartAgentInput. Used by locked-input modes
   * (Model, Settings, Tools, Tuning, System Prompt) where the page-level
   * top section owns the input and the per-column area is read-only.
   */
  hideInput?: boolean;
  /**
   * When true, hide the CreatorRunPanel chrome. Locked-input modes typically
   * keep it visible for telemetry; some focused modes may want a cleaner
   * column body.
   */
  hideCreatorPanel?: boolean;
}

export function BoundColumn({
  conversationId,
  surfaceKey,
  hideInput = false,
  hideCreatorPanel = false,
}: BoundColumnProps) {
  return (
    <AgentConversationColumn
      conversationId={conversationId}
      surfaceKey={surfaceKey}
      constrainWidth
      hideInput={hideInput}
      hideCreatorPanel={hideCreatorPanel}
      afterMessages={<ResponseFeedbackBar conversationId={conversationId} />}
      smartInputProps={{
        sendButtonVariant: "blue",
        showSubmitOnEnterToggle: true,
      }}
    />
  );
}
