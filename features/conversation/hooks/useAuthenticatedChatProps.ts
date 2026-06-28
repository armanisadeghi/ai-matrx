"use client";

/**
 * useAuthenticatedChatProps — Derives UnifiedChatWrapper props for authenticated routes.
 *
 * Bridges authenticated route state (full feature set, model picker, TTS, resources)
 * into the props shape that UnifiedChatWrapper expects.
 *
 * Usage:
 * ```tsx
 * function AuthChatView({ agentId }: { agentId: string }) {
 *     const chatProps = useAuthenticatedChatProps({ agentId, showModelPicker: true });
 *     return <UnifiedChatWrapper {...chatProps} />;
 * }
 * ```
 */

import { useCallback, useMemo } from "react";
import type { UnifiedChatWrapperProps } from "@/features/cx-conversation/UnifiedChatWrapper";
import type {
  ApiMode,
  ChatModeConfig,
} from "../_legacy-stubs";
import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";

export interface AuthenticatedChatPropsConfig {
  /** Agent/prompt ID */
  agentId: string;
  /** API mode (defaults to 'agent') */
  apiMode?: ApiMode;
  /** Existing conversation ID to continue */
  conversationId?: string;
  /** Chat mode config for stateless chat */
  chatModeConfig?: ChatModeConfig;
  /** Agent display name */
  agentName?: string;
  /** Variable definitions */
  variableDefaults?: VariableDefinition[];
  /** Pre-filled variable values */
  variables?: Record<string, string>;
  /** Whether variables must be completed */
  requiresVariableReplacement?: boolean;
  /** Model override for agent mode */
  modelOverride?: string;
  /** Layout mode override */
  layout?: "full" | "embedded" | "compact";

  // Feature toggles (all default to true for authenticated)
  showVoice?: boolean;
  showResourcePicker?: boolean;
  showModelPicker?: boolean;
  showVariables?: boolean;
  enableCanvas?: boolean;

  // Callbacks
  onConversationIdChange?: (conversationId: string) => void;
  onClose?: () => void;

  // Slots
  sidebarSlot?: React.ReactNode;
  headerSlot?: React.ReactNode;
  footerSlot?: React.ReactNode;
}

export function useAuthenticatedChatProps(
  config: AuthenticatedChatPropsConfig,
): UnifiedChatWrapperProps {
  const {
    agentId,
    apiMode = "agent",
    conversationId,
    chatModeConfig,
    agentName,
    variableDefaults,
    variables,
    requiresVariableReplacement,
    modelOverride,
    layout = "full",
    showVoice = true,
    showResourcePicker = true,
    showModelPicker = false,
    showVariables,
    enableCanvas = false,
    onConversationIdChange,
    onClose,
    sidebarSlot,
    headerSlot,
    footerSlot,
  } = config;

  const handleConversationIdChange = useCallback(
    (id: string) => {
      onConversationIdChange?.(id);
    },
    [onConversationIdChange],
  );

  return useMemo(
    (): UnifiedChatWrapperProps => ({
      agentId,
      apiMode,
      conversationId,
      loadHistory: !!conversationId,
      chatModeConfig,
      authenticated: true,
      layout,
      title: agentName,
      onClose,

      // Full feature set for authenticated users
      showVoice,
      showResourcePicker,
      showModelPicker,
      showVariables: showVariables ?? !!variableDefaults?.length,
      enableCanvas,

      // Agent config
      variableDefaults,
      variables,
      requiresVariableReplacement,
      modelOverride,

      // Slots
      sidebarSlot,
      headerSlot,
      footerSlot,

      // Callbacks
      onConversationIdChange: handleConversationIdChange,
    }),
    [
      agentId,
      apiMode,
      conversationId,
      chatModeConfig,
      agentName,
      layout,
      showVoice,
      showResourcePicker,
      showModelPicker,
      showVariables,
      enableCanvas,
      variableDefaults,
      variables,
      requiresVariableReplacement,
      modelOverride,
      onClose,
      sidebarSlot,
      headerSlot,
      footerSlot,
      handleConversationIdChange,
    ],
  );
}
