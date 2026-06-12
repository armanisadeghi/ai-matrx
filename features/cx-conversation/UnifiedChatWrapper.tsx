"use client";

/**
 * UnifiedChatWrapper — Single entry point for all chat UIs.
 *
 * This component replaces the need for separate ChatContainer, PromptRunner,
 * ChatWorkspace, etc. It handles:
 *
 * 1. Session lifecycle (via useConversationSession)
 * 2. API mode selection (agent / conversation / chat)
 * 3. Layout (full page, embedded panel, modal)
 * 4. Feature gating via props (auth-gated features, mobile adaptations)
 * 5. Optional sidebar, header, and canvas slots
 *
 * Usage:
 * ```tsx
 * // Agent mode (most common) — server manages state after first message
 * <UnifiedChatWrapper agentId="prompt-uuid" />
 *
 * // Continue existing conversation
 * <UnifiedChatWrapper
 *     agentId="prompt-uuid"
 *     apiMode="conversation"
 *     conversationId="conv-uuid"
 * />
 *
 * // Full client-controlled chat
 * <UnifiedChatWrapper
 *     agentId="custom"
 *     apiMode="chat"
 *     chatModeConfig={{ aiModelId: 'gpt-4o', temperature: 0.7 }}
 * />
 *
 * // Embedded in a side panel (compact, no header)
 * <UnifiedChatWrapper agentId="prompt-uuid" layout="embedded" compact />
 *
 * // Public/unauthenticated (limited features)
 * <UnifiedChatWrapper agentId="prompt-uuid" authenticated={false} />
 * ```
 */

import React, { useMemo } from "react";
import { ConversationShell } from "./ConversationShell";
import type { ConversationInputProps } from "./ConversationInput";
import { useConversationSession } from "./hooks/useConversationSession";
import type {
  ConversationSessionConfig,
  ConversationSessionReturn,
} from "./hooks/useConversationSession";
import type {
  ApiMode,
  ChatModeConfig,
} from "./_legacy-stubs";
import type { PromptVariable } from "@/features/prompts/types/core";

// ============================================================================
// PROPS
// ============================================================================

export interface UnifiedChatWrapperProps {
  // ── Required ─────────────────────────────────────────────────────────────
  /** Agent/Prompt ID */
  agentId: string;

  // ── API Mode ─────────────────────────────────────────────────────────────
  /** API pattern: 'agent' (default), 'conversation', or 'chat' */
  apiMode?: ApiMode;
  /** Pre-existing conversation ID */
  conversationId?: string;
  /** Auto-load conversation history (default: true when conversationId is set) */
  loadHistory?: boolean;
  /** Config for stateless chat mode */
  chatModeConfig?: ChatModeConfig;

  // ── Agent Configuration ──────────────────────────────────────────────────
  /** Variable definitions for agent templates */
  variableDefaults?: PromptVariable[];
  /** Pre-filled variable values */
  variables?: Record<string, string>;
  /** Whether variables must be completed before sending */
  requiresVariableReplacement?: boolean;
  /** Model override */
  modelOverride?: string;

  // ── Layout ───────────────────────────────────────────────────────────────
  /** Layout mode: 'full' (default page), 'embedded' (panel/modal), 'compact' (minimal) */
  layout?: "full" | "embedded" | "compact";
  /** Custom className for the outermost container */
  className?: string;
  /** Title shown in the header */
  title?: string;
  /** Close callback (shows X button in header when provided) */
  onClose?: () => void;
  /** Compact mode for messages and input */
  compact?: boolean;

  // ── Feature Flags ────────────────────────────────────────────────────────
  /** Whether the user is authenticated (controls feature availability) */
  authenticated?: boolean;
  /** Show voice input button */
  showVoice?: boolean;
  /** Show file/resource attachment picker */
  showResourcePicker?: boolean;
  /** Show model picker dropdown */
  showModelPicker?: boolean;
  /** Show variable inputs above textarea */
  showVariables?: boolean;
  /** Show system messages in the message list */
  showSystemMessages?: boolean;
  /** Enable inline canvas (side panel) */
  enableCanvas?: boolean;
  /** Show the submit-on-enter toggle */
  showSubmitOnEnterToggle?: boolean;
  /** Show the shift+enter hint */
  showShiftEnterHint?: boolean;

  // ── Input Configuration ──────────────────────────────────────────────────
  /** Placeholder text for the input */
  placeholder?: string;
  /** Input style: 'guided' or 'classic' variable layout */
  variableMode?: "guided" | "classic";
  /** Send button color variant */
  sendButtonVariant?: "gray" | "blue" | "default";

  // ── Slots ────────────────────────────────────────────────────────────────
  /** Custom header content (rendered next to title) */
  headerSlot?: React.ReactNode;
  /** Sidebar content (rendered to the left of the conversation) */
  sidebarSlot?: React.ReactNode;
  /** Footer content (rendered below the input) */
  footerSlot?: React.ReactNode;

  // ── Callbacks ────────────────────────────────────────────────────────────
  /** Called after each message is sent */
  onSend?: () => void;
  /** Called when conversation ID changes (e.g. after first agent message) */
  onConversationIdChange?: (conversationId: string) => void;
  /** Called with the session ref so parent can access send/cancel imperatively */
  onSessionReady?: (session: ConversationSessionReturn) => void;

  // ── Session Override ─────────────────────────────────────────────────────
  /** Provide a specific session ID (e.g. from URL) instead of auto-generating */
  sessionId?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function UnifiedChatWrapper({
  // Required
  agentId,

  // API Mode
  apiMode = "agent",
  conversationId,
  loadHistory,
  chatModeConfig,

  // Agent Config
  variableDefaults,
  variables,
  requiresVariableReplacement,
  modelOverride,

  // Layout
  layout = "full",
  className,
  title,
  onClose,
  compact: compactProp,

  // Feature Flags
  authenticated = true,
  showVoice = true,
  showResourcePicker = true,
  showModelPicker = false,
  showVariables = false,
  showSystemMessages = false,
  enableCanvas = false,
  showSubmitOnEnterToggle = false,
  showShiftEnterHint = false,

  // Input Config
  placeholder,
  variableMode,
  sendButtonVariant,

  // Slots
  headerSlot,
  sidebarSlot,
  footerSlot,

  // Callbacks
  onSend,
  onConversationIdChange,
  onSessionReady,

  // Session Override
  sessionId: sessionIdProp,
}: UnifiedChatWrapperProps) {
  // ── Session lifecycle ────────────────────────────────────────────────────
  const sessionConfig: ConversationSessionConfig = useMemo(
    () => ({
      agentId,
      apiMode,
      sessionId: sessionIdProp,
      conversationId,
      loadHistory,
      variableDefaults,
      variables,
      requiresVariableReplacement,
      modelOverride,
      chatModeConfig,
    }),
    [
      agentId,
      apiMode,
      sessionIdProp,
      conversationId,
      loadHistory,
      variableDefaults,
      variables,
      requiresVariableReplacement,
      modelOverride,
      chatModeConfig,
    ],
  );

  const session = useConversationSession(sessionConfig);

  // Notify parent of session readiness
  React.useEffect(() => {
    onSessionReady?.(session);
  }, [session.sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Notify parent when conversationId changes
  React.useEffect(() => {
    if (session.conversationId) {
      onConversationIdChange?.(session.conversationId);
    }
  }, [session.conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Layout derivation ────────────────────────────────────────────────────
  const compact = compactProp ?? layout === "compact";
  const seamless = layout === "embedded" || layout === "compact";

  // Gate features based on auth state
  const effectiveShowVoice = authenticated ? showVoice : false;
  const effectiveShowResourcePicker = authenticated
    ? showResourcePicker
    : false;
  const effectiveShowModelPicker = authenticated ? showModelPicker : false;

  // Build input props
  const inputProps: Partial<ConversationInputProps> = {
    showVoice: effectiveShowVoice,
    showResourcePicker: effectiveShowResourcePicker,
    showModelPicker: effectiveShowModelPicker,
    showVariables,
    showSubmitOnEnterToggle,
    showShiftEnterHint,
    seamless,
    compact,
    variableMode,
    sendButtonVariant,
    onSend,
    ...(placeholder ? { placeholder } : {}),
  };

  // ── Container classes ────────────────────────────────────────────────────
  const containerClass = [
    layout === "full" ? "h-[calc(100dvh-2.5rem)]" : "h-full",
    "flex w-full overflow-hidden",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={containerClass}>
      {/* ── Optional sidebar ──────────────────────────────────────── */}
      {sidebarSlot && (
        <div className="flex-shrink-0 border-r border-border overflow-hidden">
          {sidebarSlot}
        </div>
      )}

      {/* ── Main conversation area ───────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <ConversationShell
          sessionId={session.sessionId}
          title={title}
          onClose={onClose}
          compact={compact}
          showSystemMessages={showSystemMessages}
          enableCanvas={enableCanvas}
          inputProps={inputProps}
          headerSlot={headerSlot}
        />

        {/* ── Optional footer slot ─────────────────────────────── */}
        {footerSlot && (
          <div className="flex-shrink-0 border-t border-border">
            {footerSlot}
          </div>
        )}
      </div>
    </div>
  );
}

export default UnifiedChatWrapper;
